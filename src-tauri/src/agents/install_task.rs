use super::*;
use std::sync::atomic::{AtomicBool, Ordering};

#[derive(Default)]
pub(super) struct InstallTask {
    pub window: Option<WebviewWindow>,
    pub agent_id: String,
    cancelled: AtomicBool,
    child: Mutex<Option<Child>>,
    pub phase: Mutex<String>,
}
impl InstallTask {
    pub fn new(window: WebviewWindow, agent_id: String) -> Self {
        Self {
            window: Some(window),
            agent_id,
            cancelled: AtomicBool::new(false),
            child: Mutex::new(None),
            phase: Mutex::new("正在准备安装…".into()),
        }
    }
    pub fn check(&self) -> Result<(), String> {
        if self.cancelled.load(Ordering::Acquire) {
            Err("安装已取消，原版本保持可用".into())
        } else {
            Ok(())
        }
    }
    pub fn progress(&self, phase: &str) {
        if let Ok(mut current) = self.phase.lock() {
            *current = phase.into();
        }
        if let Some(window) = &self.window {
            let _ = window.emit_to(
                window.label(),
                "markune:agent-install",
                json!({"agentId":self.agent_id,"phase":phase}),
            );
        }
    }
    pub fn set_child(&self, mut child: Child) -> Result<(), String> {
        let mut slot = self.child.lock().map_err(|_| "安装进程状态不可用")?;
        if let Err(error) = self.check() {
            kill_tree(&mut child);
            return Err(error);
        }
        *slot = Some(child);
        Ok(())
    }
    pub fn try_wait(&self) -> Result<Option<std::process::ExitStatus>, String> {
        self.check()?;
        self.child
            .lock()
            .map_err(|_| "安装进程状态不可用")?
            .as_mut()
            .ok_or("安装进程已结束")?
            .try_wait()
            .map_err(|_| "安装进程不可用".into())
    }
    pub fn finish_child(&self) {
        if let Ok(mut slot) = self.child.lock() {
            if let Some(mut child) = slot.take() {
                kill_tree(&mut child);
            }
        }
    }
    pub fn cancel(&self) {
        self.cancelled.store(true, Ordering::Release);
        self.finish_child();
        self.progress("正在取消安装…");
    }
}
impl Drop for InstallTask {
    fn drop(&mut self) {
        self.finish_child();
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[cfg(unix)]
    #[test]
    fn cancellation_ends_owned_installer_process_and_rejects_later_stages() {
        let task = InstallTask::default();
        let mut builder = command(Path::new("/bin/sh"), &["-c".into(), "sleep 30".into()]);
        let child = builder.spawn().unwrap();
        let pid = child.id();
        task.set_child(child).unwrap();
        task.cancel();
        assert!(task.check().is_err());
        assert!(task.try_wait().is_err());
        assert_ne!(unsafe { libc::kill(pid as i32, 0) }, 0);
    }
}
