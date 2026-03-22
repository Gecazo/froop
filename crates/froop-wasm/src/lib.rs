use froop_core::{
    BleNotification, Characteristic, CoreEvent, DownloadSession, PendingCommand, SessionPhase,
};

pub struct BrowserApp {
    session: DownloadSession,
}

impl BrowserApp {
    pub fn new() -> Self {
        Self {
            session: DownloadSession::new(),
        }
    }

    pub fn phase(&self) -> SessionPhase {
        self.session.phase()
    }

    pub fn start_initialization(&mut self) -> (Vec<PendingCommand>, Vec<CoreEvent>) {
        let events = self.session.begin_initialization();
        let commands = self.session.initialization_commands();
        (commands, events)
    }

    pub fn start_history_download(&mut self) -> Vec<PendingCommand> {
        self.session.begin_history_download()
    }

    pub fn handle_notification(
        &mut self,
        characteristic: Characteristic,
        bytes: Vec<u8>,
    ) -> Vec<CoreEvent> {
        self.session.on_notification(BleNotification {
            characteristic,
            bytes,
        })
    }

    pub fn finish_download(&mut self) -> Vec<CoreEvent> {
        self.session.finish()
    }
}

impl Default for BrowserApp {
    fn default() -> Self {
        Self::new()
    }
}

