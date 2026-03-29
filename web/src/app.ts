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
  touchSession,
  type HistoryReadingRecord,
  type PacketRecord,
  type SessionRecord,
  updateSessionDeviceName,
} from "./storage";
import { WhoopProtocolDecoder, type DecodedWhoopData } from "./decoder";
import {
  connectToWhoop,
  type ConnectedWhoopDevice,
  type WhoopNotification,
} from "./whoop";

const support = {
  chromiumLike:
    typeof navigator !== "undefined" &&
    (/Chrome|CriOS|Edg\//.test(navigator.userAgent) ||
      typeof (navigator as Navigator & { brave?: { isBrave(): Promise<boolean> } }).brave !==
        "undefined") &&
    !/Firefox\//.test(navigator.userAgent),
  bluetooth: typeof navigator !== "undefined" && "bluetooth" in navigator,
  indexedDb: typeof window !== "undefined" && "indexedDB" in window,
  secureContext: typeof window !== "undefined" && window.isSecureContext,
};

type AppState = {
  busy: boolean;
  connected: boolean;
  status: string;
  session: SessionRecord | null;
  resumableSession: SessionRecord | null;
  packetCount: number;
  historyReadingCount: number;
  logLines: string[];
  lastPacket: WhoopNotification | null;
  syncStartedAt: number | null;
  flushCount: number;
  avgFlushMs: number;
  maxFlushMs: number;
  lastFlushMs: number;
  earliestReadingUnixMs: number | null;
  latestReadingUnixMs: number | null;
  expectedEndUnixMs: number | null;
  historyComplete: boolean;
  protocolState: string;
  lastMetadata: string;
  lastAckChunk: string;
  lastNotificationAt: number | null;
  debugLines: string[];
};

class FroopApp {
  private static readonly FLUSH_PACKET_THRESHOLD = 250;
  private static readonly FLUSH_READING_THRESHOLD = 250;
  private static readonly FLUSH_INTERVAL_MS = 400;
  private static readonly RENDER_INTERVAL_MS = 1000;
  private static readonly ACTIVE_SYNC_WINDOW_MS = 2000;
  private static readonly MAX_LOG_LINES = 8;

  private readonly state: AppState = {
    busy: false,
    connected: false,
    status: "Ready for Chromium desktop.",
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
    protocolState: "idle",
    lastMetadata: "None",
    lastAckChunk: "None",
    lastNotificationAt: null,
    debugLines: [],
  };

  private device: ConnectedWhoopDevice | null = null;
  private readonly decoder = new WhoopProtocolDecoder();
  private pendingPackets: PacketRecord[] = [];
  private pendingHistoryReadings: HistoryReadingRecord[] = [];
  private readonly seenReadingUnixMs = new Set<number>();
  private flushTimer: number | null = null;
  private flushInFlight: Promise<void> | null = null;
  private renderScheduled = false;
  private lastRenderedPacket: WhoopNotification | null = null;
  private lastSyncActivityAt = 0;
  private previewSuppressed = false;

