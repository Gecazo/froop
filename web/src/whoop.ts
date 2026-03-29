const WHOOP_SERVICE_UUID = "61080001-8d6d-82b8-614a-1c8cb0f8dcc6";
const CMD_TO_STRAP_UUID = "61080002-8d6d-82b8-614a-1c8cb0f8dcc6";

const NOTIFY_CHARACTERISTICS = [
  {
    key: "command",
    uuid: "61080003-8d6d-82b8-614a-1c8cb0f8dcc6",
    label: "CMD_FROM_STRAP",
  },
  {
    key: "events",
    uuid: "61080004-8d6d-82b8-614a-1c8cb0f8dcc6",
    label: "EVENTS_FROM_STRAP",
  },
  {
    key: "data",
    uuid: "61080005-8d6d-82b8-614a-1c8cb0f8dcc6",
    label: "DATA_FROM_STRAP",
  },
  {
    key: "memfault",
    uuid: "61080007-8d6d-82b8-614a-1c8cb0f8dcc6",
    label: "MEMFAULT",
  },
] as const;

const PacketType = {
  Command: 35,
} as const;

const CommandNumber = {
  SetClock: 10,
  SendHistoricalData: 22,
  HistoricalDataResult: 23,
  GetHelloHarvard: 35,
  GetAdvertisingNameHarvard: 76,
  EnterHighFreqSync: 96,
} as const;

export type WhoopNotification = {
  characteristic: string;
  bytes: number[];
};

export type ConnectedWhoopDevice = {
  name: string;
  disconnect: () => void;
  sendHistoryEndAck: (data: number) => Promise<void>;
};

type ConnectOptions = {
  onLog: (message: string) => void;
  onNotification: (notification: WhoopNotification) => void;
  onDisconnected: () => void;
};

export async function connectToWhoop(
  options: ConnectOptions,
): Promise<ConnectedWhoopDevice> {
  options.onLog("Opening device picker.");

  const device = await navigator.bluetooth.requestDevice({
    filters: [{ services: [WHOOP_SERVICE_UUID] }],
    optionalServices: [WHOOP_SERVICE_UUID],
  });

  options.onLog(`Selected ${device.name ?? "Unnamed WHOOP device"}.`);

  const server = await device.gatt?.connect();
  if (!server) {
    throw new Error("Chrome did not return a GATT server.");
  }

  const service = await server.getPrimaryService(WHOOP_SERVICE_UUID);
  options.onLog("Connected to the WHOOP BLE service.");

  device.addEventListener("gattserverdisconnected", () => {
    options.onDisconnected();
  });

  for (const entry of NOTIFY_CHARACTERISTICS) {
    const characteristic = await service.getCharacteristic(entry.uuid);
    await characteristic.startNotifications();

    characteristic.addEventListener("characteristicvaluechanged", (event) => {
      const target = event.target as BluetoothRemoteGATTCharacteristic | null;
      const view = target?.value;
      if (!view) {
        return;
      }

      const bytes = new Uint8Array(view.buffer, view.byteOffset, view.byteLength);

      options.onNotification({
        characteristic: entry.label,
        bytes: Array.from(bytes),
      });
    });

    options.onLog(`Subscribed to ${entry.label}.`);
  }

  const commandCharacteristic = await service.getCharacteristic(CMD_TO_STRAP_UUID);
  options.onLog("Sending WHOOP initialization commands.");
  await sendCommand(
    commandCharacteristic,
    buildCommand(CommandNumber.GetHelloHarvard, [0x00]),
    "hello_harvard",
    options,
  );
  await sendCommand(
    commandCharacteristic,
    buildSetTimeCommand(),
    "set_time",
    options,
  );
  await sendCommand(
    commandCharacteristic,
    buildCommand(CommandNumber.GetAdvertisingNameHarvard, [0x00]),
    "get_name",
    options,
  );
  await sendCommand(
    commandCharacteristic,
    buildCommand(CommandNumber.EnterHighFreqSync, []),
    "enter_high_freq_sync",
    options,
  );
  await sendCommand(
    commandCharacteristic,
    buildCommand(CommandNumber.SendHistoricalData, [0x00]),
    "history_start",
    options,
  );

  return {
    name: device.name ?? "WHOOP",
    disconnect: () => {
      if (device.gatt?.connected) {
        device.gatt.disconnect();
      }
    },
    sendHistoryEndAck: async (data: number) => {
      await sendCommand(
        commandCharacteristic,
        buildHistoryEndAck(data),
        "history_end_ack",
        options,
      );
    },
  };
}

async function sendCommand(
  characteristic: BluetoothRemoteGATTCharacteristic,
  payload: Uint8Array,
  label: string,
  options: ConnectOptions,
): Promise<void> {
  await characteristic.writeValueWithoutResponse(payload);
  options.onLog(`Sent command ${label}.`);
  await sleep(120);
}

function buildSetTimeCommand(): Uint8Array {
  const unix = Math.floor(Date.now() / 1000);
  const data = [
    unix & 0xff,
    (unix >> 8) & 0xff,
    (unix >> 16) & 0xff,
    (unix >> 24) & 0xff,
    0x00,
    0x00,
    0x00,
    0x00,
    0x00,
  ];

  return buildCommand(CommandNumber.SetClock, data);
}

function buildCommand(cmd: number, data: number[]): Uint8Array {
  const packet = Uint8Array.from([PacketType.Command, 0x00, cmd, ...data]);
  const length = packet.length + 4;
  const lengthBytes = Uint8Array.from([length & 0xff, (length >> 8) & 0xff]);
  const headerCrc = crc8(lengthBytes);
  const dataCrc = crc32(packet);

  return Uint8Array.from([
    0xaa,
    ...lengthBytes,
    headerCrc,
    ...packet,
    dataCrc & 0xff,
    (dataCrc >> 8) & 0xff,
    (dataCrc >> 16) & 0xff,
    (dataCrc >> 24) & 0xff,
  ]);
}

function buildHistoryEndAck(data: number): Uint8Array {
  return buildCommand(CommandNumber.HistoricalDataResult, [
    0x01,
    data & 0xff,
    (data >> 8) & 0xff,
    (data >> 16) & 0xff,
    (data >> 24) & 0xff,
    0x00,
    0x00,
    0x00,
    0x00,
  ]);
}

function crc8(data: Uint8Array): number {
  let crc = 0;
  for (const byte of data) {
    crc ^= byte;
    for (let i = 0; i < 8; i += 1) {
      crc = (crc & 0x80) !== 0 ? ((crc << 1) ^ 0x07) & 0xff : (crc << 1) & 0xff;
    }
  }
  return crc;
}

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let i = 0; i < 8; i += 1) {
      crc = (crc & 1) !== 0 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
    }
  }
  return (~crc) >>> 0;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}
