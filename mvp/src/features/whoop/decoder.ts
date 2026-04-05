const SOF = 0xaa;

const PacketType = {
  CommandResponse: 36,
  HistoricalData: 47,
  Metadata: 49
} as const;

const MetadataType = {
  HistoryStart: 1,
  HistoryEnd: 2,
  HistoryComplete: 3
} as const;

type PartialPacket = {
  packetType: number;
  seq: number;
  cmd: number;
  size: number;
  data: number[];
};

export type HistoryReading = {
  kind: 'history_reading';
  version: number;
  unixMs: number;
  bpm: number;
  rr: number[];
};

export type HistoryMetadata = {
  kind: 'history_metadata';
  unix: number;
  data: number;
  cmd: keyof typeof MetadataType;
};

export type DecodedWhoopData = HistoryReading | HistoryMetadata;

type DecodedWhoopPacket = {
  packetType: number;
  seq: number;
  cmd: number;
  payload: number[];
};

export class WhoopProtocolDecoder {
  private readonly partialPackets = new Map<string, PartialPacket>();

  public push(characteristic: string, bytes: readonly number[]): DecodedWhoopData[] {
    const completePacket = this.consume(characteristic, bytes);
    if (!completePacket) {
      return [];
    }

    const decoded = decodePacket(completePacket);
    return decoded ? [decoded] : [];
  }

  public reset(): void {
    this.partialPackets.clear();
  }

  private consume(characteristic: string, bytes: readonly number[]): DecodedWhoopPacket | null {
    const partial = this.partialPackets.get(characteristic);
    if (partial) {
      partial.data.push(...bytes);
      if (partial.data.length + 3 < partial.size) {
        return null;
      }

      this.partialPackets.delete(characteristic);
      return finalizePacket(partial);
    }

    if (bytes.length < 8 || bytes[0] !== SOF) {
      return null;
    }

    const lengthLow = bytes[1];
    const lengthHigh = bytes[2];
    const headerCrc = bytes[3];
    if (
      lengthLow === undefined ||
      lengthHigh === undefined ||
      headerCrc === undefined
    ) {
      return null;
    }

    const lengthBytes = Uint8Array.from([lengthLow, lengthHigh]);
    if (crc8(lengthBytes) !== headerCrc) {
      return null;
    }

    const size = lengthLow | (lengthHigh << 8);
    const inner = Array.from(bytes.slice(4));
    if (inner.length < 3) {
      return null;
    }

    const partialPacket: PartialPacket = {
      packetType: inner[0]!,
      seq: inner[1]!,
      cmd: inner[2]!,
      size,
      data: inner.slice(3)
    };

    if (partialPacket.data.length + 3 < size) {
      this.partialPackets.set(characteristic, partialPacket);
      return null;
    }

    return finalizePacket(partialPacket);
  }
}

const finalizePacket = (packet: PartialPacket): DecodedWhoopPacket | null => {
  if (packet.data.length < 4) {
    return null;
  }

  const payload = packet.data.slice(0, -4);
  const expectedCrc = readU32Le(packet.data, packet.data.length - 4);
  if (expectedCrc === null) {
    return null;
  }
  const computedCrc = crc32(
    Uint8Array.from([packet.packetType, packet.seq, packet.cmd, ...payload])
  );

  if (expectedCrc !== computedCrc) {
    return null;
  }

  return {
    packetType: packet.packetType,
    seq: packet.seq,
    cmd: packet.cmd,
    payload
  };
};

const decodePacket = (packet: DecodedWhoopPacket): DecodedWhoopData | null => {
  switch (packet.packetType) {
    case PacketType.Metadata:
      return decodeMetadata(packet);
    case PacketType.HistoricalData:
      return decodeHistorical(packet);
    default:
      return null;
  }
};

