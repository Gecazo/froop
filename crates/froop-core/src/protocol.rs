pub const WHOOP_SERVICE_UUID: &str = "61080001-8d6d-82b8-614a-1c8cb0f8dcc6";
pub const CMD_TO_STRAP_UUID: &str = "61080002-8d6d-82b8-614a-1c8cb0f8dcc6";
pub const CMD_FROM_STRAP_UUID: &str = "61080003-8d6d-82b8-614a-1c8cb0f8dcc6";
pub const EVENTS_FROM_STRAP_UUID: &str = "61080004-8d6d-82b8-614a-1c8cb0f8dcc6";
pub const DATA_FROM_STRAP_UUID: &str = "61080005-8d6d-82b8-614a-1c8cb0f8dcc6";
pub const MEMFAULT_UUID: &str = "61080007-8d6d-82b8-614a-1c8cb0f8dcc6";

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum Characteristic {
    CommandToStrap,
    CommandFromStrap,
    EventsFromStrap,
    DataFromStrap,
    Memfault,
}

impl Characteristic {
    pub fn uuid(self) -> &'static str {
        match self {
            Self::CommandToStrap => CMD_TO_STRAP_UUID,
            Self::CommandFromStrap => CMD_FROM_STRAP_UUID,
            Self::EventsFromStrap => EVENTS_FROM_STRAP_UUID,
            Self::DataFromStrap => DATA_FROM_STRAP_UUID,
            Self::Memfault => MEMFAULT_UUID,
        }
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum WhoopCommand {
    HelloHarvard,
    SetTime,
    GetName,
    EnterHighFreqSync,
    HistoryStart,
    HistoryEndAck,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PendingCommand {
    pub command: WhoopCommand,
    pub write_characteristic: Characteristic,
    pub payload: Vec<u8>,
    pub description: &'static str,
}

impl PendingCommand {
    pub fn new(command: WhoopCommand, description: &'static str) -> Self {
        Self {
            command,
            write_characteristic: Characteristic::CommandToStrap,
            payload: Vec::new(),
            description,
        }
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct BleNotification {
    pub characteristic: Characteristic,
    pub bytes: Vec<u8>,
}

