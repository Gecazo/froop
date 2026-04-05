import { ThemeProvider, createTheme } from '@mui/material/styles';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { UseWhoopCaptureControllerResult } from '@/features/whoop/index.ts';
import * as whoopFeature from '@/features/whoop/index.ts';
import { LandingPage } from '@/pages/LandingPage.tsx';

vi.mock('@/features/whoop/index.ts', async () => {
  const actual = await vi.importActual<typeof whoopFeature>('@/features/whoop/index.ts');

  return {
    ...actual,
    useWhoopCaptureController: vi.fn()
  };
});

const useWhoopCaptureControllerMock = vi.mocked(whoopFeature.useWhoopCaptureController);

const createControllerMock = (
  overrides: Partial<UseWhoopCaptureControllerResult> = {}
): UseWhoopCaptureControllerResult => {
  return {
    support: {
      chromiumLike: true,
      secureContext: true,
      bluetooth: true,
      indexedDb: true
    },
    busy: false,
    connected: false,
    status: 'Ready for Chromium desktop.',
    session: null,
    resumableSession: null,
    packetCount: 0,
    historyReadingCount: 0,
    logLines: [],
    lastPacket: null,
    syncStartedAt: null,
    flushCount: 0,
    avgFlushMs: 0,
    maxFlushMs: 0,
    lastFlushMs: 0,
    earliestReadingUnixMs: null,
    latestReadingUnixMs: null,
    expectedEndUnixMs: null,
    historyComplete: false,
    protocolState: 'idle',
    lastMetadata: 'None',
    lastAckChunk: 'None',
    lastNotificationAt: null,
    debugLines: [],
    canConnect: true,
    canResume: false,
    lastRenderedPacket: null,
    previewSuppressed: false,
    pendingItemCount: 0,
    progressPercent: 0,
    progressLabel: 'Waiting for decoded readings',
    progressEstimateLabel: 'Protocol status: waiting for enough decoded data',
    elapsedLabel: '0s',
    packetRateLabel: '0',
    readingRateLabel: '0',
    currentProtocolState: 'idle',
    lastNotificationLabel: 'Never',
    connect: vi.fn(() => Promise.resolve()),
    resume: vi.fn(() => Promise.resolve()),
    disconnect: vi.fn(() => Promise.resolve()),
    exportSession: vi.fn(() => Promise.resolve()),
    ...overrides
  };
};

describe('LandingPage', () => {
  beforeEach(() => {
    useWhoopCaptureControllerMock.mockReturnValue(createControllerMock());
  });

  it('renders WHOOP capture panel and invokes connect action', async () => {
    const user = userEvent.setup();
    const connectMock = vi.fn(() => Promise.resolve());
    useWhoopCaptureControllerMock.mockReturnValue(createControllerMock({ connect: connectMock }));

    render(
      <ThemeProvider theme={createTheme()}>
        <LandingPage />
      </ThemeProvider>
    );

    expect(screen.getByText('WHOOP Device Capture')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Request Bluetooth Access' }));

    expect(connectMock).toHaveBeenCalledTimes(1);
  });

  it('disables capture controls when capability requirements are not met', () => {
    useWhoopCaptureControllerMock.mockReturnValue(
      createControllerMock({
        canConnect: false,
        canResume: false,
        session: null,
        support: {
          chromiumLike: false,
          secureContext: false,
          bluetooth: false,
          indexedDb: false
        }
      })
    );

    render(
      <ThemeProvider theme={createTheme()}>
        <LandingPage />
      </ThemeProvider>
    );

    expect(screen.getByRole('button', { name: 'Request Bluetooth Access' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Resume Previous Session' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Export Session JSON' })).toBeDisabled();
  });
});
