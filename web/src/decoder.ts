const SOF = 0xaa;

const PacketType = {
  CommandResponse: 36,
  HistoricalData: 47,
  Metadata: 49,
} as const;

const MetadataType = {
  HistoryStart: 1,
  HistoryEnd: 2,
  HistoryComplete: 3,
} as const;

type PartialPacket = {
  packetType: number;
  seq: number;
  cmd: number;
  size: number;
  data: number[];
};

export type HistoryReading = {
  kind: "history_reading";
  version: number;
  unixMs: number;
  bpm: number;
  rr: number[];
};

export type HistoryMetadata = {
  kind: "history_metadata";
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

  push(characteristic: string, bytes: readonly number[]): DecodedWhoopData[] {
    const completePacket = this.consume(characteristic, bytes);
    if (!completePacket) {
      return [];
    }

    const decoded = decodePacket(completePacket);
    return decoded ? [decoded] : [];
  }

  reset(): void {
    this.partialPackets.clear();
  }

  private consume(
    characteristic: string,
    bytes: readonly number[],
  ): DecodedWhoopPacket | null {
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

    const lengthBytes = Uint8Array.from([bytes[1], bytes[2]]);
    if (crc8(lengthBytes) !== bytes[3]) {
      return null;
    }

    const size = bytes[1] | (bytes[2] << 8);
    const inner = Array.from(bytes.slice(4));
    if (inner.length < 3) {
      return null;
    }

    const partialPacket: PartialPacket = {
      packetType: inner[0],
      seq: inner[1],
      cmd: inner[2],
      size,
      data: inner.slice(3),
    };

    if (partialPacket.data.length + 3 < size) {
      this.partialPackets.set(characteristic, partialPacket);
      return null;
    }

    return finalizePacket(partialPacket);
  }
}

function finalizePacket(packet: PartialPacket): DecodedWhoopPacket | null {
  if (packet.data.length < 4) {
    return null;
  }

  const payload = packet.data.slice(0, -4);
  const expectedCrc = readU32Le(packet.data, packet.data.length - 4);
  const computedCrc = crc32(
    Uint8Array.from([packet.packetType, packet.seq, packet.cmd, ...payload]),
  );

  if (expectedCrc !== computedCrc) {
    return null;
  }

  return {
    packetType: packet.packetType,
    seq: packet.seq,
    cmd: packet.cmd,
    payload,
  };
}

function decodePacket(packet: DecodedWhoopPacket): DecodedWhoopData | null {
  switch (packet.packetType) {
    case PacketType.Metadata:
      return decodeMetadata(packet);
    case PacketType.HistoricalData:
      return decodeHistorical(packet);
    default:
      return null;
  }
}

function decodeMetadata(packet: DecodedWhoopPacket): HistoryMetadata | null {
  if (packet.payload.length < 14) {
    return null;
  }

  const unix = readU32Le(packet.payload, 0);
  const data = readU32Le(packet.payload, 10);

  const cmd =
    packet.cmd === MetadataType.HistoryStart
      ? "HistoryStart"
      : packet.cmd === MetadataType.HistoryEnd
        ? "HistoryEnd"
        : packet.cmd === MetadataType.HistoryComplete
          ? "HistoryComplete"
          : null;

  if (!cmd) {
    return null;
  }

  return {
    kind: "history_metadata",
    unix,
    data,
    cmd,
  };
}

function decodeHistorical(packet: DecodedWhoopPacket): HistoryReading | null {
  if (packet.payload.length >= 77 && (packet.seq === 12 || packet.seq === 24)) {
    return decodeHistoricalV12(packet);
  }

  return decodeHistoricalGeneric(packet);
}

function decodeHistoricalGeneric(packet: DecodedWhoopPacket): HistoryReading | null {
  if (packet.payload.length < 20) {
    return null;
  }

  const unixMs = readU32Le(packet.payload, 4) * 1000;
  const bpm = packet.payload[14];
  const rrCount = packet.payload[15];
  const rr: number[] = [];

  for (let index = 0; index < 4; index += 1) {
    const offset = 16 + index * 2;
    if (offset + 2 > packet.payload.length) {
      break;
    }
    const value = readU16Le(packet.payload, offset);
    if (value !== 0) {
      rr.push(value);
    }
  }

  if (rr.length !== rrCount) {
    return null;
  }

  return {
    kind: "history_reading",
    version: packet.seq,
    unixMs,
    bpm,
    rr,
  };
}

function decodeHistoricalV12(packet: DecodedWhoopPacket): HistoryReading | null {
  if (packet.payload.length < 77) {
    return null;
  }

  const unixMs = readU32Le(packet.payload, 4) * 1000;
  const bpm = packet.payload[14];
  const rrCount = packet.payload[15];
  const rr: number[] = [];

  for (let index = 0; index < Math.min(rrCount, 4); index += 1) {
    const offset = 16 + index * 2;
    const value = readU16Le(packet.payload, offset);
    if (value !== 0) {
      rr.push(value);
    }
  }

  return {
    kind: "history_reading",
    version: packet.seq,
    unixMs,
    bpm,
    rr,
  };
}

function readU16Le(data: readonly number[], offset: number): number {
  return data[offset] | (data[offset + 1] << 8);
}

function readU32Le(data: readonly number[], offset: number): number {
  return (
    data[offset] |
    (data[offset + 1] << 8) |
    (data[offset + 2] << 16) |
    (data[offset + 3] << 24 >>> 0)
  ) >>> 0;
}

function crc8(data: Uint8Array): number {
  let crc = 0;
  for (const byte of data) {
    crc ^= byte;
    for (let index = 0; index < 8; index += 1) {
      crc = (crc & 0x80) !== 0 ? ((crc << 1) ^ 0x07) & 0xff : (crc << 1) & 0xff;
    }
  }
  return crc;
}

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let index = 0; index < 8; index += 1) {
      crc = (crc & 1) !== 0 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
    }
  }
  return (~crc) >>> 0;
}
