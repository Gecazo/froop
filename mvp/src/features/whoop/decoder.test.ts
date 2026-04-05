import { describe, expect, it } from 'vitest';

import { WhoopProtocolDecoder } from '@/features/whoop/decoder.ts';

const SOF = 0xaa;
const PACKET_TYPE_METADATA = 49;
const PACKET_TYPE_HISTORICAL = 47;

const encodeU32Le = (value: number): number[] => {
  return [value & 0xff, (value >> 8) & 0xff, (value >> 16) & 0xff, (value >> 24) & 0xff];
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
    payload[16] = 0x20;
    payload[17] = 0x03;
    payload[18] = 0x84;
    payload[19] = 0x03;

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
        rr: [800, 900]
      }
    ]);
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
