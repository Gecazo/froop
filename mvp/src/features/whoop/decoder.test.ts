import { describe, expect, it } from 'vitest';

import { WhoopProtocolDecoder } from '@/features/whoop/decoder.ts';

const SOF = 0xaa;
const PACKET_TYPE_METADATA = 49;
const PACKET_TYPE_HISTORICAL = 47;

const encodeU32Le = (value: number): number[] => {
  return [value & 0xff, (value >> 8) & 0xff, (value >> 16) & 0xff, (value >> 24) & 0xff];
};

const encodeU16Le = (value: number): number[] => {
  return [value & 0xff, (value >> 8) & 0xff];
};

const encodeI16Be = (value: number): number[] => {
  const normalized = value & 0xffff;
  return [(normalized >> 8) & 0xff, normalized & 0xff];
};

const writeU32Le = (target: number[], offset: number, value: number): void => {
  const encoded = encodeU32Le(value);
  target[offset] = encoded[0]!;
  target[offset + 1] = encoded[1]!;
  target[offset + 2] = encoded[2]!;
  target[offset + 3] = encoded[3]!;
};

const writeU16Le = (target: number[], offset: number, value: number): void => {
  const encoded = encodeU16Le(value);
  target[offset] = encoded[0]!;
  target[offset + 1] = encoded[1]!;
};

const writeI16Be = (target: number[], offset: number, value: number): void => {
  const encoded = encodeI16Be(value);
  target[offset] = encoded[0]!;
  target[offset + 1] = encoded[1]!;
};

const writeF32Le = (target: number[], offset: number, value: number): void => {
  const view = new DataView(new ArrayBuffer(4));
  view.setFloat32(0, value, true);
  target[offset] = view.getUint8(0);
  target[offset + 1] = view.getUint8(1);
  target[offset + 2] = view.getUint8(2);
  target[offset + 3] = view.getUint8(3);
};

const crc8 = (data: Uint8Array): number => {
  let crc = 0;
  for (const byte of data) {
    crc ^= byte;
    for (let i = 0; i < 8; i += 1) {
      crc = (crc & 0x80) !== 0 ? ((crc << 1) ^ 0x07) & 0xff : (crc << 1) & 0xff;
    }
  }
  return crc;
};

const crc32 = (data: Uint8Array): number => {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let i = 0; i < 8; i += 1) {
      crc = (crc & 1) !== 0 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
    }
  }
  return (~crc) >>> 0;
};

const buildWhoopPacket = (
  packetType: number,
  seq: number,
  cmd: number,
  payload: number[]
): number[] => {
  const body = Uint8Array.from([packetType, seq, cmd, ...payload]);
  const dataCrc = crc32(body);
  const size = body.length + 4;
  const sizeBytes = Uint8Array.from([size & 0xff, (size >> 8) & 0xff]);

  return [
    SOF,
    ...sizeBytes,
    crc8(sizeBytes),
    ...body,
    dataCrc & 0xff,
    (dataCrc >> 8) & 0xff,
    (dataCrc >> 16) & 0xff,
    (dataCrc >> 24) & 0xff
  ];
};

