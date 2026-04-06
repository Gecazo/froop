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

const sessionRepository = {
  async openOrCreate(deviceKey: string, deviceName: string): Promise<SessionRecord> {
    await ensureDbReady();

    return db.transaction('rw', db.sessions, async () => {
      const now = new Date().toISOString();
      const existing = await db.sessions.get(deviceKey);
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

      await db.sessions.put(session);
      return session;
    });
  },

  async updateDeviceName(deviceKey: string, deviceName: string): Promise<void> {
    await ensureDbReady();

    return db.transaction('rw', db.sessions, async () => {
      const existing = await db.sessions.get(deviceKey);
      if (!existing) {
        throw new Error(`Session for device ${deviceKey} was not found.`);
      }

      await db.sessions.put({
        ...existing,
        deviceName,
        updatedAt: new Date().toISOString()
      });
    });
  },

  async touch(deviceKey: string): Promise<void> {
    await ensureDbReady();

    return db.transaction('rw', db.sessions, async () => {
      const existing = await db.sessions.get(deviceKey);
      if (!existing) {
        return;
      }

      await db.sessions.put({
        ...existing,
        updatedAt: new Date().toISOString()
      });
    });
  },

  async markCompleted(deviceKey: string): Promise<void> {
    await ensureDbReady();

    return db.transaction('rw', db.sessions, async () => {
      const existing = await db.sessions.get(deviceKey);
      if (!existing) {
        return;
      }

      await db.sessions.put({
        ...existing,
        status: 'completed',
        updatedAt: new Date().toISOString()
      });
    });
  },

  async getByDeviceKey(deviceKey: string): Promise<SessionRecord | undefined> {
    await ensureDbReady();
    return db.sessions.get(deviceKey);
  },

  async getLatest(): Promise<SessionRecord | null> {
    await ensureDbReady();
    const latest = await db.sessions.orderBy('updatedAt').reverse().first();
    return latest ?? null;
  }
};

const packetRepository = {
  async storeMany(packets: PacketRecord[]): Promise<void> {
    await ensureDbReady();

    if (packets.length === 0) {
      return;
    }

    await db.rawPackets.bulkAdd(packets);
  },

  async countForDevice(deviceKey: string): Promise<number> {
    await ensureDbReady();
    return db.rawPackets.where('deviceKey').equals(deviceKey).count();
  },

  async listForDevice(deviceKey: string): Promise<PacketRecord[]> {
    await ensureDbReady();
    return db.rawPackets
      .where('[deviceKey+receivedAt]')
      .between([deviceKey, Dexie.minKey], [deviceKey, Dexie.maxKey])
      .toArray();
  }
};

const historyReadingRepository = {
  async storeMany(readings: HistoryReadingRecord[]): Promise<void> {
    await ensureDbReady();

    if (readings.length === 0) {
      return;
    }

    await db.historyReadings.bulkAdd(readings);
  },

  async countForDevice(deviceKey: string): Promise<number> {
    await ensureDbReady();
    return db.historyReadings.where('deviceKey').equals(deviceKey).count();
  },

  async listForDevice(deviceKey: string): Promise<HistoryReadingRecord[]> {
    await ensureDbReady();
    return db.historyReadings
      .where('[deviceKey+unixMs]')
      .between([deviceKey, Dexie.minKey], [deviceKey, Dexie.maxKey])
      .toArray();
  }
};

export const openOrCreateSession = async (
  deviceKey: string,
  deviceName: string
): Promise<SessionRecord> => {
  return sessionRepository.openOrCreate(deviceKey, deviceName);
};

export const updateSessionDeviceName = async (
  deviceKey: string,
  deviceName: string
): Promise<void> => {
  await sessionRepository.updateDeviceName(deviceKey, deviceName);
};

export const touchSession = async (deviceKey: string): Promise<void> => {
  await sessionRepository.touch(deviceKey);
};

export const markSessionCompleted = async (deviceKey: string): Promise<void> => {
  await sessionRepository.markCompleted(deviceKey);
};

export const getLatestSession = async (): Promise<SessionRecord | null> => {
  return sessionRepository.getLatest();
};

export const getSessionByDeviceKey = async (deviceKey: string): Promise<SessionRecord | null> => {
  const session = await sessionRepository.getByDeviceKey(deviceKey);
  return session ?? null;
};

export const storePacket = async (packet: PacketRecord): Promise<void> => {
  await storePackets([packet]);
};

export const storeHistoryReading = async (reading: HistoryReadingRecord): Promise<void> => {
  await storeHistoryReadings([reading]);
};

export const storePackets = async (packets: PacketRecord[]): Promise<void> => {
  await packetRepository.storeMany(packets);
};

export const storeHistoryReadings = async (readings: HistoryReadingRecord[]): Promise<void> => {
  await historyReadingRepository.storeMany(readings);
};

export const countPacketsForDevice = async (deviceKey: string): Promise<number> => {
  return packetRepository.countForDevice(deviceKey);
};

export const countHistoryReadingsForDevice = async (deviceKey: string): Promise<number> => {
  return historyReadingRepository.countForDevice(deviceKey);
};

export const getHistoryReadingUnixMsForDevice = async (deviceKey: string): Promise<number[]> => {
  const readings = await historyReadingRepository.listForDevice(deviceKey);
  return readings.map((reading) => reading.unixMs);
};

export const exportSession = async (deviceKey: string): Promise<SessionExportPayload> => {
  await ensureDbReady();

  return db.transaction(
    'r',
    db.sessions,
    db.rawPackets,
    db.historyReadings,
    async (): Promise<SessionExportPayload> => {
      const [session, packets, historyReadings] = await Promise.all([
        sessionRepository.getByDeviceKey(deviceKey),
        packetRepository.listForDevice(deviceKey),
        historyReadingRepository.listForDevice(deviceKey)
      ]);

      return {
        session,
        packets,
        historyReadings
      };
    }
  );
};