const decodeMetadata = (packet: DecodedWhoopPacket): HistoryMetadata | null => {
  if (packet.payload.length < 14) {
    return null;
  }

  const unix = readU32Le(packet.payload, 0);
  const data = readU32Le(packet.payload, 10);
  if (unix === null || data === null) {
    return null;
  }

  const cmd =
    packet.cmd === MetadataType.HistoryStart
      ? 'HistoryStart'
      : packet.cmd === MetadataType.HistoryEnd
        ? 'HistoryEnd'
        : packet.cmd === MetadataType.HistoryComplete
          ? 'HistoryComplete'
          : null;

  if (!cmd) {
    return null;
  }

  return {
    kind: 'history_metadata',
    unix,
    data,
    cmd
  };
};

const decodeHistorical = (packet: DecodedWhoopPacket): HistoryReading | null => {
  if (packet.payload.length >= 77 && (packet.seq === 12 || packet.seq === 24)) {
    return decodeHistoricalV12(packet);
  }

  return decodeHistoricalGeneric(packet);
};

const decodeHistoricalGeneric = (packet: DecodedWhoopPacket): HistoryReading | null => {
  if (packet.payload.length < 20) {
    return null;
  }

  const unix = readU32Le(packet.payload, 4);
  const bpm = packet.payload[14];
  const rrCount = packet.payload[15];
  if (unix === null || bpm === undefined || rrCount === undefined) {
    return null;
  }

  const unixMs = unix * 1000;
  const rr: number[] = [];

  for (let index = 0; index < 4; index += 1) {
    const offset = 16 + index * 2;
    if (offset + 2 > packet.payload.length) {
      break;
    }

    const value = readU16Le(packet.payload, offset);
    if (value === null) {
      break;
    }

    if (value !== 0) {
      rr.push(value);
    }
  }

  if (rr.length !== rrCount) {
    return null;
  }

  return {
    kind: 'history_reading',
    version: packet.seq,
    unixMs,
    bpm,
    rr
  };
};

const decodeHistoricalV12 = (packet: DecodedWhoopPacket): HistoryReading | null => {
  if (packet.payload.length < 77) {
    return null;
  }

  const unix = readU32Le(packet.payload, 4);
  const bpm = packet.payload[14];
  const rrCount = packet.payload[15];
  if (unix === null || bpm === undefined || rrCount === undefined) {
    return null;
  }

  const unixMs = unix * 1000;
  const rr: number[] = [];

  for (let index = 0; index < Math.min(rrCount, 4); index += 1) {
    const offset = 16 + index * 2;
    const value = readU16Le(packet.payload, offset);
    if (value === null) {
      break;
    }

    if (value !== 0) {
      rr.push(value);
    }
  }

  return {
    kind: 'history_reading',
    version: packet.seq,
    unixMs,
    bpm,
    rr
  };
};

const readU16Le = (data: readonly number[], offset: number): number | null => {
  const first = data[offset];
  const second = data[offset + 1];
  if (first === undefined || second === undefined) {
    return null;
  }

  return first | (second << 8);
};

const readU32Le = (data: readonly number[], offset: number): number | null => {
  const first = data[offset];
  const second = data[offset + 1];
  const third = data[offset + 2];
  const fourth = data[offset + 3];
  if (
    first === undefined ||
    second === undefined ||
    third === undefined ||
    fourth === undefined
  ) {
    return null;
  }

  return (first | (second << 8) | (third << 16) | ((fourth << 24) >>> 0)) >>> 0;
};

const crc8 = (data: Uint8Array): number => {
  let crc = 0;
  for (const byte of data) {
    crc ^= byte;
    for (let index = 0; index < 8; index += 1) {
      crc = (crc & 0x80) !== 0 ? ((crc << 1) ^ 0x07) & 0xff : (crc << 1) & 0xff;
    }
  }
  return crc;
};

const crc32 = (data: Uint8Array): number => {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let index = 0; index < 8; index += 1) {
      crc = (crc & 1) !== 0 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
    }
  }
  return (~crc) >>> 0;
};
