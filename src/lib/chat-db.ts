export interface ChatSession {
  id: string;
  lessonId: string;
  title: string;
  createdAt: number;
  updatedAt: number;
}

export interface ChatMessage {
  id: string;
  sessionId: string;
  role: "user" | "assistant";
  content: string;
  createdAt: number;
}

const DB_NAME = "course-chat";
const DB_VERSION = 1;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("sessions")) {
        const store = db.createObjectStore("sessions", { keyPath: "id" });
        store.createIndex("lessonId", "lessonId", { unique: false });
      }
      if (!db.objectStoreNames.contains("messages")) {
        const store = db.createObjectStore("messages", { keyPath: "id" });
        store.createIndex("sessionId", "sessionId", { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function getSessions(lessonId: string): Promise<ChatSession[]> {
  const db = await openDb();
  const tx = db.transaction("sessions", "readonly");
  const store = tx.objectStore("sessions");
  const index = store.index("lessonId");
  return new Promise((resolve, reject) => {
    const req = index.getAll(lessonId);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    tx.oncomplete = () => db.close();
  });
}

export async function createSession(lessonId: string, title?: string): Promise<ChatSession> {
  const session: ChatSession = {
    id: crypto.randomUUID(),
    lessonId,
    title: title || `Session ${new Date().toLocaleString()}`,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  const db = await openDb();
  const tx = db.transaction("sessions", "readwrite");
  const store = tx.objectStore("sessions");
  return new Promise((resolve, reject) => {
    store.add(session);
    tx.oncomplete = () => { db.close(); resolve(session); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

export async function updateSessionTitle(id: string, title: string): Promise<void> {
  const db = await openDb();
  const tx = db.transaction("sessions", "readwrite");
  const store = tx.objectStore("sessions");
  const req = store.get(id);
  req.onsuccess = () => {
    const session = req.result;
    if (session) {
      session.title = title;
      session.updatedAt = Date.now();
      store.put(session);
    }
  };
  tx.oncomplete = () => db.close();
}

export async function deleteSession(id: string): Promise<void> {
  const db = await openDb();
  const tx1 = db.transaction("sessions", "readwrite");
  tx1.objectStore("sessions").delete(id);
  const tx2 = db.transaction("messages", "readwrite");
  const index = tx2.objectStore("messages").index("sessionId");
  const req = index.openCursor(id);
  req.onsuccess = () => {
    const cursor = req.result;
    if (cursor) {
      cursor.delete();
      cursor.continue();
    }
  };
  await Promise.allSettled([
    new Promise<void>((r) => { tx1.oncomplete = () => { db.close(); r(); }; }),
    new Promise<void>((r) => { tx2.oncomplete = () => { r(); }; }),
  ]);
}

export async function getMessages(sessionId: string): Promise<ChatMessage[]> {
  const db = await openDb();
  const tx = db.transaction("messages", "readonly");
  const store = tx.objectStore("messages");
  const index = store.index("sessionId");
  return new Promise((resolve, reject) => {
    const req = index.getAll(sessionId);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    tx.oncomplete = () => db.close();
  });
}

export async function saveMessage(msg: ChatMessage): Promise<void> {
  const db = await openDb();
  const tx = db.transaction("messages", "readwrite");
  const store = tx.objectStore("messages");
  return new Promise((resolve, reject) => {
    store.add(msg);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

export async function saveMessages(msgs: ChatMessage[]): Promise<void> {
  if (!msgs.length) return;
  const db = await openDb();
  const tx = db.transaction("messages", "readwrite");
  const store = tx.objectStore("messages");
  msgs.forEach((msg) => store.add(msg));
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

export async function updateSessionTimestamp(id: string): Promise<void> {
  const db = await openDb();
  const tx = db.transaction("sessions", "readwrite");
  const store = tx.objectStore("sessions");
  const req = store.get(id);
  req.onsuccess = () => {
    const session = req.result;
    if (session) {
      session.updatedAt = Date.now();
      store.put(session);
    }
  };
  tx.oncomplete = () => db.close();
}
