import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { DecodedWhoopData } from '@/features/whoop/decoder.ts';
import {
  resetWhoopCaptureControllerForTests,
  useWhoopCaptureController
} from '@/features/whoop/index.ts';
import type { SessionRecord } from '@/features/whoop/storage.ts';
import type { WhoopNotification } from '@/features/whoop/whoop.ts';

const decoderMocks = vi.hoisted(() => {
  return {
    push: vi.fn<(characteristic: string, bytes: readonly number[]) => DecodedWhoopData[]>(),
    reset: vi.fn<() => void>()
  };
});

const transportMocks = vi.hoisted(() => {
  return {
    connectToWhoop: vi.fn()
  };
});

const storageMocks = vi.hoisted(() => {
  return {
    countHistoryReadingsForSession: vi.fn(),
    countPacketsForSession: vi.fn(),
    createSession: vi.fn(),
    exportSession: vi.fn(),
    getHistoryReadingUnixMsForSession: vi.fn(),
    getLatestIncompleteSession: vi.fn(),
    markSessionCompleted: vi.fn(),
    storeHistoryReadings: vi.fn(),
    storePackets: vi.fn(),
    touchSession: vi.fn(),
    updateSessionDeviceName: vi.fn()
  };
});

vi.mock('@/features/whoop/decoder.ts', () => {
  return {
    WhoopProtocolDecoder: vi.fn().mockImplementation(() => {
      return {
        push: decoderMocks.push,
        reset: decoderMocks.reset
      };
    })
  };
});

vi.mock('@/features/whoop/whoop.ts', () => {
  return {
    connectToWhoop: transportMocks.connectToWhoop
  };
});

vi.mock('@/features/whoop/storage.ts', () => {
  return {
    countHistoryReadingsForSession: storageMocks.countHistoryReadingsForSession,
    countPacketsForSession: storageMocks.countPacketsForSession,
    createSession: storageMocks.createSession,
    exportSession: storageMocks.exportSession,
    getHistoryReadingUnixMsForSession: storageMocks.getHistoryReadingUnixMsForSession,
    getLatestIncompleteSession: storageMocks.getLatestIncompleteSession,
    markSessionCompleted: storageMocks.markSessionCompleted,
    storeHistoryReadings: storageMocks.storeHistoryReadings,
    storePackets: storageMocks.storePackets,
    touchSession: storageMocks.touchSession,
    updateSessionDeviceName: storageMocks.updateSessionDeviceName
  };
});

type ConnectOptions = {
  onLog: (message: string) => void;
  onNotification: (notification: WhoopNotification) => void;
  onDisconnected: () => void;
};

const SUPPORT_OVERRIDE = {
  chromiumLike: true,
  secureContext: true,
  bluetooth: true,
  indexedDb: true
} as const;

const createSessionRecord = (id: string): SessionRecord => {
  return {
    id,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    deviceName: 'Pending WHOOP device',
    status: 'in_progress'
  };
};

