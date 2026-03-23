# Froop

Froop is a browser-first WHOOP client.

The current MVP is a Chromium desktop web app that can:

- connect to a WHOOP band with Web Bluetooth
- subscribe to WHOOP BLE characteristics
- send the initial WHOOP command sequence
- capture raw packets
- store sessions and packets in IndexedDB
- export a captured session as JSON

## Current status

Working today:

- Chromium desktop connection flow
- WHOOP device selection through the browser picker
- raw packet capture and local storage
- local session export

Not finished yet:

- full packet decoding
- full historical sync lifecycle handling
- normalized heart-rate/history storage
- data analysis UI

## Browser support

Supported target right now:

- Google Chrome desktop

May work:

- Brave desktop
- Microsoft Edge desktop

Not a target right now:

- Safari
- Firefox
- mobile browsers

Web Bluetooth requires a secure context, so use `https://` or `localhost`.

## Repo layout

- [`crates/froop-core`](/Users/gecazo/Projects/froop/crates/froop-core): shared Rust protocol/session primitives
- [`crates/froop-wasm`](/Users/gecazo/Projects/froop/crates/froop-wasm): browser-facing Rust wrapper for future WASM integration
- [`web`](/Users/gecazo/Projects/froop/web): Vite frontend with Web Bluetooth and IndexedDB
- [`docs/standalone-app-plan.md`](/Users/gecazo/Projects/froop/docs/standalone-app-plan.md): implementation notes and roadmap

## Run locally

Install frontend dependencies:

```bash
cd /Users/gecazo/Projects/froop/web
npm install
```

Start the local app:

```bash
cd /Users/gecazo/Projects/froop/web
npm run dev
```

Then open the local URL shown by Vite in Chrome.

## Build

Frontend production build:

```bash
cd /Users/gecazo/Projects/froop/web
npm run build
```

Rust checks:

```bash
cd /Users/gecazo/Projects/froop
cargo test
```

## How to test the MVP

1. Open the app in Chrome on desktop.
2. Click `Request Bluetooth Access`.
3. Select the WHOOP device in the browser picker.
4. Confirm packets begin increasing in the UI.
5. Export the session JSON if you want to inspect the captured raw packets.

## Next steps

1. Port the packet decoder from `openwhoop` into the browser flow or WASM layer.
2. Handle WHOOP history metadata and follow-up acknowledgements.
3. Store decoded readings instead of only raw packets.
4. Add analysis and visualization.
