export type SessionRecord = {
  id: string;
  createdAt: string;
  updatedAt: string;
  deviceName: string;
  status: 'in_progress' | 'completed';
};

export type PacketRecord = {
  id?: number;
  sessionId: string;
  characteristic: string;
  bytes: number[];
  receivedAt: string;
};

export type HistoryReadingRecord = {
  id?: number;
  sessionId: string;
  version: number;
  unixMs: number;
  bpm: number;
  rr: number[];
  receivedAt: string;
};

export type SessionExportPayload = {
  session: SessionRecord | undefined;
  packets: PacketRecord[];
  historyReadings: HistoryReadingRecord[];
};

const DB_NAME = 'froop';
const DB_VERSION = 2;
const SESSIONS = 'sessions';
const PACKETS = 'raw_packets';
const HISTORY_READINGS = 'history_readings';

export const createSession = async (deviceName: string): Promise<SessionRecord> => {
  const db = await openDb();
  const now = new Date().toISOString();
  const session: SessionRecord = {
    id: crypto.randomUUID(),
    createdAt: now,
    updatedAt: now,
    deviceName,
    status: 'in_progress'
  };

  await tx(db, SESSIONS, 'readwrite', (store) => {
    store.put(session);
  });

  return session;
};

export const updateSessionDeviceName = async (
  sessionId: string,
  deviceName: string
): Promise<void> => {
  const db = await openDb();
  const session = await tx(db, SESSIONS, 'readonly', (store) =>
    promisifyRequest(store.get(sessionId) as IDBRequest<SessionRecord | undefined>)
  );

  if (!session) {
    throw new Error(`Session ${sessionId} was not found.`);
  }

  await tx(db, SESSIONS, 'readwrite', (store) => {
    store.put({
      ...session,
      deviceName,
      updatedAt: new Date().toISOString()
    });
  });
};

export const touchSession = async (sessionId: string): Promise<void> => {
  const db = await openDb();
  const session = await tx(db, SESSIONS, 'readonly', (store) =>
    promisifyRequest(store.get(sessionId) as IDBRequest<SessionRecord | undefined>)
  );

  if (!session) {
    return;
  }

  await tx(db, SESSIONS, 'readwrite', (store) => {
    store.put({
      ...session,
      updatedAt: new Date().toISOString()
    });
  });
};

export const markSessionCompleted = async (sessionId: string): Promise<void> => {
  const db = await openDb();
  const session = await tx(db, SESSIONS, 'readonly', (store) =>
    promisifyRequest(store.get(sessionId) as IDBRequest<SessionRecord | undefined>)
  );

  if (!session) {
    return;
  }

  await tx(db, SESSIONS, 'readwrite', (store) => {
    store.put({
      ...session,
      updatedAt: new Date().toISOString(),
      status: 'completed'
    });
  });
};

export const getLatestIncompleteSession = async (): Promise<SessionRecord | null> => {
  const db = await openDb();
  const sessions = await tx(db, SESSIONS, 'readonly', (store) =>
    promisifyRequest(store.getAll() as IDBRequest<SessionRecord[]>)
  );

  const incomplete = sessions
    .filter((session) => session.status !== 'completed')
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));

  return incomplete[0] ?? null;
};

export const storePacket = async (packet: PacketRecord): Promise<void> => {
  await storePackets([packet]);
};

export const storeHistoryReading = async (reading: HistoryReadingRecord): Promise<void> => {
  await storeHistoryReadings([reading]);
};

export const storePackets = async (packets: PacketRecord[]): Promise<void> => {
  if (packets.length === 0) {
    return;
  }

  const db = await openDb();
  await tx(db, PACKETS, 'readwrite', (store) => {
    for (const packet of packets) {
      store.add(packet);
    }
  });
};

export const storeHistoryReadings = async (readings: HistoryReadingRecord[]): Promise<void> => {
  if (readings.length === 0) {
    return;
  }

  const db = await openDb();
  await tx(db, HISTORY_READINGS, 'readwrite', (store) => {
    for (const reading of readings) {
      store.add(reading);
    }
  });
};

export const countPacketsForSession = async (sessionId: string): Promise<number> => {
  const db = await openDb();
  return tx(db, PACKETS, 'readonly', (store) => {
    const index = store.index('by_session');
    return promisifyRequest(index.count(sessionId));
  });
};

export const countHistoryReadingsForSession = async (sessionId: string): Promise<number> => {
  const db = await openDb();
  return tx(db, HISTORY_READINGS, 'readonly', (store) => {
    const index = store.index('by_session');
    return promisifyRequest(index.count(sessionId));
  });
};

export const getHistoryReadingUnixMsForSession = async (
  sessionId: string
): Promise<number[]> => {
  const db = await openDb();
  return tx(db, HISTORY_READINGS, 'readonly', (store) => {
    const index = store.index('by_session');
    return promisifyRequest(index.getAll(sessionId) as IDBRequest<HistoryReadingRecord[]>).then((readings) =>
      readings.map((reading) => reading.unixMs)
    );
  });
};

export const exportSession = async (sessionId: string): Promise<SessionExportPayload> => {
  const db = await openDb();

  const session = await tx(db, SESSIONS, 'readonly', (store) =>
    promisifyRequest(store.get(sessionId) as IDBRequest<SessionRecord | undefined>)
  );

  const packets = await tx(db, PACKETS, 'readonly', (store) => {
    const index = store.index('by_session');
    return promisifyRequest(index.getAll(sessionId) as IDBRequest<PacketRecord[]>);
  });

  const historyReadings = await tx(db, HISTORY_READINGS, 'readonly', (store) => {
    const index = store.index('by_session');
    return promisifyRequest(index.getAll(sessionId) as IDBRequest<HistoryReadingRecord[]>);
  });

  return { session, packets, historyReadings };
};

const openDb = async (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;

      if (!db.objectStoreNames.contains(SESSIONS)) {
        db.createObjectStore(SESSIONS, { keyPath: 'id' });
      }

      if (!db.objectStoreNames.contains(PACKETS)) {
        const packets = db.createObjectStore(PACKETS, {
          keyPath: 'id',
          autoIncrement: true
        });
        packets.createIndex('by_session', 'sessionId', { unique: false });
      }

      if (!db.objectStoreNames.contains(HISTORY_READINGS)) {
        const historyReadings = db.createObjectStore(HISTORY_READINGS, {
          keyPath: 'id',
          autoIncrement: true
        });
        historyReadings.createIndex('by_session', 'sessionId', { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Failed to open IndexedDB.'));
  });
};

const tx = async <T>(
  db: IDBDatabase,
  storeName: string,
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => T | Promise<T>
): Promise<T> => {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, mode);
    const store = transaction.objectStore(storeName);

    Promise.resolve(run(store))
      .then((value) => {
        transaction.oncomplete = () => resolve(value);
        transaction.onerror = () =>
          reject(transaction.error ?? new Error('IndexedDB transaction failed.'));
        transaction.onabort = () =>
          reject(transaction.error ?? new Error('IndexedDB transaction was aborted.'));
      })
      .catch(reject);
  });
};

const promisifyRequest = async <T>(request: IDBRequest<T>): Promise<T> => {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed.'));
  });
};
