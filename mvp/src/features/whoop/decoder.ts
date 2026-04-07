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

const MIN_PACKET_LEN_FOR_IMU = 1188;
const IMU_AXIS_OFFSET_ACC_X = 85;
const IMU_AXIS_OFFSET_ACC_Y = 285;
const IMU_AXIS_OFFSET_ACC_Z = 485;
const IMU_AXIS_OFFSET_GYR_X = 688;
const IMU_AXIS_OFFSET_GYR_Y = 888;
const IMU_AXIS_OFFSET_GYR_Z = 1088;
const IMU_SAMPLES_PER_AXIS = 100;
const IMU_ACC_SENSITIVITY = 1875;
const IMU_GYR_SENSITIVITY = 15;
const IMU_BASE_HEADER_OFFSET = 20;
const LEGACY_ACTIVITY_BYTES = 4;

type PartialPacket = {
  packetType: number;
  seq: number;
  cmd: number;
  size: number;
  data: number[];
};

export type SensorData = {
  ppg_green: number;
  ppg_red_ir: number;
  spo2_red: number;
  spo2_ir: number;
  skin_temp_raw: number;
  ambient_light: number;
  led_drive_1: number;
  led_drive_2: number;
  resp_rate_raw: number;
  signal_quality: number;
  skin_contact: number;
  accel_gravity: [number, number, number];
};

export type ImuSample = {
  acc_x_g: number;
  acc_y_g: number;
  acc_z_g: number;
  gyr_x_dps: number;
  gyr_y_dps: number;
  gyr_z_dps: number;
};

export type HistoryReading = {
  kind: 'history_reading';
  version: number;
  unixMs: number;
  bpm: number;
  rr: number[];
  sensor_data: SensorData | null;
  imu_data: ImuSample[];
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
  if (packet.payload.length >= MIN_PACKET_LEN_FOR_IMU) {
    return decodeHistoricalWithImu(packet);
  }

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
    rr,
    sensor_data: null,
    imu_data: []
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

  const skinContact = packet.payload[48];
  const gravity = readGravityVector(packet.payload);
  if (skinContact === undefined || gravity === null) {
    return null;
  }

  const sensor_data: SensorData = {
    ppg_green: readU16Le(packet.payload, 26) ?? 0,
    ppg_red_ir: readU16Le(packet.payload, 28) ?? 0,
    spo2_red: readU16Le(packet.payload, 61) ?? 0,
    spo2_ir: readU16Le(packet.payload, 63) ?? 0,
    skin_temp_raw: readU16Le(packet.payload, 65) ?? 0,
    ambient_light: readU16Le(packet.payload, 67) ?? 0,
    led_drive_1: readU16Le(packet.payload, 69) ?? 0,
    led_drive_2: readU16Le(packet.payload, 71) ?? 0,
    resp_rate_raw: readU16Le(packet.payload, 73) ?? 0,
    signal_quality: readU16Le(packet.payload, 75) ?? 0,
    skin_contact: skinContact,
    accel_gravity: gravity
  };

  return {
    kind: 'history_reading',
    version: packet.seq,
    unixMs,
    bpm,
    rr,
    sensor_data,
    imu_data: []
  };
};

const decodeHistoricalWithImu = (packet: DecodedWhoopPacket): HistoryReading | null => {
  if (packet.payload.length < MIN_PACKET_LEN_FOR_IMU) {
    return null;
  }

  const unix = readU32Le(packet.payload, 4);
  const bpm = packet.payload[14];
  const rrCount = packet.payload[15];
  if (unix === null || bpm === undefined || rrCount === undefined) {
    return null;
  }

  const rr: number[] = [];
  let cursor = 16;
  for (let index = 0; index < rrCount; index += 1) {
    const value = readU16Le(packet.payload, cursor);
    if (value === null) {
      return null;
    }
    cursor += 2;
    if (value !== 0) {
      rr.push(value);
    }
  }

  if (rr.length !== rrCount) {
    return null;
  }

  cursor += LEGACY_ACTIVITY_BYTES;

  const headerOffset = IMU_BASE_HEADER_OFFSET + rr.length * 2;
  const imuPacketData = packet.payload.slice(cursor);

  const accXRaw = readImuAxis(imuPacketData, IMU_AXIS_OFFSET_ACC_X, headerOffset);
  const accYRaw = readImuAxis(imuPacketData, IMU_AXIS_OFFSET_ACC_Y, headerOffset);
  const accZRaw = readImuAxis(imuPacketData, IMU_AXIS_OFFSET_ACC_Z, headerOffset);
  const gyrXRaw = readImuAxis(imuPacketData, IMU_AXIS_OFFSET_GYR_X, headerOffset);
  const gyrYRaw = readImuAxis(imuPacketData, IMU_AXIS_OFFSET_GYR_Y, headerOffset);
  const gyrZRaw = readImuAxis(imuPacketData, IMU_AXIS_OFFSET_GYR_Z, headerOffset);

  if (
    accXRaw === null ||
    accYRaw === null ||
    accZRaw === null ||
    gyrXRaw === null ||
    gyrYRaw === null ||
    gyrZRaw === null
  ) {
    return null;
  }

  const imu_data: ImuSample[] = [];
  for (let index = 0; index < IMU_SAMPLES_PER_AXIS; index += 1) {
    imu_data.push({
      acc_x_g: accXRaw[index]! / IMU_ACC_SENSITIVITY,
      acc_y_g: accYRaw[index]! / IMU_ACC_SENSITIVITY,
      acc_z_g: accZRaw[index]! / IMU_ACC_SENSITIVITY,
      gyr_x_dps: gyrXRaw[index]! / IMU_GYR_SENSITIVITY,
      gyr_y_dps: gyrYRaw[index]! / IMU_GYR_SENSITIVITY,
      gyr_z_dps: gyrZRaw[index]! / IMU_GYR_SENSITIVITY
    });
  }

  return {
    kind: 'history_reading',
    version: packet.seq,
    unixMs: unix * 1000,
    bpm,
    rr,
    sensor_data: null,
    imu_data
  };
};

const readImuAxis = (
  data: readonly number[],
  axisOffset: number,
  headerOffset: number
): number[] | null => {
  const axis: number[] = [];
  for (let index = 0; index < IMU_SAMPLES_PER_AXIS; index += 1) {
    const start = axisOffset - headerOffset + index * 2;
    const value = readI16Be(data, start);
    if (value === null) {
      return null;
    }

    axis.push(value);
  }

  return axis;
};

const readGravityVector = (data: readonly number[]): [number, number, number] | null => {
  const x = readF32Le(data, 33);
  const y = readF32Le(data, 37);
  const z = readF32Le(data, 41);
  if (x === null || y === null || z === null) {
    return null;
  }

  return [x, y, z];
};

const readU16Le = (data: readonly number[], offset: number): number | null => {
  const first = data[offset];
  const second = data[offset + 1];
  if (first === undefined || second === undefined) {
    return null;
  }

  return first | (second << 8);
};

const readI16Be = (data: readonly number[], offset: number): number | null => {
  const first = data[offset];
  const second = data[offset + 1];
  if (first === undefined || second === undefined) {
    return null;
  }

  const value = (first << 8) | second;
  return (value << 16) >> 16;
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

const readF32Le = (data: readonly number[], offset: number): number | null => {
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

  const bytes = Uint8Array.from([first, second, third, fourth]);
  const view = new DataView(bytes.buffer);
  return view.getFloat32(0, true);
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
