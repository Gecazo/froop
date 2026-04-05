import 'fake-indexeddb/auto';

import { beforeAll, describe, expect, it } from 'vitest';

import {
  countHistoryReadingsForSession,
  countPacketsForSession,
  createSession,
  exportSession,
  getHistoryReadingUnixMsForSession,
  getLatestIncompleteSession,
  markSessionCompleted,
  storeHistoryReadings,
  storePackets,
  updateSessionDeviceName
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
    const session = await createSession('WHOOP 5');
    await updateSessionDeviceName(session.id, 'WHOOP Pulse 5');

    await storePackets([
      {
        sessionId: session.id,
        characteristic: 'DATA_FROM_STRAP',
        bytes: [1, 2, 3],
        receivedAt: '2026-01-01T00:00:00.000Z'
      },
      {
        sessionId: session.id,
        characteristic: 'CMD_FROM_STRAP',
        bytes: [4, 5, 6],
        receivedAt: '2026-01-01T00:00:01.000Z'
      }
    ]);

    await storeHistoryReadings([
      {
        sessionId: session.id,
        version: 11,
        unixMs: 1735689600000,
        bpm: 62,
        rr: [800, 900],
        receivedAt: '2026-01-01T00:00:02.000Z'
      }
    ]);

    expect(await countPacketsForSession(session.id)).toBe(2);
    expect(await countHistoryReadingsForSession(session.id)).toBe(1);
    expect(await getHistoryReadingUnixMsForSession(session.id)).toEqual([1735689600000]);

    const exported = await exportSession(session.id);
    expect(exported.session).toBeDefined();
    expect(exported.session?.deviceName).toBe('WHOOP Pulse 5');
    expect(exported.packets).toHaveLength(2);
    expect(exported.historyReadings).toHaveLength(1);

    await markSessionCompleted(session.id);
  });

  it('tracks latest incomplete session and completed state', async () => {
    const first = await createSession('WHOOP A');
    await markSessionCompleted(first.id);

    const second = await createSession('WHOOP B');

    const latestIncomplete = await getLatestIncompleteSession();
    expect(latestIncomplete?.id).toBe(second.id);

    await markSessionCompleted(second.id);
    const secondExport = await exportSession(second.id);

    expect(secondExport.session?.status).toBe('completed');
    expect(await getLatestIncompleteSession()).toBeNull();
  });
});
