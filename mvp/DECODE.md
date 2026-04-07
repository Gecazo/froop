# OpenWhoop Decode / Parsing Guide

This document explains how incoming Bluetooth messages are decoded in `example/openwhoop`, from raw BLE notifications to typed structures saved in the database.

## Scope

The decoding path covered here is:

1. BLE notification intake (`openwhoop/src/device.rs`)
2. Frame parsing + integrity checks (`openwhoop-codec/src/packet.rs`)
3. Packet-type dispatch (`openwhoop-codec/src/whoop_data.rs`)
4. Field-level parsing of historical/metadata/event/log/version payloads
5. App-level handling and persistence (`openwhoop/src/openwhoop.rs`)

## 1. Where bytes come from (BLE notifications)

The strap exposes a custom WHOOP BLE service and characteristics in `openwhoop-codec/src/constants.rs`:

- `CMD_TO_STRAP` (write): app -> strap commands
- `CMD_FROM_STRAP` (notify): command responses
- `DATA_FROM_STRAP` (notify): historical/sensor stream
- `EVENTS_FROM_STRAP` (notify)
- `MEMFAULT` (notify)

During initialization (`WhoopDevice::initialize`), the app subscribes to notify characteristics and sends startup commands (`hello_harvard`, `set_time`, `get_name`, `enter_high_freq_sync`).

For history download (`WhoopDevice::sync_history`):

- `notifications = peripheral.notifications().await?`
- sends `WhoopPacket::history_start()`
- loops over each `ValueNotification { uuid, value }`
- routes each notification into decode path via `OpenWhoop::handle_packet`

## 2. First decode stage: framed WHOOP packet (`WhoopPacket::from_data`)

`WhoopPacket::from_data(Vec<u8>)` parses the transport frame format.

## 2.1 Frame structure (as implemented)

The parser expects this order:

- `SOF` (1 byte): must be `0xAA`
- `length` (2 bytes, little-endian)
- `header_crc8` (1 byte)
- `inner` payload (`length` bytes expected after the 3-byte header)

Inside `inner` the decoder expects:

- `packet_type` (1 byte)
- `seq` (1 byte)
- `cmd` (1 byte)
- `data` (variable)
- `crc32` (4 bytes at the end, if full frame is present)

## 2.2 Validation and extraction steps

`from_data` does this in order:

1. Rejects very short buffers (`PacketTooShort` if `< 8` bytes).
2. Pops and validates SOF (`InvalidSof` if not `0xAA`).
3. Reads 2-byte `length` and 1-byte header CRC8.
4. Recomputes CRC8 over the 2 length bytes; mismatch -> `InvalidHeaderCrc8`.
5. Converts `length` to `usize`; rejects values `< 8` (`InvalidPacketLength`).
6. Marks packet as `partial` when currently available bytes are fewer than `length`.
7. If not partial, removes last 4 bytes as expected CRC32, recomputes CRC32 over remaining inner bytes, validates (`InvalidDataCrc32` on mismatch).
8. Extracts `packet_type`, `seq`, `cmd`, and keeps remaining bytes as `data`.

The result type is:

- `packet_type: PacketType`
- `seq: u8`
- `cmd: u8`
- `data: Vec<u8>`
- `partial: bool`
- `size: usize` (decoded frame length)

## 3. Handling split BLE notifications (partial reassembly)

Historical data can arrive split across multiple BLE notifications.

In `OpenWhoop::handle_packet` (`openwhoop/src/openwhoop.rs`):

- For `DATA_FROM_STRAP`, it first tries `WhoopPacket::from_data(packet.bytes)`.
- If `packet.partial == true`, it stores this partial packet in `self.packet` and waits for next notification.
- On next chunk(s), it appends raw bytes to `self.packet.data`.
- It considers packet complete when `whoop_packet.data.len() + 3 >= whoop_packet.size`.
  - `+3` accounts for `packet_type + seq + cmd`, which are not in `data` anymore.
