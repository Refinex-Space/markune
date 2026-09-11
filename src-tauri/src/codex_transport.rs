use serde_json::Value;
use std::io::{self, BufRead, Write};
use std::sync::{
    atomic::{AtomicBool, AtomicUsize, Ordering},
    mpsc, Arc,
};
use std::time::Duration;

pub(crate) const MAX_FRAME_BYTES: usize = 32 * 1024 * 1024;
const MAX_QUEUED_BYTES: usize = 64 * 1024 * 1024;
type WriteRequest = (Vec<u8>, mpsc::SyncSender<io::Result<()>>);

pub(crate) struct CodexWriter {
    sender: mpsc::SyncSender<WriteRequest>,
    queued: Arc<AtomicUsize>,
    pub healthy: Arc<AtomicBool>,
}
impl CodexWriter {
    pub fn new(mut input: impl Write + Send + 'static) -> Arc<Self> {
        let (sender, receiver) = mpsc::sync_channel::<WriteRequest>(32);
        let queued = Arc::new(AtomicUsize::new(0));
        let healthy = Arc::new(AtomicBool::new(true));
        let state = Arc::new(Self {
            sender,
            queued: Arc::clone(&queued),
            healthy: Arc::clone(&healthy),
        });
        std::thread::spawn(move || {
            while let Ok((bytes, ack)) = receiver.recv() {
                let result = input.write_all(&bytes).and_then(|_| input.flush());
                queued.fetch_sub(bytes.len(), Ordering::Relaxed);
                let failed = result.is_err();
                let _ = ack.send(result);
                if failed {
                    healthy.store(false, Ordering::Release);
                    break;
                }
            }
        });
        state
    }
    pub fn write(&self, value: &Value) -> Result<(), String> {
        if !self.healthy.load(Ordering::Acquire) {
            return Err("CODEX_TRANSPORT_FAILED: 运行时连接已不可用".into());
        }
        let mut bytes = serde_json::to_vec(value).map_err(|_| "Codex 消息编码失败")?;
        bytes.push(b'\n');
        let length = bytes.len();
        if length > MAX_QUEUED_BYTES
            || self
                .queued
                .fetch_update(Ordering::Relaxed, Ordering::Relaxed, |current| {
                    (current + length <= MAX_QUEUED_BYTES).then_some(current + length)
                })
                .is_err()
        {
            return Err("CODEX_TRANSPORT_OVERLOADED: 待发送内容超过预算".into());
        }
        let (ack, done) = mpsc::sync_channel(1);
        if self.sender.try_send((bytes, ack)).is_err() {
            self.queued.fetch_sub(length, Ordering::Relaxed);
            return Err("CODEX_TRANSPORT_OVERLOADED: 待发送请求过多".into());
        }
        match done.recv_timeout(Duration::from_secs(10)) {
            Ok(Ok(())) => Ok(()),
            _ => {
                self.healthy.store(false, Ordering::Release);
                Err("CODEX_TRANSPORT_FAILED: 写入失败或超时，请核对任务状态后重连".into())
            }
        }
    }
}

pub(crate) fn read_frame(reader: &mut impl BufRead, limit: usize) -> io::Result<Option<String>> {
    let mut bytes = Vec::new();
    loop {
        let available = reader.fill_buf()?;
        if available.is_empty() {
            if bytes.is_empty() {
                return Ok(None);
            }
            return Err(io::Error::new(
                io::ErrorKind::UnexpectedEof,
                "incomplete protocol frame",
            ));
        }
        let count = available
            .iter()
            .position(|byte| *byte == b'\n')
            .map(|index| index + 1)
            .unwrap_or(available.len());
        if bytes.len() + count > limit {
            return Err(io::Error::new(
                io::ErrorKind::InvalidData,
                "protocol frame exceeds limit",
            ));
        }
        let complete = available[count - 1] == b'\n';
        bytes.extend_from_slice(&available[..count]);
        reader.consume(count);
        if complete {
            break;
        }
    }
    String::from_utf8(bytes)
        .map(Some)
        .map_err(|_| io::Error::new(io::ErrorKind::InvalidData, "protocol frame is not UTF-8"))
}

pub(crate) fn initial_frame<T: BufRead + Send + 'static>(
    mut reader: T,
    timeout: Duration,
) -> Result<(T, String), String> {
    let (send, receive) = mpsc::sync_channel(1);
    std::thread::spawn(move || {
        let result = read_frame(&mut reader, MAX_FRAME_BYTES);
        let _ = send.send((reader, result));
    });
    let (reader, result) = receive
        .recv_timeout(timeout)
        .map_err(|_| "Codex 初始化超时，请重试")?;
    let line = result
        .map_err(|_| "Codex 初始化返回无效数据")?
        .ok_or("Codex 初始化前已退出")?;
    Ok((reader, line))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn frames_are_bounded_and_truncated_lines_are_not_accepted() {
        assert_eq!(
            read_frame(&mut io::Cursor::new(b"{}\n"), 3).unwrap(),
            Some("{}\n".into())
        );
        assert!(read_frame(&mut io::Cursor::new(b"1234\n"), 3).is_err());
        assert!(read_frame(&mut io::Cursor::new(b"{}"), 100).is_err());
        assert!(read_frame(&mut io::Cursor::new([255, 10]), 100).is_err());
        assert!(read_frame(&mut io::Cursor::new(b""), 100)
            .unwrap()
            .is_none());
    }
    #[test]
    fn initial_response_has_a_deadline() {
        #[derive(Debug)]
        struct Delayed;
        impl io::Read for Delayed {
            fn read(&mut self, _: &mut [u8]) -> io::Result<usize> {
                Ok(0)
            }
        }
        impl BufRead for Delayed {
            fn fill_buf(&mut self) -> io::Result<&[u8]> {
                std::thread::sleep(Duration::from_millis(50));
                Ok(&[])
            }
            fn consume(&mut self, _: usize) {}
        }
        assert!(initial_frame(Delayed, Duration::from_millis(5))
            .unwrap_err()
            .contains("超时"));
    }
}
