import {
  countPacketsForSession,
  createSession,
  exportSession,
  storePacket,
  type SessionRecord,
  updateSessionDeviceName,
} from "./storage";
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
  packetCount: number;
  logLines: string[];
  lastPacket: WhoopNotification | null;
};

class FroopApp {
  private readonly state: AppState = {
    busy: false,
    connected: false,
    status: "Ready for Chromium desktop.",
    session: null,
    packetCount: 0,
    logLines: [],
    lastPacket: null,
  };

  private device: ConnectedWhoopDevice | null = null;

  constructor(private readonly root: HTMLDivElement) {}

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
                <dt>Session ID</dt>
                <dd class="mono">${escapeHtml(this.state.session?.id ?? "None")}</dd>
              </div>
            </dl>
          </div>

          <div>
            <h2>Last packet</h2>
            <p class="packet-meta">
              ${
                this.state.lastPacket
                  ? `${this.state.lastPacket.characteristic} · ${this.state.lastPacket.bytes.length} bytes`
                  : "No notifications received yet."
              }
            </p>
            <pre class="packet-preview">${
              this.state.lastPacket
                ? escapeHtml(formatBytes(this.state.lastPacket.bytes))
                : "Connect to the strap and subscribe to WHOOP notifications."
            }</pre>
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

  private async connect(): Promise<void> {
    if (!this.canConnect()) {
      this.setStatus(
        "A supported Chromium desktop browser with Web Bluetooth and IndexedDB is required.",
      );
      return;
    }

    this.state.busy = true;
    this.setStatus("Requesting Bluetooth permission from Chrome...");
    this.pushLog("Asking Chrome for Bluetooth access to a WHOOP device.");
    this.render();

    try {
      const session = await createSession("Pending WHOOP device");
      this.state.session = session;
      this.state.packetCount = 0;
      this.state.lastPacket = null;
      this.pushLog(`Created local session ${session.id}.`);
      this.render();

      const connectedDevice = await connectToWhoop({
        onLog: (line) => {
          this.pushLog(line);
          this.render();
        },
        onNotification: (notification) => {
          void this.handleNotification(notification);
        },
        onDisconnected: () => {
          this.device = null;
          this.state.connected = false;
          this.setStatus("WHOOP disconnected.");
          this.pushLog("The strap disconnected from the browser.");
          this.render();
        },
      });

      await updateSessionDeviceName(session.id, connectedDevice.name);

      this.device = connectedDevice;
      this.state.connected = true;
      this.state.session = {
        ...session,
        deviceName: connectedDevice.name,
      };
      this.setStatus(`Connected to ${connectedDevice.name}. Listening for notifications.`);
      this.pushLog(`Session ${session.id} is now linked to ${connectedDevice.name}.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown connection error.";
      const guidance = explainBluetoothError(message);
      this.setStatus(guidance.status);
      this.pushLog(`Connection failed: ${message}`);
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
    this.device = null;
    this.state.connected = false;
    this.setStatus("Disconnected.");
    this.pushLog("Disconnected from the WHOOP strap.");
    this.render();
  }

  private async handleNotification(notification: WhoopNotification): Promise<void> {
    this.state.lastPacket = notification;

    if (!this.state.session) {
      this.pushLog("Received a packet before a session was created.");
      this.render();
      return;
    }

    await storePacket({
      sessionId: this.state.session.id,
      characteristic: notification.characteristic,
      bytes: notification.bytes,
      receivedAt: new Date().toISOString(),
    });

    this.state.packetCount = await countPacketsForSession(this.state.session.id);
    this.setStatus(`Connected. Stored ${this.state.packetCount} packet(s) locally.`);
    this.render();
  }

  private async downloadSessionExport(): Promise<void> {
    if (!this.state.session) {
      this.setStatus("No session available to export yet.");
      this.render();
      return;
    }

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
    const timestamp = new Date().toLocaleTimeString();
    this.state.logLines = [`${timestamp} ${message}`, ...this.state.logLines].slice(0, 12);
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
