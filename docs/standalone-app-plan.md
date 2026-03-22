# Froop standalone browser app

This repository now contains the first scaffold for a standalone browser-first
Whoop downloader.

## What is in place

- `crates/froop-core`
  - Shared Rust state for session lifecycle and command queueing.
  - WHOOP BLE UUID constants copied from the `openwhoop` protocol notes.
- `crates/froop-wasm`
  - Browser-facing Rust wrapper around the shared core.
  - Ready to receive `wasm-bindgen` in the next step.
- `web`
  - Chrome-first browser shell for the standalone app.
  - WHOOP Web Bluetooth connection and characteristic subscription.
  - Raw packet capture into IndexedDB.
  - Manual session export to JSON.

## What comes next

1. Port packet framing and command encoding from `openwhoop-codec`.
2. Send the WHOOP initialization sequence after connection.
3. Request historical data and persist decoded readings.
4. Add `wasm-bindgen` and move session handling into Rust/WASM.
5. Add richer exports such as CSV and decoded JSON.
6. Add local analysis from stored readings.

## Why this first step matters

The original `openwhoop` project cleanly separates protocol and algorithms from
CLI/device concerns, but it is not browser-ready as a whole. This scaffold
creates the boundary we need:

- browser transport on the web side
- shared Rust session logic in the middle
- analysis and decoding to be added incrementally