- Before completion, function returns `Ok(None)` (no typed data yet).
- After completion, it moves on to payload decoding with `WhoopData::from_packet`.

Notes:

- Reassembly logic is only applied on `DATA_FROM_STRAP` path.
- `CMD_FROM_STRAP` is decoded immediately from single notification.

## 4. Second decode stage: typed payload dispatch (`WhoopData::from_packet`)

`WhoopData::from_packet(WhoopPacket)` switches on `packet.packet_type`:

- `HistoricalData` -> `parse_historical_packet(packet.seq, packet.data)`
- `Metadata` -> `parse_metadata(packet)`
- `ConsoleLogs` -> `parse_console_log(packet.data)`
- `Event` -> `parse_event(packet)`
- `CommandResponse`:
  - converts `packet.cmd` to `CommandNumber`
  - currently implemented parser: `ReportVersionInfo` -> `parse_report_version_info`
  - other command responses return `Unimplemented`

If conversion/parsing fails, errors are propagated or caller drops that message (depending on call site).

## 5. Historical data parsing

`parse_historical_packet(version, packet)` chooses parser by shape/version:

1. If `packet.len() >= 1188` -> IMU parser (`parse_historical_packet_with_imu`)
2. Else if `version` is `12` or `24` and `packet.len() >= 77` -> DSP-aware parser (`parse_historical_packet_v12`)
3. Else -> generic parser (`parse_historical_packet_generic`)

### 5.1 Generic historical parser (older/non-DSP layouts)

`parse_historical_packet_generic` reads:

- 4 bytes sequence (ignored)
- 4 bytes unix seconds -> converted to milliseconds (`unix * 1000`)
- 6 bytes sub/flags/sensor metadata (ignored)
- 1 byte `bpm`
- 1 byte `rr_count`
- 4 RR slots (`u16 LE` each), zeros skipped

Validation:

- Number of non-zero RR values must equal `rr_count`, otherwise `InvalidRRCount`.

Output:

- `WhoopData::HistoryReading(HistoryReading { unix, bpm, rr, imu_data: vec![], sensor_data: None })`

### 5.2 V12/V24 parser (`parse_historical_packet_v12`)

This path decodes additional DSP-related fields (SpO2/temp/PPG/etc.) by fixed byte offsets.

Decoded core fields:

- timestamp: `d[4..8]` (`u32 LE`) -> ms
- heart rate: `d[14]`
- RR count: `d[15]`
- RR intervals: from `d[16..24]` (`u16 LE`, up to 4, non-zero)

Decoded DSP/sensor fields (`SensorData`):

- `ppg_green` @ `26..28`
- `ppg_red_ir` @ `28..30`
- gravity vector `f32 LE[3]` @ `33..45`
- `skin_contact` @ `48`
- `spo2_red` @ `61..63`
- `spo2_ir` @ `63..65`
- `skin_temp_raw` @ `65..67`
- `ambient_light` @ `67..69`
- `led_drive_1` @ `69..71`
- `led_drive_2` @ `71..73`
- `resp_rate_raw` @ `73..75`
- `signal_quality` @ `75..77`

Output:

- `HistoryReading` with `sensor_data: Some(SensorData { ... })`
- `imu_data` empty in this parser

### 5.3 Large IMU parser (`parse_historical_packet_with_imu`)

Used for very large packets (`>= 1188`).

High-level behavior:

1. Reads packet header fields and RR values.
2. Validates RR count consistency.
3. Skips legacy 4-byte activity block.
4. Reads 100 samples per axis for accelerometer and gyroscope at fixed offsets.
5. Converts raw `i16` values into scaled units:
   - accel `g = raw / 1875.0`
   - gyro `dps = raw / 15.0`

Axis offsets (from parser constants):

