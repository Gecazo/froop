import EastOutlinedIcon from '@mui/icons-material/EastOutlined';
import {
  Box,
  Button,
  Chip,
  LinearProgress,
  Paper,
  Stack,
  Typography
} from '@mui/material';
import { useNavigate } from 'react-router-dom';

import { APP_ROUTES } from '@/config/routes.ts';
import { useWhoopCaptureController } from '@/features/whoop/index.ts';
import { useDocumentTitle } from '@/shared/hooks/useDocumentTitle.ts';

import styles from '@/pages/LandingPage.module.scss';

const formatBytes = (bytes: readonly number[]): string => {
  return bytes
    .slice(0, 64)
    .map((value) => value.toString(16).padStart(2, '0'))
    .join(' ');
};

const capabilityLabel = (enabled: boolean): 'available' | 'missing' => {
  return enabled ? 'available' : 'missing';
};

const capabilityColor = (enabled: boolean): 'success' | 'error' => {
  return enabled ? 'success' : 'error';
};

export const LandingPage = () => {
  const navigate = useNavigate();

  useDocumentTitle('Landing');

  const whoop = useWhoopCaptureController();

  return (
    <Box className={styles.page}>
      <Box className={styles.heroPanel}>
        <Typography className={styles.kicker} variant="overline">
          Technical Brutalism / Environmental SaaS
        </Typography>
        <Typography className={styles.title} variant="h1">
          Carbon Intelligence For The Built Environment.
        </Typography>
        <Typography className={styles.description} variant="body1">
          Deploy an enterprise-grade frontend shell for life-cycle analysis, emissions diagnostics,
          and operational decarbonization workflows.
        </Typography>

        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
          <Button
            endIcon={<EastOutlinedIcon />}
            onClick={() => {
              navigate(APP_ROUTES.analysis);
            }}
            variant="contained"
            size="large"
          >
            Open Analysis Workspace
          </Button>
          <Button
            onClick={() => {
              navigate(APP_ROUTES.settings);
            }}
            variant="outlined"
            size="large"
          >
            Configure Platform
          </Button>
        </Stack>
      </Box>

      <Box className={styles.capturePanel}>
        <Stack spacing={1}>
          <Typography className={styles.captureTitle} variant="h3">
            WHOOP Device Capture
          </Typography>
          <Typography color="text.secondary" variant="body1">
            Connect a WHOOP strap over Web Bluetooth, persist packets in IndexedDB, and export
            captured sessions.
          </Typography>

          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
            <Button
              disabled={!whoop.canConnect}
              onClick={() => {
                void whoop.connect();
              }}
              variant="contained"
            >
              {whoop.busy ? 'Requesting access...' : 'Request Bluetooth Access'}
            </Button>
            <Button
              disabled={!whoop.canResume}
              onClick={() => {
                void whoop.resume();
              }}
              variant="outlined"
            >
              Resume Previous Session
            </Button>
            <Button
              disabled={!whoop.connected}
              onClick={() => {
                void whoop.disconnect();
              }}
              variant="outlined"
            >
              Disconnect
            </Button>
            <Button
              disabled={!whoop.session}
              onClick={() => {
                void whoop.exportSession();
              }}
              variant="outlined"
            >
              Export Session JSON
            </Button>
          </Stack>

          <Typography className={styles.captureStatus} variant="body2">
            {whoop.status}
          </Typography>
        </Stack>

        <Box className={styles.captureGrid}>
          <Paper className={styles.captureCard}>
            <Typography className={styles.captureCardTitle} variant="h6">
              Browser capability check
            </Typography>
            <Box className={styles.capabilityList}>
              <Box className={styles.capabilityRow}>
                <Typography>Chromium desktop (Chrome, Edge, Brave)</Typography>
                <Chip
                  color={capabilityColor(whoop.support.chromiumLike)}
                  label={capabilityLabel(whoop.support.chromiumLike)}
                  size="small"
                />
              </Box>
              <Box className={styles.capabilityRow}>
                <Typography>Secure context (HTTPS or localhost)</Typography>
                <Chip
                  color={capabilityColor(whoop.support.secureContext)}
                  label={capabilityLabel(whoop.support.secureContext)}
                  size="small"
                />
              </Box>
              <Box className={styles.capabilityRow}>
                <Typography>Web Bluetooth</Typography>
                <Chip
                  color={capabilityColor(whoop.support.bluetooth)}
                  label={capabilityLabel(whoop.support.bluetooth)}
                  size="small"
                />
              </Box>
              <Box className={styles.capabilityRow}>
                <Typography>IndexedDB</Typography>
                <Chip
                  color={capabilityColor(whoop.support.indexedDb)}
                  label={capabilityLabel(whoop.support.indexedDb)}
                  size="small"
                />
              </Box>
            </Box>
          </Paper>

          <Paper className={styles.captureCard}>
            <Typography className={styles.captureCardTitle} variant="h6">
              Current session
            </Typography>
            <dl className={styles.factsList}>
              <div>
                <dt>Connection</dt>
                <dd>{whoop.connected ? 'Connected' : 'Disconnected'}</dd>
              </div>
              <div>
                <dt>Device</dt>
                <dd>{whoop.session?.deviceName ?? 'Not selected yet'}</dd>
              </div>
              <div>
                <dt>Packets stored</dt>
                <dd>{whoop.packetCount}</dd>
              </div>
              <div>
                <dt>Decoded readings</dt>
                <dd>{whoop.historyReadingCount}</dd>
              </div>
              <div>
                <dt>Session ID</dt>
                <dd className={styles.monoCell}>{whoop.session?.id ?? 'None'}</dd>
              </div>
              <div>
                <dt>Resume available</dt>
                <dd>{whoop.resumableSession ? 'Yes' : 'No'}</dd>
              </div>
            </dl>
          </Paper>

          <Paper className={styles.captureCard}>
            <Typography className={styles.captureCardTitle} variant="h6">
              Last packet
            </Typography>
            <Typography className={styles.packetMeta} variant="body2">
              {whoop.lastRenderedPacket
                ? `${whoop.lastRenderedPacket.characteristic} · ${whoop.lastRenderedPacket.bytes.length} bytes`
                : 'No notifications received yet.'}
            </Typography>
            <pre className={styles.packetPreview}>
              {whoop.lastRenderedPacket
                ? formatBytes(whoop.lastRenderedPacket.bytes)
                : 'Connect to the strap and subscribe to WHOOP notifications.'}
            </pre>
            <Typography color="text.secondary" variant="body2">
              {whoop.previewSuppressed
                ? 'Live packet preview is throttled during heavy sync to keep the download responsive.'
                : 'Packet preview is live.'}
            </Typography>
          </Paper>

          <Paper className={styles.captureCard}>
            <Typography className={styles.captureCardTitle} variant="h6">
              Sync progress
            </Typography>
            <Box className={styles.progressMeta}>
              <Typography variant="body2">{whoop.progressLabel}</Typography>
              <Typography variant="body2">{whoop.progressPercent.toFixed(1)}%</Typography>
            </Box>
            <LinearProgress
              className={styles.progressBar}
              value={whoop.progressPercent}
              variant="determinate"
            />
            <Typography color="text.secondary" variant="body2">
              {whoop.progressEstimateLabel}
            </Typography>
            <Typography color="text.secondary" variant="body2">
              {whoop.historyComplete
                ? 'WHOOP reported history sync complete.'
                : 'This is timeline coverage only. The sync is not done until WHOOP sends HistoryComplete.'}
            </Typography>
          </Paper>

          <Paper className={styles.captureCard}>
            <Typography className={styles.captureCardTitle} variant="h6">
              Sync telemetry
            </Typography>
            <dl className={styles.factsList}>
              <div>
                <dt>Elapsed</dt>
                <dd>{whoop.elapsedLabel}</dd>
              </div>
              <div>
                <dt>Packets/sec</dt>
                <dd>{whoop.packetRateLabel}</dd>
              </div>
              <div>
                <dt>Readings/sec</dt>
                <dd>{whoop.readingRateLabel}</dd>
              </div>
              <div>
                <dt>Flushes</dt>
                <dd>{whoop.flushCount}</dd>
              </div>
              <div>
                <dt>Last flush</dt>
                <dd>{whoop.lastFlushMs.toFixed(1)} ms</dd>
              </div>
              <div>
                <dt>Avg flush</dt>
                <dd>{whoop.avgFlushMs.toFixed(1)} ms</dd>
              </div>
              <div>
                <dt>Max flush</dt>
                <dd>{whoop.maxFlushMs.toFixed(1)} ms</dd>
              </div>
              <div>
                <dt>Buffered items</dt>
                <dd>{whoop.pendingItemCount}</dd>
              </div>
            </dl>
          </Paper>

          <Paper className={styles.captureCard}>
            <Typography className={styles.captureCardTitle} variant="h6">
              Protocol debug
            </Typography>
            <dl className={styles.factsList}>
              <div>
                <dt>Protocol state</dt>
                <dd>{whoop.currentProtocolState}</dd>
              </div>
              <div>
                <dt>Last metadata</dt>
                <dd>{whoop.lastMetadata}</dd>
              </div>
              <div>
                <dt>Last ack chunk</dt>
                <dd>{whoop.lastAckChunk}</dd>
              </div>
              <div>
                <dt>Last notification</dt>
                <dd>{whoop.lastNotificationLabel}</dd>
              </div>
            </dl>
            <Box className={styles.logList}>
              {whoop.debugLines.length > 0 ? (
                whoop.debugLines.map((line) => (
                  <Typography key={line} variant="body2">
                    {line}
                  </Typography>
                ))
              ) : (
                <Typography color="text.secondary" variant="body2">
                  No protocol events yet.
                </Typography>
              )}
            </Box>
          </Paper>

          <Paper className={styles.captureCard}>
            <Typography className={styles.captureCardTitle} variant="h6">
              Activity log
            </Typography>
            <Box className={styles.logList}>
              {whoop.logLines.length > 0 ? (
                whoop.logLines.map((line) => (
                  <Typography key={line} variant="body2">
                    {line}
                  </Typography>
                ))
              ) : (
                <Typography color="text.secondary" variant="body2">
                  Waiting for your first connection.
                </Typography>
              )}
            </Box>
          </Paper>
        </Box>
      </Box>

      <Box className={styles.metricsGrid}>
        <Box className={styles.metricCard}>
          <Typography variant="overline">Portfolio</Typography>
          <Typography variant="h3">128</Typography>
          <Typography color="text.secondary">Active assets connected</Typography>
        </Box>

        <Box className={styles.metricCard}>
          <Typography variant="overline">Current Intensity</Typography>
          <Typography variant="h3">26.7</Typography>
          <Typography color="text.secondary">kgCO₂e/m² annualized</Typography>
        </Box>

        <Box className={styles.metricCard}>
          <Typography variant="overline">Target Delta</Typography>
          <Typography variant="h3">-42%</Typography>
          <Typography color="text.secondary">By 2032 decarbonization objective</Typography>
        </Box>
      </Box>
    </Box>
  );
};