describe('WhoopProtocolDecoder', () => {
  it('decodes metadata command packets', () => {
    const decoder = new WhoopProtocolDecoder();
    const metadataPayload = [
      ...encodeU32Le(1735689600),
      0,
      0,
      0,
      0,
      0,
      0,
      ...encodeU32Le(42)
    ];

    const packet = buildWhoopPacket(PACKET_TYPE_METADATA, 0, 1, metadataPayload);

    expect(decoder.push('CMD_FROM_STRAP', packet)).toEqual([
      {
        kind: 'history_metadata',
        cmd: 'HistoryStart',
        unix: 1735689600,
        data: 42
      }
    ]);
  });

  it('reassembles split history packets and decodes readings', () => {
    const decoder = new WhoopProtocolDecoder();
    const payload = new Array<number>(24).fill(0);
    const unixSeconds = 1735700000;

    payload[4] = unixSeconds & 0xff;
    payload[5] = (unixSeconds >> 8) & 0xff;
    payload[6] = (unixSeconds >> 16) & 0xff;
    payload[7] = (unixSeconds >> 24) & 0xff;
    payload[14] = 61;
    payload[15] = 2;
    writeU16Le(payload, 16, 800);
    writeU16Le(payload, 18, 900);

    const packet = buildWhoopPacket(PACKET_TYPE_HISTORICAL, 11, 0, payload);

    const firstChunk = packet.slice(0, 9);
    const secondChunk = packet.slice(9);

    expect(decoder.push('DATA_FROM_STRAP', firstChunk)).toEqual([]);
    expect(decoder.push('DATA_FROM_STRAP', secondChunk)).toEqual([
      {
        kind: 'history_reading',
        version: 11,
        unixMs: unixSeconds * 1000,
        bpm: 61,
        rr: [800, 900],
        sensor_data: null,
        imu_data: []
      }
    ]);
  });

  it('parses V12/V24 sensor payload fields', () => {
    const decoder = new WhoopProtocolDecoder();
    const payload = new Array<number>(77).fill(0);
    const unixSeconds = 1735701111;
    writeU32Le(payload, 4, unixSeconds);
    payload[14] = 78;
    payload[15] = 1;
    writeU16Le(payload, 16, 837);

    writeU16Le(payload, 26, 2490);
    writeU16Le(payload, 28, 28880);
    writeF32Le(payload, 33, -0.20670653879642487);
    writeF32Le(payload, 37, 0.10356689244508743);
    writeF32Le(payload, 41, 1.002172827720642);
    payload[48] = 68;
    writeU16Le(payload, 61, 523);
    writeU16Le(payload, 63, 616);
    writeU16Le(payload, 65, 910);
    writeU16Le(payload, 67, 617);
    writeU16Le(payload, 69, 331);
    writeU16Le(payload, 71, 96);
    writeU16Le(payload, 73, 3073);
    writeU16Le(payload, 75, 3074);

    const packet = buildWhoopPacket(PACKET_TYPE_HISTORICAL, 12, 0, payload);
    const decoded = decoder.push('DATA_FROM_STRAP', packet);
    expect(decoded).toHaveLength(1);

    const reading = decoded[0];
    if (!reading || reading.kind !== 'history_reading') {
      throw new Error('Expected a history reading result.');
    }

    expect(reading.version).toBe(12);
    expect(reading.unixMs).toBe(unixSeconds * 1000);
    expect(reading.bpm).toBe(78);
    expect(reading.rr).toEqual([837]);
    expect(reading.imu_data).toEqual([]);
    expect(reading.sensor_data).toMatchObject({
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
      skin_contact: 68
    });
    expect(reading.sensor_data?.accel_gravity[0]).toBeCloseTo(-0.20670654, 6);
    expect(reading.sensor_data?.accel_gravity[1]).toBeCloseTo(0.10356689, 6);
    expect(reading.sensor_data?.accel_gravity[2]).toBeCloseTo(1.00217283, 6);
  });

  it('parses large historical packets with IMU samples', () => {
    const decoder = new WhoopProtocolDecoder();
    const payload = new Array<number>(1300).fill(0);
    const unixSeconds = 1735702222;

    writeU32Le(payload, 4, unixSeconds);
    payload[14] = 62;
    payload[15] = 1;
    writeU16Le(payload, 16, 837);

    for (let index = 0; index < 100; index += 1) {
      const offset = index * 2;
      writeI16Be(payload, 85 + offset, 1875);
      writeI16Be(payload, 285 + offset, -937);
      writeI16Be(payload, 485 + offset, 0);
      writeI16Be(payload, 688 + offset, 150);
      writeI16Be(payload, 888 + offset, -75);
      writeI16Be(payload, 1088 + offset, 30);
    }

    const packet = buildWhoopPacket(PACKET_TYPE_HISTORICAL, 9, 0, payload);
    const decoded = decoder.push('DATA_FROM_STRAP', packet);
    expect(decoded).toHaveLength(1);

    const reading = decoded[0];
    if (!reading || reading.kind !== 'history_reading') {
      throw new Error('Expected a history reading result.');
    }

    expect(reading.version).toBe(9);
    expect(reading.unixMs).toBe(unixSeconds * 1000);
    expect(reading.bpm).toBe(62);
    expect(reading.rr).toEqual([837]);
    expect(reading.sensor_data).toBeNull();
    expect(reading.imu_data).toHaveLength(100);
    expect(reading.imu_data[0]).toMatchObject({
      acc_x_g: 1,
      acc_y_g: -937 / 1875,
      acc_z_g: 0,
      gyr_x_dps: 10,
      gyr_y_dps: -5,
      gyr_z_dps: 2
    });
    expect(reading.imu_data[99]).toMatchObject({
      acc_x_g: 1,
      acc_y_g: -937 / 1875,
      acc_z_g: 0,
      gyr_x_dps: 10,
      gyr_y_dps: -5,
      gyr_z_dps: 2
    });
  });

  it('drops packets when crc does not match', () => {
    const decoder = new WhoopProtocolDecoder();
    const payload = [
      ...encodeU32Le(1735689600),
      0,
      0,
      0,
      0,
      0,
      0,
      ...encodeU32Le(11)
    ];
    const packet = buildWhoopPacket(PACKET_TYPE_METADATA, 0, 2, payload);
    const corrupted = [...packet];
    const lastIndex = corrupted.length - 1;
    const lastValue = corrupted.at(lastIndex);
    if (lastValue === undefined) {
      throw new Error('Expected packet tail byte to exist.');
    }

    corrupted[lastIndex] = lastValue ^ 0xff;

    expect(decoder.push('CMD_FROM_STRAP', corrupted)).toEqual([]);
  });

  it('maps history metadata command ids', () => {
    const decoder = new WhoopProtocolDecoder();
    const payload = [
      ...encodeU32Le(1735689600),
      0,
      0,
      0,
      0,
      0,
      0,
      ...encodeU32Le(1)
    ];

    const historyEnd = buildWhoopPacket(PACKET_TYPE_METADATA, 0, 2, payload);
    const historyComplete = buildWhoopPacket(PACKET_TYPE_METADATA, 0, 3, payload);

    expect(decoder.push('CMD_FROM_STRAP', historyEnd)[0]?.kind).toBe('history_metadata');
    expect(decoder.push('CMD_FROM_STRAP', historyEnd)[0]).toMatchObject({ cmd: 'HistoryEnd' });
    expect(decoder.push('CMD_FROM_STRAP', historyComplete)[0]).toMatchObject({
      cmd: 'HistoryComplete'
    });
  });
});
