use crate::protocol::{BleNotification, PendingCommand, WhoopCommand};

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum SessionPhase {
    Idle,
    Initializing,
    SyncingHistory,
    Complete,
    Error,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum CoreEvent {
    PhaseChanged(SessionPhase),
    CommandQueued(WhoopCommand),
    NotificationReceived { bytes: usize },
    HistoryBatchReady { packets: usize },
    Log(&'static str),
}

#[derive(Debug, Default)]
pub struct DownloadSession {
    phase: SessionPhase,
    pending_history_packets: usize,
    received_notifications: usize,
}

impl DownloadSession {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn phase(&self) -> SessionPhase {
        self.phase
    }

    pub fn begin_initialization(&mut self) -> Vec<CoreEvent> {
        self.phase = SessionPhase::Initializing;

        vec![
            CoreEvent::PhaseChanged(self.phase),
            CoreEvent::Log("Queueing WHOOP initialization commands."),
            CoreEvent::CommandQueued(WhoopCommand::HelloHarvard),
            CoreEvent::CommandQueued(WhoopCommand::SetTime),
            CoreEvent::CommandQueued(WhoopCommand::GetName),
            CoreEvent::CommandQueued(WhoopCommand::EnterHighFreqSync),
        ]
    }

    pub fn initialization_commands(&self) -> Vec<PendingCommand> {
        vec![
            PendingCommand::new(WhoopCommand::HelloHarvard, "Introduce the client to the strap."),
            PendingCommand::new(WhoopCommand::SetTime, "Set the strap clock from the browser."),
            PendingCommand::new(WhoopCommand::GetName, "Read the device name for UI display."),
            PendingCommand::new(
                WhoopCommand::EnterHighFreqSync,
                "Enable high-frequency sync before history download.",
            ),
        ]
    }

    pub fn begin_history_download(&mut self) -> Vec<PendingCommand> {
        self.phase = SessionPhase::SyncingHistory;
        vec![PendingCommand::new(
            WhoopCommand::HistoryStart,
            "Request historical data from the strap.",
        )]
    }

    pub fn on_notification(&mut self, notification: BleNotification) -> Vec<CoreEvent> {
        self.received_notifications += 1;

        let mut events = vec![CoreEvent::NotificationReceived {
            bytes: notification.bytes.len(),
        }];

        if self.phase == SessionPhase::SyncingHistory {
            self.pending_history_packets += 1;

            if self.pending_history_packets >= 32 {
                events.push(CoreEvent::HistoryBatchReady {
                    packets: self.pending_history_packets,
                });
                self.pending_history_packets = 0;
            }
        }

        events
    }

    pub fn finish(&mut self) -> Vec<CoreEvent> {
        self.phase = SessionPhase::Complete;

        let mut events = Vec::new();
        if self.pending_history_packets > 0 {
            events.push(CoreEvent::HistoryBatchReady {
                packets: self.pending_history_packets,
            });
            self.pending_history_packets = 0;
        }
        events.push(CoreEvent::PhaseChanged(self.phase));
        events
    }

    pub fn received_notifications(&self) -> usize {
        self.received_notifications
    }
}

impl Default for SessionPhase {
    fn default() -> Self {
        Self::Idle
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::protocol::Characteristic;

    #[test]
    fn initialization_moves_session_to_initializing() {
        let mut session = DownloadSession::new();
        let events = session.begin_initialization();

        assert_eq!(session.phase(), SessionPhase::Initializing);
        assert!(events.iter().any(|event| matches!(
            event,
            CoreEvent::CommandQueued(WhoopCommand::HelloHarvard)
        )));
    }

    #[test]
    fn history_notifications_flush_in_batches() {
        let mut session = DownloadSession::new();
        let _ = session.begin_history_download();

        let mut emitted = Vec::new();
        for _ in 0..32 {
            emitted.extend(session.on_notification(BleNotification {
                characteristic: Characteristic::DataFromStrap,
                bytes: vec![0xAA],
            }));
        }

        assert!(emitted.iter().any(|event| matches!(
            event,
            CoreEvent::HistoryBatchReady { packets: 32 }
        )));
    }
}