  constructor(private readonly root: HTMLDivElement) {
    window.addEventListener("pagehide", () => {
      void this.flushBuffers();
    });

    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") {
        void this.flushBuffers();
      }
    });

    window.setInterval(() => {
      if (this.state.connected) {
        this.scheduleRender();
      }
    }, 1000);

    void this.loadResumableSession();
  }

  render(): void {
    this.root.innerHTML = `
      <main class="shell">
        <section class="hero">
          <p class="eyebrow">Chromium MVP</p>
          <h1>Froop for WHOOP on the web</h1>
          <p class="lede">
            Open the URL in a supported Chromium browser on desktop, connect to
            the WHOOP band, and keep the captured packets in your browser.
          </p>
          <div class="hero-actions">
            <button class="button button-primary" id="connect-button" ${
              this.canConnect() ? "" : "disabled"
            }>
              ${this.state.busy ? "Requesting access..." : "Request Bluetooth Access"}
            </button>
            <button class="button" id="resume-button" ${
              this.canResume() ? "" : "disabled"
            }>
              Resume Previous Session
            </button>
            <button class="button" id="disconnect-button" ${
              this.state.connected ? "" : "disabled"
            }>
              Disconnect
            </button>
            <button class="button" id="export-button" ${
              this.state.session ? "" : "disabled"
            }>
              Export Session JSON
            </button>
          </div>
          <p class="status-line">${escapeHtml(this.state.status)}</p>
        </section>

        <section class="panel">
          <h2>Browser capability check</h2>
          <ul class="status-list">
            <li>${capability("Chromium desktop (Chrome, Edge, Brave)", support.chromiumLike)}</li>
            <li>${capability("Secure context (HTTPS or localhost)", support.secureContext)}</li>
            <li>${capability("Web Bluetooth", support.bluetooth)}</li>
            <li>${capability("IndexedDB", support.indexedDb)}</li>
          </ul>
        </section>

        <section class="panel panel-grid">
          <div>
            <h2>Current session</h2>
            <dl class="facts">
              <div>
                <dt>Connection</dt>
                <dd>${this.state.connected ? "Connected" : "Disconnected"}</dd>
              </div>
              <div>
                <dt>Device</dt>
                <dd>${escapeHtml(this.state.session?.deviceName ?? "Not selected yet")}</dd>
              </div>
              <div>
                <dt>Packets stored</dt>
                <dd>${this.state.packetCount}</dd>
              </div>
              <div>
                <dt>Decoded readings</dt>
                <dd>${this.state.historyReadingCount}</dd>
              </div>
              <div>
                <dt>Session ID</dt>
                <dd class="mono">${escapeHtml(this.state.session?.id ?? "None")}</dd>
              </div>
              <div>
                <dt>Resume available</dt>
                <dd>${this.state.resumableSession ? "Yes" : "No"}</dd>
              </div>
            </dl>
          </div>

          <div>
            <h2>Last packet</h2>
            <p class="packet-meta">
              ${
                this.lastRenderedPacket
                  ? `${this.lastRenderedPacket.characteristic} · ${this.lastRenderedPacket.bytes.length} bytes`
                  : "No notifications received yet."
              }
            </p>
            <pre class="packet-preview">${
              this.lastRenderedPacket
                ? escapeHtml(formatBytes(this.lastRenderedPacket.bytes))
                : "Connect to the strap and subscribe to WHOOP notifications."
            }</pre>
            <p class="packet-note">${
              this.previewSuppressed
                ? "Live packet preview is throttled during heavy sync to keep the download responsive."
                : "Packet preview is live."
            }</p>
          </div>
        </section>

        <section class="panel">
          <h2>Sync progress</h2>
          <div class="progress-block">
            <div class="progress-meta">
              <span>${this.progressLabel()}</span>
              <span>${this.progressPercent().toFixed(1)}%</span>
            </div>
            <div class="progress-track">
              <div
                class="progress-fill"
                style="width: ${this.progressPercent().toFixed(2)}%;"
              ></div>
            </div>
            <p class="packet-note">${this.progressEstimateLabel()}</p>
            <p class="packet-note">
              ${
                this.state.historyComplete
                  ? "WHOOP reported history sync complete."
                  : "This is timeline coverage only. The sync is not done until WHOOP sends HistoryComplete."
              }
            </p>
          </div>
        </section>

        <section class="panel">
          <h2>Sync telemetry</h2>
          <dl class="facts">
            <div>
              <dt>Elapsed</dt>
              <dd>${this.formatElapsed()}</dd>
            </div>
            <div>
              <dt>Packets/sec</dt>
              <dd>${this.formatRate(this.state.packetCount)}</dd>
            </div>
            <div>
              <dt>Readings/sec</dt>
              <dd>${this.formatRate(this.state.historyReadingCount)}</dd>
            </div>
            <div>
              <dt>Flushes</dt>
              <dd>${this.state.flushCount}</dd>
            </div>
            <div>
              <dt>Last flush</dt>
              <dd>${formatMs(this.state.lastFlushMs)}</dd>
            </div>
            <div>
              <dt>Avg flush</dt>
              <dd>${formatMs(this.state.avgFlushMs)}</dd>
            </div>
            <div>
              <dt>Max flush</dt>
              <dd>${formatMs(this.state.maxFlushMs)}</dd>
            </div>
            <div>
              <dt>Buffered items</dt>
              <dd>${this.pendingPackets.length + this.pendingHistoryReadings.length}</dd>
            </div>
          </dl>
        </section>

        <section class="panel">
          <h2>Protocol debug</h2>
          <dl class="facts">
            <div>
              <dt>Protocol state</dt>
              <dd>${escapeHtml(this.currentProtocolState())}</dd>
            </div>
            <div>
              <dt>Last metadata</dt>
              <dd>${escapeHtml(this.state.lastMetadata)}</dd>
            </div>
            <div>
              <dt>Last ack chunk</dt>
              <dd>${escapeHtml(this.state.lastAckChunk)}</dd>
            </div>
            <div>
              <dt>Last notification</dt>
              <dd>${escapeHtml(this.lastNotificationLabel())}</dd>
            </div>
          </dl>
          <div class="log-list">
            ${this.state.debugLines
              .map((line) => `<p>${escapeHtml(line)}</p>`)
              .join("") || "<p>No protocol events yet.</p>"}
          </div>
        </section>

        <section class="panel">
          <h2>Activity log</h2>
          <div class="log-list">
            ${this.state.logLines
              .map((line) => `<p>${escapeHtml(line)}</p>`)
              .join("") || "<p>Waiting for your first connection.</p>"}
          </div>
        </section>
      </main>
    `;

    this.bindEvents();
  }

  private bindEvents(): void {
    this.root
      .querySelector<HTMLButtonElement>("#connect-button")
      ?.addEventListener("click", () => {
        void this.connect();
      });

    this.root
      .querySelector<HTMLButtonElement>("#resume-button")
      ?.addEventListener("click", () => {
        void this.connect(true);
      });

    this.root
      .querySelector<HTMLButtonElement>("#disconnect-button")
      ?.addEventListener("click", () => {
        void this.disconnect();
      });

    this.root
      .querySelector<HTMLButtonElement>("#export-button")
      ?.addEventListener("click", () => {
        void this.downloadSessionExport();
      });
  }

  private canConnect(): boolean {
    return (
      !this.state.busy &&
      support.chromiumLike &&
      support.bluetooth &&
      support.indexedDb &&
      support.secureContext
    );
  }

  private canResume(): boolean {
    return this.canConnect() && this.state.resumableSession !== null;
  }

  private async connect(resumeExisting = false): Promise<void> {
    if (!this.canConnect()) {
      this.setStatus(
        "A supported Chromium desktop browser with Web Bluetooth and IndexedDB is required.",
      );
      return;
    }

    this.state.busy = true;
    this.state.protocolState = "requesting_permission";
    this.setStatus("Requesting Bluetooth permission from Chrome...");
    this.pushLog("Asking Chrome for Bluetooth access to a WHOOP device.");
    this.pushDebug("State -> requesting_permission");
    this.render();

    try {
      const session = resumeExisting && this.state.resumableSession
        ? this.state.resumableSession
        : await createSession("Pending WHOOP device");
      await this.activateSession(session, resumeExisting);
      this.pushLog(
        resumeExisting
          ? `Resuming local session ${session.id}.`
          : `Created local session ${session.id}.`,
      );
      this.pushDebug(
        resumeExisting
          ? `Resuming session ${session.id}`
          : `Created session ${session.id}`,
      );
      this.render();

      const connectedDevice = await connectToWhoop({
        onLog: (line) => {
          this.updateProtocolStateFromLog(line);
          this.pushLog(line);
          this.pushDebug(line);
          this.scheduleRender();
        },
        onNotification: (notification) => {
          void this.handleNotification(notification);
        },
        onDisconnected: () => {
          void this.flushBuffers();
          this.device = null;
          this.state.connected = false;
          this.state.protocolState = "disconnected";
          this.setStatus("WHOOP disconnected.");
          this.pushLog("The strap disconnected from the browser.");
          this.pushDebug("State -> disconnected");
          this.scheduleRender();
        },
      });

      await updateSessionDeviceName(session.id, connectedDevice.name);

      this.device = connectedDevice;
      this.state.connected = true;
      this.state.session = {
        ...session,
        deviceName: connectedDevice.name,
        status: "in_progress",
      };
      this.state.resumableSession = this.state.session;
      this.state.protocolState = "connected";
      this.setStatus(`Connected to ${connectedDevice.name}. Listening for notifications.`);
      this.pushLog(`Session ${session.id} is now linked to ${connectedDevice.name}.`);
      this.pushDebug(`State -> connected (${connectedDevice.name})`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown connection error.";
      const guidance = explainBluetoothError(message);
      this.state.protocolState = "error";
      this.setStatus(guidance.status);
      this.pushLog(`Connection failed: ${message}`);
      this.pushDebug(`Connection failed: ${message}`);
      if (this.state.session && !this.state.connected) {
        this.pushLog(`Session ${this.state.session.id} ended before connection completed.`);
      }
      if (guidance.log) {
        this.pushLog(guidance.log);
      }
    } finally {
      this.state.busy = false;
      this.render();
    }
  }

  private async disconnect(): Promise<void> {
    this.device?.disconnect();
    await this.flushBuffers();
    this.device = null;
    this.state.connected = false;
    this.decoder.reset();
    this.state.protocolState = "disconnected";
    this.setStatus("Disconnected.");
    this.pushLog("Disconnected from the WHOOP strap.");
    this.pushDebug("State -> disconnected");
    await this.loadResumableSession();
    this.render();
  }

  private async handleNotification(notification: WhoopNotification): Promise<void> {
    this.state.lastPacket = notification;
    this.lastSyncActivityAt = Date.now();
    this.state.lastNotificationAt = this.lastSyncActivityAt;
    this.previewSuppressed = this.isSyncHot();

    if (!this.state.session) {
      this.pushLog("Received a packet before a session was created.");
      this.scheduleRender();
      return;
    }

    this.pendingPackets.push({
      sessionId: this.state.session.id,
      characteristic: notification.characteristic,
      bytes: notification.bytes,
      receivedAt: new Date().toISOString(),
    });
    this.state.packetCount += 1;

    const decodedItems = this.decoder.push(notification.characteristic, notification.bytes);
    for (const item of decodedItems) {
      await this.handleDecodedItem(item);
    }

    this.setStatus(
      `Connected. Stored ${this.state.packetCount} packet(s) and ${this.state.historyReadingCount} decoded reading(s).`,
    );
    this.scheduleFlushIfNeeded();
    this.scheduleRender();
  }

  private async handleDecodedItem(item: DecodedWhoopData): Promise<void> {
    if (!this.state.session) {
      return;
    }

    if (item.kind === "history_reading") {
      if (this.state.protocolState === "connected" || this.state.protocolState === "initializing") {
        this.state.protocolState = "streaming_history";
      }
      if (this.seenReadingUnixMs.has(item.unixMs)) {
        return;
      }

      this.seenReadingUnixMs.add(item.unixMs);
      this.pendingHistoryReadings.push({
        sessionId: this.state.session.id,
        version: item.version,
        unixMs: item.unixMs,
        bpm: item.bpm,
        rr: item.rr,
        receivedAt: new Date().toISOString(),
      });
      this.state.earliestReadingUnixMs =
        this.state.earliestReadingUnixMs === null
          ? item.unixMs
          : Math.min(this.state.earliestReadingUnixMs, item.unixMs);
      this.state.latestReadingUnixMs =
        this.state.latestReadingUnixMs === null
          ? item.unixMs
          : Math.max(this.state.latestReadingUnixMs, item.unixMs);
      this.state.historyReadingCount += 1;
      return;
    }

    this.state.lastMetadata = `${item.cmd} unix=${item.unix} data=${item.data}`;
    this.pushLog(`History metadata ${item.cmd} received.`);
    this.pushDebug(`Metadata ${item.cmd} unix=${item.unix} data=${item.data}`);

    if (item.cmd === "HistoryEnd" && this.device) {
      this.state.protocolState = "waiting_after_history_end";
      await this.device.sendHistoryEndAck(item.data);
      this.state.lastAckChunk = `${item.data}`;
      this.pushLog(`Sent history_end acknowledgement for chunk ${item.data}.`);
      this.pushDebug(`Acked HistoryEnd chunk ${item.data}`);
      await touchSession(this.state.session.id);
    }

    if (item.cmd === "HistoryComplete") {
      await this.flushBuffers();
      await markSessionCompleted(this.state.session.id);
      this.state.historyComplete = true;
      this.state.protocolState = "complete";
      this.state.resumableSession = null;
      this.pushLog(`Session ${this.state.session.id} marked complete.`);
      this.pushDebug(`State -> complete for session ${this.state.session.id}`);
    }
  }

  private async downloadSessionExport(): Promise<void> {
    if (!this.state.session) {
      this.setStatus("No session available to export yet.");
      this.render();
      return;
    }

    await this.flushBuffers();

    const payload = await exportSession(this.state.session.id);
    const file = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(file);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `froop-session-${this.state.session.id}.json`;
    anchor.click();
    URL.revokeObjectURL(url);

    this.pushLog(`Exported session ${this.state.session.id} as JSON.`);
    this.setStatus("Session export downloaded.");
    this.render();
  }

  private setStatus(message: string): void {
    this.state.status = message;
  }

  private pushLog(message: string): void {
    if (
      this.isSyncHot() &&
      (message.startsWith("Sent command") ||
        message.startsWith("History metadata") ||
        message.startsWith("Subscribed to"))
    ) {
      return;
    }

    const timestamp = new Date().toLocaleTimeString();
    this.state.logLines = [`${timestamp} ${message}`, ...this.state.logLines].slice(
      0,
      FroopApp.MAX_LOG_LINES,
    );
  }

  private scheduleRender(): void {
    if (this.renderScheduled) {
      return;
    }

    this.renderScheduled = true;
    window.setTimeout(() => {
      this.renderScheduled = false;
      if (!this.isSyncHot() && this.state.lastPacket) {
        this.lastRenderedPacket = this.state.lastPacket;
        this.previewSuppressed = false;
      } else if (!this.lastRenderedPacket && this.state.lastPacket) {
        this.lastRenderedPacket = this.state.lastPacket;
      }
      this.render();
    }, FroopApp.RENDER_INTERVAL_MS);
  }

  private scheduleFlushIfNeeded(): void {
    const overThreshold =
      this.pendingPackets.length >= FroopApp.FLUSH_PACKET_THRESHOLD ||
      this.pendingHistoryReadings.length >= FroopApp.FLUSH_READING_THRESHOLD;

    if (overThreshold) {
      void this.flushBuffers();
      return;
    }

    if (this.flushTimer !== null) {
      return;
    }

    this.flushTimer = window.setTimeout(() => {
      this.flushTimer = null;
      void this.flushBuffers();
    }, FroopApp.FLUSH_INTERVAL_MS);
  }

  private async flushBuffers(): Promise<void> {
    if (this.flushTimer !== null) {
      window.clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }

    if (this.flushInFlight) {
      await this.flushInFlight;
      return;
    }

    if (this.pendingPackets.length === 0 && this.pendingHistoryReadings.length === 0) {
      return;
    }

    const packets = this.pendingPackets;
    const historyReadings = this.pendingHistoryReadings;
    this.pendingPackets = [];
    this.pendingHistoryReadings = [];
    const flushStartedAt = performance.now();

    this.flushInFlight = (async () => {
      await Promise.all([
        storePackets(packets),
        storeHistoryReadings(historyReadings),
      ]);
      if (this.state.session) {
        await touchSession(this.state.session.id);
      }
    })();

    try {
      await this.flushInFlight;
      this.recordFlush(performance.now() - flushStartedAt);
    } finally {
      this.flushInFlight = null;

      if (this.pendingPackets.length > 0 || this.pendingHistoryReadings.length > 0) {
        this.scheduleFlushIfNeeded();
      }
    }
  }

  private async activateSession(session: SessionRecord, resumeExisting: boolean): Promise<void> {
    this.state.session = session;
    this.state.lastPacket = null;
    this.lastRenderedPacket = null;
    this.previewSuppressed = false;
    this.decoder.reset();
    this.pendingPackets = [];
    this.pendingHistoryReadings = [];
    this.seenReadingUnixMs.clear();

    if (!resumeExisting) {
      this.state.packetCount = 0;
      this.state.historyReadingCount = 0;
      this.resetTelemetry();
      this.state.resumableSession = session;
      return;
    }

    const [packetCount, historyReadingCount, unixMsValues] = await Promise.all([
      countPacketsForSession(session.id),
      countHistoryReadingsForSession(session.id),
      getHistoryReadingUnixMsForSession(session.id),
    ]);

    this.state.packetCount = packetCount;
    this.state.historyReadingCount = historyReadingCount;
    this.resetTelemetry();
    for (const unixMs of unixMsValues) {
      this.seenReadingUnixMs.add(unixMs);
    }
    this.state.resumableSession = session;
  }

  private async loadResumableSession(): Promise<void> {
    this.state.resumableSession = await getLatestIncompleteSession();
    this.scheduleRender();
  }

  private isSyncHot(): boolean {
    return Date.now() - this.lastSyncActivityAt < FroopApp.ACTIVE_SYNC_WINDOW_MS;
  }

  private resetTelemetry(): void {
    this.state.syncStartedAt = Date.now();
    this.state.flushCount = 0;
    this.state.avgFlushMs = 0;
    this.state.maxFlushMs = 0;
    this.state.lastFlushMs = 0;
    this.state.earliestReadingUnixMs = null;
    this.state.latestReadingUnixMs = null;
    this.state.expectedEndUnixMs = Date.now();
    this.state.historyComplete = false;
    this.state.protocolState = "initializing";
    this.state.lastMetadata = "None";
    this.state.lastAckChunk = "None";
    this.state.lastNotificationAt = null;
    this.state.debugLines = [];
  }

  private recordFlush(durationMs: number): void {
    this.state.flushCount += 1;
    this.state.lastFlushMs = durationMs;
    this.state.maxFlushMs = Math.max(this.state.maxFlushMs, durationMs);

    const count = this.state.flushCount;
    if (count === 1) {
      this.state.avgFlushMs = durationMs;
      return;
    }

    this.state.avgFlushMs =
      ((this.state.avgFlushMs * (count - 1)) + durationMs) / count;
  }

  private formatElapsed(): string {
    if (!this.state.syncStartedAt) {
      return "0s";
    }

    const elapsedSeconds = Math.max(1, Math.floor((Date.now() - this.state.syncStartedAt) / 1000));
    return `${elapsedSeconds}s`;
  }

  private formatRate(count: number): string {
    if (!this.state.syncStartedAt) {
      return "0";
    }

    const elapsedSeconds = Math.max(1, (Date.now() - this.state.syncStartedAt) / 1000);
    return (count / elapsedSeconds).toFixed(1);
  }

  private progressPercent(): number {
    if (this.state.historyComplete) {
      return 100;
    }

    if (
      this.state.earliestReadingUnixMs === null ||
      this.state.latestReadingUnixMs === null
    ) {
      return 0;
    }

    const start = this.state.earliestReadingUnixMs;
    const latest = this.state.latestReadingUnixMs;
    const end = this.state.expectedEndUnixMs ?? Date.now();
    const total = Math.max(1, end - start);
    const done = Math.max(0, latest - start);

    return Math.max(0, Math.min(99.5, (done / total) * 100));
  }

  private progressLabel(): string {
    if (this.state.historyComplete) {
      return "History sync complete";
    }

    if (
      this.state.earliestReadingUnixMs === null ||
      this.state.latestReadingUnixMs === null
    ) {
      return "Waiting for decoded readings";
    }

    return `${formatDateTime(this.state.earliestReadingUnixMs)} -> ${formatDateTime(this.state.latestReadingUnixMs)}`;
  }

  private progressEstimateLabel(): string {
    if (this.state.historyComplete) {
      return "Protocol status: complete";
    }

    const percent = this.progressPercent();
    if (percent <= 0 || !this.state.syncStartedAt) {
      return "Protocol status: waiting for enough decoded data";
    }

    return `Timeline coverage estimate: ${percent.toFixed(1)}%`;
  }

  private currentProtocolState(): string {
    if (
      this.state.connected &&
      !this.state.historyComplete &&
      this.state.lastNotificationAt !== null &&
      Date.now() - this.state.lastNotificationAt > 10_000
    ) {
      return "stalled_waiting_for_packets";
    }

    return this.state.protocolState;
  }

  private lastNotificationLabel(): string {
    if (!this.state.lastNotificationAt) {
      return "Never";
    }

    const ageSeconds = Math.floor((Date.now() - this.state.lastNotificationAt) / 1000);
    return `${formatDateTime(this.state.lastNotificationAt)} (${ageSeconds}s ago)`;
  }

  private pushDebug(message: string): void {
    const timestamp = new Date().toLocaleTimeString();
    this.state.debugLines = [`${timestamp} ${message}`, ...this.state.debugLines].slice(0, 12);
  }

  private updateProtocolStateFromLog(message: string): void {
    if (message.includes("Connected to the WHOOP BLE service")) {
      this.state.protocolState = "connected";
      return;
    }

    if (message.includes("Sending WHOOP initialization commands")) {
      this.state.protocolState = "initializing";
      return;
    }

    if (message.includes("Sent command history_start")) {
      this.state.protocolState = "requesting_history";
    }
  }
}

