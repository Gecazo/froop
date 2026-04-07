import Dexie, { type Table } from 'dexie';

export type SessionRecord = {
  deviceKey: string;
  createdAt: string;
  updatedAt: string;
  deviceName: string;
  status: 'in_progress' | 'completed';
};

export type PacketRecord = {
  id?: number;
  deviceKey: string;
  characteristic: string;
  bytes: number[];
  receivedAt: string;
};

export type HistoryReadingRecord = {
  id?: number;
  deviceKey: string;
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

export interface SessionStorage {
  openOrCreate(deviceKey: string, deviceName: string): Promise<SessionRecord>;
  touch(deviceKey: string): Promise<void>;
  markCompleted(deviceKey: string): Promise<void>;
  getByDeviceKey(deviceKey: string): Promise<SessionRecord | undefined>;
  getLatest(): Promise<SessionRecord | null>;
}

export interface PacketStorage {
  storeMany(packets: PacketRecord[]): Promise<void>;
  countForDevice(deviceKey: string): Promise<number>;
  listForDevice(deviceKey: string): Promise<PacketRecord[]>;
}

export interface HistoryReadingStorage {
  storeMany(readings: HistoryReadingRecord[]): Promise<void>;
  countForDevice(deviceKey: string): Promise<number>;
  listForDevice(deviceKey: string): Promise<HistoryReadingRecord[]>;
  listUnixMsForDevice(deviceKey: string): Promise<number[]>;
}

export interface WhoopStorage {
  sessions: SessionStorage;
  packets: PacketStorage;
  historyReadings: HistoryReadingStorage;
  exportSession(deviceKey: string): Promise<SessionExportPayload>;
}

const DB_NAME = 'froop';
const DB_VERSION = 3;
const PRIMARY_KEY_MIGRATION_ERROR = 'Not yet support for changing primary key';

class FroopDb extends Dexie {
  public sessions!: Table<SessionRecord, string>;
  public rawPackets!: Table<PacketRecord, number>;
  public historyReadings!: Table<HistoryReadingRecord, number>;

  public constructor() {
    super(DB_NAME);

    this.version(DB_VERSION).stores({
      sessions: '&deviceKey, updatedAt, status',
      raw_packets: '++id, deviceKey, [deviceKey+receivedAt]',
      history_readings: '++id, deviceKey, [deviceKey+unixMs], [deviceKey+receivedAt]'
    });

    this.sessions = this.table('sessions');
    this.rawPackets = this.table('raw_packets');
    this.historyReadings = this.table('history_readings');
  }
}

const db = new FroopDb();
let dbOpenPromise: Promise<void> | null = null;
const nowIso = (): string => new Date().toISOString();

const hasPrimaryKeyUpgradeError = (error: unknown): boolean => {
  if (!(error instanceof Error)) {
    return false;
  }

  if (error.message.includes(PRIMARY_KEY_MIGRATION_ERROR)) {
    return true;
  }

  const nested = (error as { inner?: unknown }).inner;
  if (nested instanceof Error) {
    return nested.message.includes(PRIMARY_KEY_MIGRATION_ERROR);
  }

  return false;
};

const ensureDbReady = async (): Promise<void> => {
  if (db.isOpen()) {
    return;
  }

  if (dbOpenPromise) {
    await dbOpenPromise;
    return;
  }

  dbOpenPromise = (async () => {
    try {
      await db.open();
    } catch (error) {
      if (!hasPrimaryKeyUpgradeError(error)) {
        throw error;
      }

      db.close();
      await Dexie.delete(DB_NAME);
      await db.open();
    }
  })().finally(() => {
    dbOpenPromise = null;
  });

  await dbOpenPromise;
};

const withDb = async <T>(run: (database: FroopDb) => Promise<T>): Promise<T> => {
  await ensureDbReady();
  return run(db);
};

const updateExistingSession = async (
  deviceKey: string,
  update: (existing: SessionRecord) => SessionRecord
): Promise<void> => {
  await withDb(async (database) => {
    await database.transaction('rw', database.sessions, async () => {
      const existing = await database.sessions.get(deviceKey);
      if (!existing) {
        return;
      }

      await database.sessions.put(update(existing));
    });
  });
};

const sessionStorage: SessionStorage = {
  async openOrCreate(deviceKey: string, deviceName: string): Promise<SessionRecord> {
    return withDb(async (database) => {
      return database.transaction('rw', database.sessions, async () => {
        const now = nowIso();
        const existing = await database.sessions.get(deviceKey);
        const session: SessionRecord = existing
          ? {
              ...existing,
              deviceName,
              updatedAt: now,
              status: 'in_progress'
            }
          : {
              deviceKey,
              createdAt: now,
              updatedAt: now,
              deviceName,
              status: 'in_progress'
            };

        await database.sessions.put(session);
        return session;
      });
    });
  },

  async touch(deviceKey: string): Promise<void> {
    await updateExistingSession(deviceKey, (existing) => {
      return {
        ...existing,
        updatedAt: nowIso()
      };
    });
  },

  async markCompleted(deviceKey: string): Promise<void> {
    await updateExistingSession(deviceKey, (existing) => {
      return {
        ...existing,
        status: 'completed',
        updatedAt: nowIso()
      };
    });
  },

  async getByDeviceKey(deviceKey: string): Promise<SessionRecord | undefined> {
    return withDb(async (database) => database.sessions.get(deviceKey));
  },

  async getLatest(): Promise<SessionRecord | null> {
    return withDb(async (database) => {
      const latest = await database.sessions.orderBy('updatedAt').reverse().first();
      return latest ?? null;
    });
  }
};

const packetStorage: PacketStorage = {
  async storeMany(packets: PacketRecord[]): Promise<void> {
    if (packets.length === 0) {
      return;
    }

    await withDb(async (database) => {
      await database.rawPackets.bulkAdd(packets);
    });
  },

  async countForDevice(deviceKey: string): Promise<number> {
    return withDb(async (database) => database.rawPackets.where('deviceKey').equals(deviceKey).count());
  },

  async listForDevice(deviceKey: string): Promise<PacketRecord[]> {
    return withDb(async (database) => {
      return database.rawPackets
        .where('[deviceKey+receivedAt]')
        .between([deviceKey, Dexie.minKey], [deviceKey, Dexie.maxKey])
        .toArray();
    });
  }
};

const historyReadingStorage: HistoryReadingStorage = {
  async storeMany(readings: HistoryReadingRecord[]): Promise<void> {
    if (readings.length === 0) {
      return;
    }

    await withDb(async (database) => {
      await database.historyReadings.bulkAdd(readings);
    });
  },

  async countForDevice(deviceKey: string): Promise<number> {
    return withDb(async (database) =>
      database.historyReadings.where('deviceKey').equals(deviceKey).count()
    );
  },

  async listForDevice(deviceKey: string): Promise<HistoryReadingRecord[]> {
    return withDb(async (database) => {
      return database.historyReadings
        .where('[deviceKey+unixMs]')
        .between([deviceKey, Dexie.minKey], [deviceKey, Dexie.maxKey])
        .toArray();
    });
  },

  async listUnixMsForDevice(deviceKey: string): Promise<number[]> {
    const readings = await this.listForDevice(deviceKey);
    return readings.map((reading) => reading.unixMs);
  }
};

export const whoopStorage: WhoopStorage = {
  sessions: sessionStorage,
  packets: packetStorage,
  historyReadings: historyReadingStorage,
  async exportSession(deviceKey: string): Promise<SessionExportPayload> {
    return withDb(async (database) => {
      return database.transaction(
        'r',
        database.sessions,
        database.rawPackets,
        database.historyReadings,
        async (): Promise<SessionExportPayload> => {
          const [session, packets, historyReadings] = await Promise.all([
            database.sessions.get(deviceKey),
            database.rawPackets
              .where('[deviceKey+receivedAt]')
              .between([deviceKey, Dexie.minKey], [deviceKey, Dexie.maxKey])
              .toArray(),
            database.historyReadings
              .where('[deviceKey+unixMs]')
              .between([deviceKey, Dexie.minKey], [deviceKey, Dexie.maxKey])
              .toArray()
          ]);

          return {
            session,
            packets,
            historyReadings
          };
        }
      );
    });
  }
};

export const openOrCreateSession = async (
  deviceKey: string,
  deviceName: string
): Promise<SessionRecord> => {
  return whoopStorage.sessions.openOrCreate(deviceKey, deviceName);
};

export const touchSession = async (deviceKey: string): Promise<void> => {
  await whoopStorage.sessions.touch(deviceKey);
};

export const markSessionCompleted = async (deviceKey: string): Promise<void> => {
  await whoopStorage.sessions.markCompleted(deviceKey);
};

export const getLatestSession = async (): Promise<SessionRecord | null> => {
  return whoopStorage.sessions.getLatest();
};

export const getSessionByDeviceKey = async (deviceKey: string): Promise<SessionRecord | null> => {
  const session = await whoopStorage.sessions.getByDeviceKey(deviceKey);
  return session ?? null;
};

export const storePackets = async (packets: PacketRecord[]): Promise<void> => {
  await whoopStorage.packets.storeMany(packets);
};

export const storeHistoryReadings = async (readings: HistoryReadingRecord[]): Promise<void> => {
  await whoopStorage.historyReadings.storeMany(readings);
};

export const countPacketsForDevice = async (deviceKey: string): Promise<number> => {
  return whoopStorage.packets.countForDevice(deviceKey);
};

export const countHistoryReadingsForDevice = async (deviceKey: string): Promise<number> => {
  return whoopStorage.historyReadings.countForDevice(deviceKey);
};

export const getHistoryReadingUnixMsForDevice = async (deviceKey: string): Promise<number[]> => {
  return whoopStorage.historyReadings.listUnixMsForDevice(deviceKey);
};

export const exportSession = async (deviceKey: string): Promise<SessionExportPayload> => {
  return whoopStorage.exportSession(deviceKey);
};
