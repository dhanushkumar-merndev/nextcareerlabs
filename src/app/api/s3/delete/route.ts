import { requireAdmin } from "@/app/data/admin/require-admin";
import arcjet, { fixedWindow } from "@/lib/arcjet";
import { deleteS3File } from "@/lib/s3-delete-utils";
import { NextResponse } from "next/server";

const aj = arcjet.withRule(fixedWindow({ mode: "LIVE", window: "1m", max: 5 }));

export async function DELETE(request: Request) {
  const session = await requireAdmin();
  try {
    const decision = await aj.protect(request, {
      fingerprint: session?.user.id as string,
    });
    if (decision.isDenied()) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }
    const body = await request.json();
    const key = decodeURIComponent(body.key);

    if (!key) {
      return NextResponse.json(
        { error: "Invaild Request Body" },
        { status: 400 }
      );
    }

    await deleteS3File(key);

    return NextResponse.json(
      { message: "File deleted successfully" },
      { status: 200 }
    );
  } catch {
    return NextResponse.json(
      { error: "Invaild Request Body" },
      { status: 500 }
    );
  }
}