export function renderApp(root: HTMLDivElement): void {
  new FroopApp(root).render();
}

function capability(name: string, enabled: boolean): string {
  const state = enabled ? "available" : "missing";
  return `
    <span class="capability-name">${name}</span>
    <span class="capability-state capability-state-${state}">${state}</span>
  `;
}

function formatBytes(bytes: readonly number[]): string {
  return bytes
    .slice(0, 64)
    .map((value) => value.toString(16).padStart(2, "0"))
    .join(" ");
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function explainBluetoothError(message: string): { status: string; log?: string } {
  const normalized = message.toLowerCase();

  if (normalized.includes("permission has been blocked")) {
    return {
      status:
        "Chrome blocked Bluetooth for this site. Open Site settings, allow Bluetooth devices, then reload and try again.",
      log:
        "Recovery: click the site settings icon in Chrome, allow Bluetooth devices for 127.0.0.1:5173, reload, then press Request Bluetooth Access again.",
    };
  }

  if (normalized.includes("globally disabled")) {
    return {
      status:
        "Web Bluetooth is disabled in this browser context. Open the app in full Chrome, Edge, or Brave on desktop and try again.",
      log:
        "If needed, check chrome://settings/content/bluetoothDevices and chrome://flags/#enable-experimental-web-platform-features.",
    };
  }

  if (normalized.includes("user cancelled") || normalized.includes("user canceled")) {
    return {
      status: "Bluetooth permission request was cancelled.",
    };
  }

  return {
    status: `Connection failed: ${message}`,
  };
}

function formatMs(value: number): string {
  return `${value.toFixed(1)} ms`;
}

function formatDateTime(unixMs: number): string {
  return new Date(unixMs).toLocaleString();
}
