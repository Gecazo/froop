export type SessionRecord = {
  id: string;
  createdAt: string;
  deviceName: string;
};

export type PacketRecord = {
  id?: number;
  sessionId: string;
  characteristic: string;
  bytes: number[];
  receivedAt: string;
};

const DB_NAME = "froop";
const DB_VERSION = 1;
const SESSIONS = "sessions";
const PACKETS = "raw_packets";

export async function createSession(deviceName: string): Promise<SessionRecord> {
  const db = await openDb();
  const session: SessionRecord = {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    deviceName,
  };

  await tx(db, SESSIONS, "readwrite", (store) => {
    store.put(session);
  });

  return session;
}

export async function updateSessionDeviceName(
  sessionId: string,
  deviceName: string,
): Promise<void> {
  const db = await openDb();
  const session = await tx(db, SESSIONS, "readonly", (store) =>
    promisifyRequest<SessionRecord | undefined>(store.get(sessionId)),
  );

  if (!session) {
    throw new Error(`Session ${sessionId} was not found.`);
  }

  await tx(db, SESSIONS, "readwrite", (store) => {
    store.put({
      ...session,
      deviceName,
    });
  });
}

export async function storePacket(packet: PacketRecord): Promise<void> {
  const db = await openDb();
  await tx(db, PACKETS, "readwrite", (store) => {
    store.add(packet);
  });
}

export async function countPacketsForSession(sessionId: string): Promise<number> {
  const db = await openDb();
  return tx(db, PACKETS, "readonly", (store) => {
    const index = store.index("by_session");
    return promisifyRequest(index.count(sessionId));
  });
}

export async function exportSession(sessionId: string): Promise<{
  session: SessionRecord | undefined;
  packets: PacketRecord[];
}> {
  const db = await openDb();

  const session = await tx(db, SESSIONS, "readonly", (store) =>
    promisifyRequest<SessionRecord | undefined>(store.get(sessionId)),
  );

  const packets = await tx(db, PACKETS, "readonly", (store) => {
    const index = store.index("by_session");
    return promisifyRequest<PacketRecord[]>(index.getAll(sessionId));
  });

  return { session, packets };
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;

      if (!db.objectStoreNames.contains(SESSIONS)) {
        db.createObjectStore(SESSIONS, { keyPath: "id" });
      }

      if (!db.objectStoreNames.contains(PACKETS)) {
        const packets = db.createObjectStore(PACKETS, {
          keyPath: "id",
          autoIncrement: true,
        });
        packets.createIndex("by_session", "sessionId", { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function tx<T>(
  db: IDBDatabase,
  storeName: string,
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => T | Promise<T>,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, mode);
    const store = transaction.objectStore(storeName);

    Promise.resolve(run(store))
      .then((value) => {
        transaction.oncomplete = () => resolve(value);
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
      })
      .catch(reject);
  });
}

function promisifyRequest<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
