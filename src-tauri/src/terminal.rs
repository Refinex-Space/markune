use portable_pty::{native_pty_system, Child, CommandBuilder, MasterPty, PtySize};
use serde::Serialize;
use std::collections::HashMap;
use std::env;
use std::ffi::OsStr;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::thread;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Manager, State};
use uuid::Uuid;

const DEFAULT_COLS: u16 = 80;
const DEFAULT_ROWS: u16 = 24;
const MAX_COLS: u16 = 300;
const MAX_ROWS: u16 = 120;
const MAX_INPUT_BYTES: usize = 64 * 1024;
const READ_BUFFER_BYTES: usize = 8192;
const TERMINAL_EXIT_GRACE: Duration = Duration::from_millis(100);

#[derive(Default)]
pub struct TerminalState {
    sessions: Mutex<HashMap<String, TerminalSession>>,
}

struct TerminalSession {
    writer: Box<dyn Write + Send>,
    child: Box<dyn Child + Send>,
    master: Box<dyn MasterPty + Send>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TerminalSessionInfo {
    pub id: String,
    pub cwd: String,
    pub shell: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TerminalDataEvent {
    pub session_id: String,
    pub data: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TerminalExitEvent {
    pub session_id: String,
    pub code: Option<i32>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TerminalErrorEvent {
    pub session_id: String,
    pub message: String,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum ShellHost {
    Windows,
    Macos,
    Unix,
}

#[derive(Debug, PartialEq, Eq)]
struct ShellCommand {
    program: PathBuf,
    args: Vec<String>,
}

#[derive(Debug, Default)]
struct Utf8StreamDecoder {
    pending: Vec<u8>,
}

impl TerminalState {
    pub fn shutdown(&self) {
        let sessions = {
            let mut sessions = lock_sessions(self);
            std::mem::take(&mut *sessions)
        };

        for (_, session) in sessions {
            let _ = terminate_session(session);
        }
    }
}

impl Drop for TerminalState {
    fn drop(&mut self) {
        self.shutdown();
    }
}

#[tauri::command]
pub fn terminal_spawn(
    app: AppHandle,
    state: State<'_, TerminalState>,
    root_path: String,
    cols: u16,
    rows: u16,
) -> Result<TerminalSessionInfo, String> {
    let root = validate_terminal_root(&root_path)?;
    let shell = default_shell();
    let (cols, rows) = normalize_terminal_size(cols, rows);
    let pty_system = native_pty_system();
    let pair = pty_system
        .openpty(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|error| format!("创建终端失败: {error}"))?;
    let mut command = CommandBuilder::new(&shell.program);

    for arg in &shell.args {
        command.arg(arg);
    }
    command.cwd(&root);
    scrub_command_environment(&mut command);

    let child = pair
        .slave
        .spawn_command(command)
        .map_err(|error| format!("启动 Shell 失败: {error}"))?;
    drop(pair.slave);

    let session_id = Uuid::new_v4().to_string();
    let reader = pair
        .master
        .try_clone_reader()
        .map_err(|error| format!("读取终端输出失败: {error}"))?;
    let writer = pair
        .master
        .take_writer()
        .map_err(|error| format!("写入终端失败: {error}"))?;

    lock_sessions(&state).insert(
        session_id.clone(),
        TerminalSession {
            writer,
            child,
            master: pair.master,
        },
    );
    spawn_reader_thread(app, session_id.clone(), reader);

    Ok(TerminalSessionInfo {
        id: session_id,
        cwd: root.to_string_lossy().to_string(),
        shell: shell.program.to_string_lossy().to_string(),
    })
}

#[tauri::command]
pub fn terminal_write(
    state: State<'_, TerminalState>,
    session_id: String,
    data: String,
) -> Result<(), String> {
    validate_terminal_input(&data)?;

    let mut sessions = lock_sessions(&state);
    let session = sessions
        .get_mut(&session_id)
        .ok_or_else(|| "终端会话不存在".to_string())?;

    session
        .writer
        .write_all(data.as_bytes())
        .map_err(|error| format!("写入终端失败: {error}"))?;
    session
        .writer
        .flush()
        .map_err(|error| format!("刷新终端输入失败: {error}"))
}

#[tauri::command]
pub fn terminal_resize(
    state: State<'_, TerminalState>,
    session_id: String,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
    let (cols, rows) = normalize_terminal_size(cols, rows);
    let sessions = lock_sessions(&state);
    let session = sessions
        .get(&session_id)
        .ok_or_else(|| "终端会话不存在".to_string())?;

    session
        .master
        .resize(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|error| format!("调整终端尺寸失败: {error}"))
}

#[tauri::command]
pub fn terminal_kill(app: AppHandle, session_id: String) -> Result<(), String> {
    finish_session(&app, &session_id);
    Ok(())
}

fn spawn_reader_thread(app: AppHandle, session_id: String, mut reader: Box<dyn Read + Send>) {
    thread::spawn(move || {
        let mut buffer = [0_u8; READ_BUFFER_BYTES];
        let mut decoder = Utf8StreamDecoder::default();

        loop {
            match reader.read(&mut buffer) {
                Ok(0) => {
                    emit_terminal_data(&app, &session_id, &decoder.finish());
                    finish_session(&app, &session_id);
                    break;
                }
                Ok(len) => {
                    emit_terminal_data(&app, &session_id, &decoder.push(&buffer[..len]));
                }
                Err(error) => {
                    emit_terminal_data(&app, &session_id, &decoder.finish());
                    let _ = app.emit(
                        "terminal:error",
                        TerminalErrorEvent {
                            session_id: session_id.clone(),
                            message: format!("读取终端输出失败: {error}"),
                        },
                    );
                    finish_session(&app, &session_id);
                    break;
                }
            }
        }
    });
}

fn emit_terminal_data(app: &AppHandle, session_id: &str, data: &str) {
    if data.is_empty() {
        return;
    }

    let _ = app.emit(
        "terminal:data",
        TerminalDataEvent {
            session_id: session_id.to_string(),
            data: data.to_string(),
        },
    );
}

fn finish_session(app: &AppHandle, session_id: &str) {
    let session = lock_sessions(&app.state::<TerminalState>()).remove(session_id);
    let Some(session) = session else {
        return;
    };
    let code = terminate_session(session);

    let _ = app.emit(
        "terminal:exit",
        TerminalExitEvent {
            session_id: session_id.to_string(),
            code,
        },
    );
}

fn terminate_session(mut session: TerminalSession) -> Option<i32> {
    if let Some(status) = session.child.try_wait().ok().flatten() {
        return Some(exit_code(status));
    }

    let shell_pid = session.child.process_id();
    signal_terminal_processes(shell_pid, session.master.as_ref(), false);

    if let Some(status) = wait_for_exit(&mut session.child, TERMINAL_EXIT_GRACE) {
        return Some(exit_code(status));
    }

    signal_terminal_processes(shell_pid, session.master.as_ref(), true);
    let _ = session.child.kill();
    session.child.wait().ok().map(exit_code)
}

fn wait_for_exit(
    child: &mut Box<dyn Child + Send>,
    grace: Duration,
) -> Option<portable_pty::ExitStatus> {
    let started = Instant::now();

    loop {
        if let Some(status) = child.try_wait().ok().flatten() {
            return Some(status);
        }

        if started.elapsed() >= grace {
            return None;
        }

        thread::sleep(Duration::from_millis(20));
    }
}

fn exit_code(status: portable_pty::ExitStatus) -> i32 {
    status.exit_code() as i32
}

fn signal_terminal_processes(shell_pid: Option<u32>, master: &dyn MasterPty, force: bool) {
    #[cfg(unix)]
    {
        let signal = if force { libc::SIGKILL } else { libc::SIGTERM };
        if let Some(foreground) = master.process_group_leader() {
            signal_process_group(foreground as u32, signal);
        }
        if let Some(pid) = shell_pid {
            signal_process_group(pid, signal);
        }
    }

    #[cfg(windows)]
    {
        let _ = (master, force);
        taskkill_tree(shell_pid);
    }
}

#[cfg(unix)]
fn signal_process_group(pid: u32, signal: i32) {
    if pid <= 1 || pid == std::process::id() {
        return;
    }

    unsafe {
        libc::kill(-(pid as i32), signal);
    }
}

#[cfg(windows)]
fn taskkill_tree(shell_pid: Option<u32>) {
    use std::os::windows::process::CommandExt;
    use std::process::{Command, Stdio};

    const CREATE_NO_WINDOW: u32 = 0x08000000;
    let Some(pid) = shell_pid else {
        return;
    };
    if pid == std::process::id() {
        return;
    }

    let mut command = Command::new("taskkill");
    command.creation_flags(CREATE_NO_WINDOW);
    let _ = command
        .args(["/PID", &pid.to_string(), "/T", "/F"])
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status();
}

fn lock_sessions(
    state: &TerminalState,
) -> std::sync::MutexGuard<'_, HashMap<String, TerminalSession>> {
    state
        .sessions
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
}

fn normalize_terminal_size(cols: u16, rows: u16) -> (u16, u16) {
    let cols = if cols == 0 {
        DEFAULT_COLS
    } else {
        cols.min(MAX_COLS)
    };
    let rows = if rows == 0 {
        DEFAULT_ROWS
    } else {
        rows.min(MAX_ROWS)
    };

    (cols, rows)
}

fn validate_terminal_root(root_path: &str) -> Result<PathBuf, String> {
    let root = Path::new(root_path)
        .canonicalize()
        .map_err(|error| format!("工作区路径不可用: {error}"))?;

    if !root.is_dir() {
        return Err("工作区路径不是目录".to_string());
    }

    Ok(root)
}

fn validate_terminal_input(data: &str) -> Result<(), String> {
    if data.len() > MAX_INPUT_BYTES {
        return Err("终端输入过大".to_string());
    }

    Ok(())
}

fn default_shell() -> ShellCommand {
    let host = if cfg!(windows) {
        ShellHost::Windows
    } else if cfg!(target_os = "macos") {
        ShellHost::Macos
    } else {
        ShellHost::Unix
    };

    shell_launch(host, env::var_os("SHELL").as_deref())
}

fn shell_launch(host: ShellHost, shell_env: Option<&OsStr>) -> ShellCommand {
    let program = match host {
        ShellHost::Windows => PathBuf::from("powershell.exe"),
        ShellHost::Macos => shell_env
            .filter(|value| !value.is_empty())
            .map(PathBuf::from)
            .unwrap_or_else(|| PathBuf::from("/bin/zsh")),
        ShellHost::Unix => shell_env
            .filter(|value| !value.is_empty())
            .map(PathBuf::from)
            .unwrap_or_else(|| PathBuf::from("/bin/sh")),
    };

    ShellCommand {
        args: shell_args(&program),
        program,
    }
}

fn shell_args(program: &Path) -> Vec<String> {
    let name = program
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("");
    let lowered = name.to_ascii_lowercase();
    let stem = lowered.strip_suffix(".exe").unwrap_or(&lowered);

    match stem {
        "cmd" => Vec::new(),
        "powershell" | "pwsh" => vec!["-NoLogo".to_string()],
        _ => vec!["-i".to_string()],
    }
}

fn scrub_command_environment(command: &mut CommandBuilder) {
    let sensitive_names = env::vars_os()
        .map(|(key, _)| key)
        .filter(|key| is_sensitive_env_name(&key.to_string_lossy()))
        .collect::<Vec<_>>();

    for key in sensitive_names {
        command.env_remove(key);
    }

    command.env("TERM", "xterm-256color");
    command.env("TERM_PROGRAM", "Markune");
}

fn is_sensitive_env_name(name: &str) -> bool {
    let upper = name.to_ascii_uppercase();

    if ["PASSWORD", "SECRET", "TOKEN", "PASSWD", "CREDENTIAL"]
        .iter()
        .any(|marker| upper.contains(marker))
    {
        return true;
    }

    upper
        .split(|character: char| !character.is_ascii_alphanumeric())
        .any(|part| part == "KEY" || part.ends_with("APIKEY"))
}

impl Utf8StreamDecoder {
    fn push(&mut self, chunk: &[u8]) -> String {
        if chunk.is_empty() && self.pending.is_empty() {
            return String::new();
        }

        let mut bytes = std::mem::take(&mut self.pending);
        bytes.extend_from_slice(chunk);
        let suffix = incomplete_utf8_suffix_len(&bytes);
        let complete_len = bytes.len() - suffix;
        self.pending = bytes.split_off(complete_len);
        String::from_utf8_lossy(&bytes).into_owned()
    }

    fn finish(&mut self) -> String {
        let pending = std::mem::take(&mut self.pending);
        String::from_utf8_lossy(&pending).into_owned()
    }
}

fn incomplete_utf8_suffix_len(bytes: &[u8]) -> usize {
    let max = bytes.len().min(3);

    for suffix_len in 1..=max {
        let index = bytes.len() - suffix_len;
        let byte = bytes[index];

        if byte & 0b1100_0000 != 0b1000_0000 {
            let width = utf8_sequence_width(byte);
            if width > suffix_len {
                return suffix_len;
            }
            return 0;
        }
    }

    0
}

fn utf8_sequence_width(lead: u8) -> usize {
    if lead & 0b1000_0000 == 0 {
        1
    } else if lead & 0b1110_0000 == 0b1100_0000 {
        2
    } else if lead & 0b1111_0000 == 0b1110_0000 {
        3
    } else if lead & 0b1111_1000 == 0b1111_0000 {
        4
    } else {
        1
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[cfg(unix)]
    use std::io::Read;

    #[test]
    fn normalize_terminal_size_clamps_invalid_values() {
        assert_eq!(normalize_terminal_size(0, 0), (80, 24));
        assert_eq!(normalize_terminal_size(500, 200), (300, 120));
        assert_eq!(normalize_terminal_size(120, 40), (120, 40));
    }

    #[test]
    fn validate_terminal_root_rejects_missing_directory() {
        let result = validate_terminal_root("/path/that/does/not/exist");

        assert!(result.is_err());
    }

    #[test]
    fn validate_terminal_input_rejects_oversized_payload() {
        let data = "a".repeat(MAX_INPUT_BYTES + 1);

        assert!(validate_terminal_input(&data).is_err());
        assert!(validate_terminal_input("pwd\n").is_ok());
    }

    #[test]
    fn default_shell_has_a_program_name() {
        let shell = default_shell();

        assert!(!shell.program.as_os_str().is_empty());
        assert!(!shell.args.is_empty() || cfg!(windows));
    }

    #[test]
    fn shell_launch_uses_interactive_or_quiet_profile() {
        let macos = shell_launch(ShellHost::Macos, Some(OsStr::new("/bin/zsh")));
        let unix = shell_launch(ShellHost::Unix, None);
        let powershell = shell_launch(ShellHost::Windows, Some(OsStr::new("/bin/bash")));
        let pwsh = shell_args(Path::new("pwsh.exe"));
        let cmd = shell_args(Path::new("cmd.exe"));

        assert_eq!(macos.program, PathBuf::from("/bin/zsh"));
        assert_eq!(macos.args, vec!["-i".to_string()]);
        assert_eq!(unix.program, PathBuf::from("/bin/sh"));
        assert_eq!(unix.args, vec!["-i".to_string()]);
        assert_eq!(powershell.program, PathBuf::from("powershell.exe"));
        assert_eq!(powershell.args, vec!["-NoLogo".to_string()]);
        assert_eq!(pwsh, vec!["-NoLogo".to_string()]);
        assert!(cmd.is_empty());
    }

    #[test]
    fn sensitive_env_names_match_credentials_only() {
        assert!(is_sensitive_env_name("OPENAI_API_KEY"));
        assert!(is_sensitive_env_name("MARKUNE_CODEX_PROVIDER_API_KEY"));
        assert!(is_sensitive_env_name("AWS_SECRET_ACCESS_KEY"));
        assert!(is_sensitive_env_name("GITHUB_TOKEN"));
        assert!(is_sensitive_env_name("database_password"));
        assert!(!is_sensitive_env_name("PATH"));
        assert!(!is_sensitive_env_name("HOME"));
        assert!(!is_sensitive_env_name("TERM"));
        assert!(!is_sensitive_env_name("MONKEY"));
        assert!(!is_sensitive_env_name("KEYBOARD_LAYOUT"));
    }

    #[test]
    fn scrub_command_environment_sets_markune_terminal_identity() {
        let mut command = CommandBuilder::new("/bin/sh");

        scrub_command_environment(&mut command);

        assert_eq!(
            command.get_env("TERM").and_then(|value| value.to_str()),
            Some("xterm-256color")
        );
        assert_eq!(
            command
                .get_env("TERM_PROGRAM")
                .and_then(|value| value.to_str()),
            Some("Markune")
        );
    }

    #[test]
    fn utf8_stream_decoder_keeps_split_characters() {
        let mut decoder = Utf8StreamDecoder::default();
        let bytes = "中文".as_bytes();

        assert_eq!(decoder.push(&bytes[..1]), "");
        assert_eq!(decoder.push(&bytes[1..4]), "中");
        assert_eq!(decoder.push(&bytes[4..]), "文");
        assert_eq!(decoder.finish(), "");
    }

    #[test]
    fn utf8_stream_decoder_keeps_split_emoji_and_flushes_invalid_tail() {
        let mut decoder = Utf8StreamDecoder::default();
        let emoji = "😀".as_bytes();

        assert_eq!(decoder.push(&emoji[..3]), "");
        assert_eq!(decoder.push(&emoji[3..]), "😀");
        assert_eq!(decoder.push(&[0xE4]), "");
        assert_eq!(decoder.finish(), "\u{FFFD}");
    }

    #[cfg(unix)]
    #[test]
    fn terminate_session_returns_shell_exit_code() {
        let pty_system = native_pty_system();
        let pair = pty_system
            .openpty(PtySize {
                rows: 24,
                cols: 80,
                pixel_width: 0,
                pixel_height: 0,
            })
            .expect("打开测试 PTY");
        let mut command = CommandBuilder::new("/bin/sh");
        command.arg("-c");
        command.arg("exit 7");
        let child = pair.slave.spawn_command(command).expect("启动测试 Shell");
        drop(pair.slave);
        let mut reader = pair.master.try_clone_reader().expect("读取测试输出");
        let writer = pair.master.take_writer().expect("获取测试写入端");
        let mut buffer = [0_u8; 256];

        loop {
            match reader.read(&mut buffer) {
                Ok(0) | Err(_) => break,
                Ok(_) => continue,
            }
        }

        let session = TerminalSession {
            writer,
            child,
            master: pair.master,
        };

        assert_eq!(terminate_session(session), Some(7));
    }
}