describe('useWhoopCaptureController', () => {
  beforeEach(async () => {
    await resetWhoopCaptureControllerForTests();
    vi.useRealTimers();

    decoderMocks.push.mockReset();
    decoderMocks.reset.mockReset();

    transportMocks.connectToWhoop.mockReset();

    storageMocks.countHistoryReadingsForSession.mockReset();
    storageMocks.countPacketsForSession.mockReset();
    storageMocks.createSession.mockReset();
    storageMocks.exportSession.mockReset();
    storageMocks.getHistoryReadingUnixMsForSession.mockReset();
    storageMocks.getLatestIncompleteSession.mockReset();
    storageMocks.markSessionCompleted.mockReset();
    storageMocks.storeHistoryReadings.mockReset();
    storageMocks.storePackets.mockReset();
    storageMocks.touchSession.mockReset();
    storageMocks.updateSessionDeviceName.mockReset();

    storageMocks.createSession.mockResolvedValue(createSessionRecord('session-1'));
    storageMocks.getLatestIncompleteSession.mockResolvedValue(null);
    storageMocks.countPacketsForSession.mockResolvedValue(0);
    storageMocks.countHistoryReadingsForSession.mockResolvedValue(0);
    storageMocks.getHistoryReadingUnixMsForSession.mockResolvedValue([]);
    storageMocks.storePackets.mockResolvedValue(undefined);
    storageMocks.storeHistoryReadings.mockResolvedValue(undefined);
    storageMocks.touchSession.mockResolvedValue(undefined);
    storageMocks.updateSessionDeviceName.mockResolvedValue(undefined);
    storageMocks.markSessionCompleted.mockResolvedValue(undefined);
    storageMocks.exportSession.mockResolvedValue({
      session: createSessionRecord('session-1'),
      packets: [],
      historyReadings: []
    });

    decoderMocks.push.mockReturnValue([]);
  });

  afterEach(async () => {
    await resetWhoopCaptureControllerForTests();
    vi.useRealTimers();
  });

  it('connects and disconnects the WHOOP device', async () => {
    const disconnectMock = vi.fn();
    const sendHistoryEndAckMock = vi.fn(() => Promise.resolve());

    transportMocks.connectToWhoop.mockImplementation((options: ConnectOptions) => {
      options.onLog('Connected to the WHOOP BLE service.');
      return Promise.resolve({
        name: 'WHOOP Test Strap',
        disconnect: disconnectMock,
        sendHistoryEndAck: sendHistoryEndAckMock
      });
    });

    const { result, unmount } = renderHook(() =>
      useWhoopCaptureController({
        support: SUPPORT_OVERRIDE
      })
    );

    await act(async () => {
      await result.current.connect();
    });

    expect(transportMocks.connectToWhoop).toHaveBeenCalledTimes(1);
    expect(storageMocks.updateSessionDeviceName).toHaveBeenCalledWith(
      'session-1',
      'WHOOP Test Strap'
    );

    await waitFor(() => {
      expect(result.current.connected).toBe(true);
      expect(result.current.session?.deviceName).toBe('WHOOP Test Strap');
    });

    await act(async () => {
      await result.current.disconnect();
    });

    expect(disconnectMock).toHaveBeenCalledTimes(1);
    expect(result.current.connected).toBe(false);

    unmount();
  });

  it('sends HistoryEnd ack and marks session complete on HistoryComplete', async () => {
    let notify: ((notification: WhoopNotification) => void) | undefined;
    const sendHistoryEndAckMock = vi.fn(() => Promise.resolve());

    transportMocks.connectToWhoop.mockImplementation((options: ConnectOptions) => {
      notify = options.onNotification;
      return Promise.resolve({
        name: 'WHOOP Test Strap',
        disconnect: vi.fn(),
        sendHistoryEndAck: sendHistoryEndAckMock
      });
    });

    const { result, unmount } = renderHook(() =>
      useWhoopCaptureController({
        support: SUPPORT_OVERRIDE
      })
    );

    await act(async () => {
      await result.current.connect();
    });

    decoderMocks.push.mockReturnValueOnce([
      {
        kind: 'history_metadata',
        cmd: 'HistoryEnd',
        unix: 1735689600,
        data: 7
      }
    ]);

    act(() => {
      notify?.({ characteristic: 'DATA_FROM_STRAP', bytes: [1, 2, 3] });
    });

    await waitFor(() => {
      expect(sendHistoryEndAckMock).toHaveBeenCalledWith(7);
      expect(storageMocks.touchSession).toHaveBeenCalled();
    });

    decoderMocks.push.mockReturnValueOnce([
      {
        kind: 'history_metadata',
        cmd: 'HistoryComplete',
        unix: 1735689700,
        data: 0
      }
    ]);

    act(() => {
      notify?.({ characteristic: 'DATA_FROM_STRAP', bytes: [4, 5, 6] });
    });

    await waitFor(() => {
      expect(storageMocks.markSessionCompleted).toHaveBeenCalledWith('session-1');
    });

    unmount();
  });

  it('deduplicates readings and flushes buffers on interval', async () => {
    vi.useFakeTimers();

    let notify: ((notification: WhoopNotification) => void) | undefined;

    transportMocks.connectToWhoop.mockImplementation((options: ConnectOptions) => {
      notify = options.onNotification;
      return Promise.resolve({
        name: 'WHOOP Test Strap',
        disconnect: vi.fn(),
        sendHistoryEndAck: vi.fn(() => Promise.resolve())
      });
    });

    const { result, unmount } = renderHook(() =>
      useWhoopCaptureController({
        support: SUPPORT_OVERRIDE
      })
    );

    await act(async () => {
      await result.current.connect();
    });

    decoderMocks.push
      .mockReturnValueOnce([
        {
          kind: 'history_reading',
          version: 11,
          unixMs: 1735689600000,
          bpm: 61,
          rr: [800]
        }
      ])
      .mockReturnValueOnce([
        {
          kind: 'history_reading',
          version: 11,
          unixMs: 1735689600000,
          bpm: 61,
          rr: [800]
        }
      ]);

    act(() => {
      notify?.({ characteristic: 'DATA_FROM_STRAP', bytes: [1, 1, 1] });
      notify?.({ characteristic: 'DATA_FROM_STRAP', bytes: [2, 2, 2] });
    });

    expect(storageMocks.storeHistoryReadings).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(400);
    });

    expect(storageMocks.storeHistoryReadings).toHaveBeenCalledTimes(1);
    expect(storageMocks.storePackets).toHaveBeenCalledTimes(1);

    const flushedReadings = storageMocks.storeHistoryReadings.mock.calls[0]?.[0] as
      | Array<{ unixMs: number }>
      | undefined;

    expect(flushedReadings).toHaveLength(1);
    expect(flushedReadings?.[0]?.unixMs).toBe(1735689600000);

    unmount();
  });
});
