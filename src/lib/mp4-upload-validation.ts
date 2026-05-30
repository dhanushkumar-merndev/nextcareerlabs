export interface Mp4CompatibilityResult {
  valid: boolean;
  videoCodec?: string;
  audioCodec?: string;
  reason?: string;
}

const HEAD_BYTES = 16 * 1024 * 1024;
const TAIL_BYTES = 64 * 1024 * 1024;
const CONTAINER_BOXES = new Set([
  "moov",
  "trak",
  "mdia",
  "minf",
  "stbl",
]);

function readType(view: DataView, offset: number) {
  return String.fromCharCode(
    view.getUint8(offset),
    view.getUint8(offset + 1),
    view.getUint8(offset + 2),
    view.getUint8(offset + 3),
  );
}

async function readSlice(file: File, start: number, end: number) {
  return new DataView(await file.slice(start, end).arrayBuffer());
}

function findTopLevelBox(view: DataView, targetType: string) {
  let offset = 0;

  while (offset + 8 <= view.byteLength) {
    const size32 = view.getUint32(offset);
    const type = readType(view, offset + 4);
    const headerSize = size32 === 1 ? 16 : 8;
    const size =
      size32 === 1
        ? Number(view.getBigUint64(offset + 8))
        : size32 === 0
          ? view.byteLength - offset
          : size32;

    if (size < headerSize || offset + size > view.byteLength) break;
    if (type === targetType) {
      return {
        start: offset + headerSize,
        end: offset + size,
      };
    }

    offset += size;
  }

  return null;
}

function findCompleteBoxByType(view: DataView, targetType: string) {
  for (let typeOffset = 4; typeOffset + 4 <= view.byteLength; typeOffset += 1) {
    if (readType(view, typeOffset) !== targetType) continue;

    const boxStart = typeOffset - 4;
    const size32 = view.getUint32(boxStart);
    const headerSize = size32 === 1 ? 16 : 8;
    const size = size32 === 1 && boxStart + 16 <= view.byteLength
      ? Number(view.getBigUint64(boxStart + 8))
      : size32;

    if (size >= headerSize && boxStart + size <= view.byteLength) {
      return {
        start: boxStart + headerSize,
        end: boxStart + size,
      };
    }
  }

  return null;
}

function collectSampleEntries(
  view: DataView,
  start: number,
  end: number,
  entries: Set<string>,
) {
  let offset = start;

  while (offset + 8 <= end) {
    const size32 = view.getUint32(offset);
    const type = readType(view, offset + 4);
    const headerSize = size32 === 1 ? 16 : 8;
    const size =
      size32 === 1
        ? Number(view.getBigUint64(offset + 8))
        : size32 === 0
          ? end - offset
          : size32;
    const payloadStart = offset + headerSize;
    const boxEnd = offset + size;

    if (size < headerSize || boxEnd > end) break;

    if (type === "stsd" && payloadStart + 8 <= boxEnd) {
      const entryCount = view.getUint32(payloadStart + 4);
      let entryOffset = payloadStart + 8;

      for (let i = 0; i < entryCount && entryOffset + 8 <= boxEnd; i += 1) {
        const entrySize = view.getUint32(entryOffset);
        const entryType = readType(view, entryOffset + 4);
        if (entrySize < 8 || entryOffset + entrySize > boxEnd) break;
        entries.add(entryType);
        entryOffset += entrySize;
      }
    } else if (CONTAINER_BOXES.has(type)) {
      collectSampleEntries(view, payloadStart, boxEnd, entries);
    }

    offset = boxEnd;
  }
}

function parseCodecsFromMoov(view: DataView) {
  const moov = findTopLevelBox(view, "moov") ?? findCompleteBoxByType(view, "moov");
  if (!moov) return null;

  const entries = new Set<string>();
  collectSampleEntries(view, moov.start, moov.end, entries);

  const videoCodec = ["avc1", "avc3"].find((codec) => entries.has(codec));
  const audioCodec = entries.has("mp4a")
    ? "aac"
    : entries.has("Opus")
      ? "opus"
      : ["ac-3", "ec-3", "alac", "mp3 "].find((codec) => entries.has(codec));

  return {
    videoCodec,
    audioCodec,
    entries: [...entries],
  };
}

export async function validateMp4ForFastHls(file: File): Promise<Mp4CompatibilityResult> {
  const head = await readSlice(file, 0, Math.min(file.size, HEAD_BYTES));
  const ftyp = findTopLevelBox(head, "ftyp");

  if (!ftyp && file.type !== "video/mp4") {
    return {
      valid: false,
      reason: "Please upload an MP4 file.",
    };
  }

  let parsed = parseCodecsFromMoov(head);

  if (!parsed && file.size > HEAD_BYTES) {
    const tailStart = Math.max(0, file.size - TAIL_BYTES);
    const tail = await readSlice(file, tailStart, file.size);
    parsed = parseCodecsFromMoov(tail);
  }

  if (!parsed) {
    return {
      valid: false,
      reason: "Could not read MP4 codec metadata. Please export as H.264 video with AAC audio.",
    };
  }

  if (!parsed.videoCodec) {
    return {
      valid: false,
      audioCodec: parsed.audioCodec,
      reason: `Unsupported video codec. Found: ${parsed.entries.join(", ") || "unknown"}. Use H.264.`,
    };
  }

  if (parsed.audioCodec !== "aac") {
    return {
      valid: false,
      videoCodec: "h264",
      audioCodec: parsed.audioCodec,
      reason: `Unsupported audio codec: ${parsed.audioCodec || "unknown"}. Use AAC audio.`,
    };
  }

  return {
    valid: true,
    videoCodec: "h264",
    audioCodec: "aac",
  };
}
