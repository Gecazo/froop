import 'fake-indexeddb/auto';

import { beforeAll, describe, expect, it } from 'vitest';

import {
  countHistoryReadingsForDevice,
  countPacketsForDevice,
  exportSession,
  getHistoryReadingUnixMsForDevice,
  getLatestSession,
  markSessionCompleted,
  openOrCreateSession,
  storeHistoryReadings,
  storePackets
} from '@/features/whoop/storage.ts';

const deleteDb = async (): Promise<void> => {
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase('froop');
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error ?? new Error('Failed to delete test database.'));
    request.onblocked = () => resolve();
  });
};

describe('whoop storage', () => {
  beforeAll(async () => {
    await deleteDb();
  });

  it('stores sessions, packets, readings, and exports payloads', async () => {
    const session = await openOrCreateSession('whoop-device-1', 'WHOOP 5');
    await openOrCreateSession(session.deviceKey, 'WHOOP Pulse 5');

    await storePackets([
      {
        deviceKey: session.deviceKey,
        characteristic: 'DATA_FROM_STRAP',
        bytes: [1, 2, 3],
        receivedAt: '2026-01-01T00:00:00.000Z'
      },
      {
        deviceKey: session.deviceKey,
        characteristic: 'CMD_FROM_STRAP',
        bytes: [4, 5, 6],
        receivedAt: '2026-01-01T00:00:01.000Z'
      }
    ]);

    await storeHistoryReadings([
      {
        deviceKey: session.deviceKey,
        version: 11,
        unixMs: 1735689600000,
        bpm: 62,
        rr: [800, 900],
        sensor_data: {
          ppg_green: 2490,
          ppg_red_ir: 28880,
          spo2_red: 523,
          spo2_ir: 616,
          skin_temp_raw: 910,
          ambient_light: 617,
          led_drive_1: 331,
          led_drive_2: 96,
          resp_rate_raw: 3073,
          signal_quality: 3074,
          skin_contact: 68,
          accel_gravity: [-0.2, 0.1, 1.0]
        },
        imu_data: [
          {
            acc_x_g: 1,
            acc_y_g: 0,
            acc_z_g: -1,
            gyr_x_dps: 10,
            gyr_y_dps: 20,
            gyr_z_dps: 30
          }
        ],
        receivedAt: '2026-01-01T00:00:02.000Z'
      }
    ]);

    expect(await countPacketsForDevice(session.deviceKey)).toBe(2);
    expect(await countHistoryReadingsForDevice(session.deviceKey)).toBe(1);
    expect(await getHistoryReadingUnixMsForDevice(session.deviceKey)).toEqual([1735689600000]);

    const exported = await exportSession(session.deviceKey);
    expect(exported.session).toBeDefined();
    expect(exported.session?.deviceKey).toBe(session.deviceKey);
    expect(exported.session?.deviceName).toBe('WHOOP Pulse 5');
    expect(exported.packets).toHaveLength(2);
    expect(exported.historyReadings).toHaveLength(1);
    expect(exported.historyReadings[0]?.sensor_data).toMatchObject({
      ppg_green: 2490,
      signal_quality: 3074,
      skin_contact: 68
    });
    expect(exported.historyReadings[0]?.imu_data).toHaveLength(1);

    await markSessionCompleted(session.deviceKey);
  });

  it('tracks latest device stream and reopens completed streams on reconnect', async () => {
    const first = await openOrCreateSession('whoop-device-a', 'WHOOP A');
    await markSessionCompleted(first.deviceKey);

    const second = await openOrCreateSession('whoop-device-b', 'WHOOP B');

    const latest = await getLatestSession();
    expect(latest?.deviceKey).toBe(second.deviceKey);

    await markSessionCompleted(second.deviceKey);
    const secondExport = await exportSession(second.deviceKey);

    expect(secondExport.session?.status).toBe('completed');

    const reopened = await openOrCreateSession(second.deviceKey, 'WHOOP B');
    expect(reopened.status).toBe('in_progress');
  });
});