- `ACC_X_OFFSET = 85`
- `ACC_Y_OFFSET = 285`
- `ACC_Z_OFFSET = 485`
- `GYR_X_OFFSET = 688`
- `GYR_Y_OFFSET = 888`
- `GYR_Z_OFFSET = 1088`

Output:

- `HistoryReading` with populated `imu_data: Vec<ImuSample>` and `sensor_data: None`

## 6. Metadata / events / console logs / version

### 6.1 Metadata (`PacketType::Metadata`)

`parse_metadata` reads:

- `cmd` from frame command byte -> `MetadataType`
  - `1 = HistoryStart`
  - `2 = HistoryEnd`
  - `3 = HistoryComplete`
- from payload:
  - `unix` (`u32 LE`)
  - 6 bytes padding
  - `data` (`u32 LE`)

Returns `WhoopData::HistoryMetadata { unix, data, cmd }`.

### 6.2 Event (`PacketType::Event`)

`parse_event`:

- maps frame `cmd` into `CommandNumber` when possible
- skips first payload byte
- reads `unix` (`u32 LE`)
- maps known events to:
  - `RunAlarm { unix }` for `CommandNumber::RunAlarm`
  - generic `Event { unix, event }` for selected command IDs
  - `UnknownEvent { unix, event: raw_cmd }` for unmapped command numbers

### 6.3 Console logs (`PacketType::ConsoleLogs`)

`parse_console_log`:

- skips first payload byte
- reads `unix` (`u32 LE`)
- reads 2 extra bytes (ignored)
- cleans byte stream by removing `34 00 01` marker windows
- decodes UTF-8 with lossy fallback when needed

Returns `WhoopData::ConsoleLog { unix, log }`.

### 6.4 Version response (`PacketType::CommandResponse` + `ReportVersionInfo`)

`parse_report_version_info` reads 8 little-endian `u32` values after 3 ignored bytes:

- Harvard: major/minor/patch/build
- Boylston: major/minor/patch/build

Returns `WhoopData::VersionInfo { harvard, boylston }` as dotted strings.

## 7. App-level handling after decode (`OpenWhoop::handle_data`)

`OpenWhoop::handle_data` handles decoded values:

- `HistoryReading`:
  - only if `hr.is_valid()` (`bpm > 0`)
  - de-duplicates immediate duplicates by `(unix, bpm)`
  - appends to in-memory `history_packets`
- `HistoryMetadata::HistoryEnd`:
  - flushes buffered readings to DB via `create_readings(...)`
  - sends ack packet `WhoopPacket::history_end(data)` back to strap
- `ConsoleLog`: logs via tracing
- `VersionInfo`: logs versions
- others: currently ignored/no-op

`WhoopDevice::sync_history` sends any outgoing packet returned by `handle_data`.

## 8. Offline re-decoding path (`rerun` command)

The `rerun` CLI command reuses the same decode logic:

- reads raw packets from DB (`db_handler.get_packets`)
- calls `whoop.handle_packet(packet)` for each

This is useful when parser code is improved and old stored raw packets need to be reinterpreted.

## 9. Error behavior and drop behavior

Core error types are in `openwhoop-codec/src/error.rs` (`WhoopError`).

Important runtime behavior in `OpenWhoop::handle_packet`:

- if `WhoopData::from_packet(...)` fails, the code returns `Ok(None)` in that branch, effectively dropping undecodable payloads without aborting the sync loop.
- some frame-level errors from `WhoopPacket::from_data(...)` are propagated with `?` and can bubble up.

This keeps the stream resilient to malformed/unknown payloads while still failing on critical transport-frame issues.

## 10. Quick mental model

Think of decoding as two nested layers:

1. Transport layer (`WhoopPacket::from_data`):
   - framing, SOF, length, CRCs, packet type/seq/cmd extraction
2. Domain layer (`WhoopData::from_packet`):
   - interpret payload bytes into heart-rate history, metadata, logs, events, version info

Then app logic (`OpenWhoop`) decides what to persist, what to acknowledge, and what to ignore.
