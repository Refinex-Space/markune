use tauri::WebviewWindow;

const MIN_WINDOW_OPACITY: u8 = 70;
const MAX_WINDOW_OPACITY: u8 = 100;

#[tauri::command]
pub async fn set_app_window_opacity(window: WebviewWindow, opacity: u8) -> Result<(), String> {
    let alpha = opacity_alpha(opacity)?;

    #[cfg(target_os = "macos")]
    {
        set_macos_window_opacity(&window, alpha).await
    }

    #[cfg(windows)]
    {
        set_windows_window_opacity(&window, alpha)
    }

    #[cfg(not(any(target_os = "macos", windows)))]
    {
        let _ = (window, alpha);
        Err("当前系统暂不支持应用透明度。".to_string())
    }
}

fn opacity_alpha(opacity: u8) -> Result<f64, String> {
    if !(MIN_WINDOW_OPACITY..=MAX_WINDOW_OPACITY).contains(&opacity) {
        return Err(format!(
            "应用透明度必须在 {MIN_WINDOW_OPACITY}% 到 {MAX_WINDOW_OPACITY}% 之间。"
        ));
    }

    Ok(f64::from(opacity) / f64::from(MAX_WINDOW_OPACITY))
}

#[cfg(target_os = "macos")]
async fn set_macos_window_opacity(window: &WebviewWindow, alpha: f64) -> Result<(), String> {
    use std::{sync::mpsc, time::Duration};

    use objc2::msg_send;

    const WINDOW_UPDATE_TIMEOUT: Duration = Duration::from_secs(2);

    let (tx, rx) = mpsc::sync_channel::<Result<(), String>>(1);
    window
        .with_webview(move |webview| {
            let result = (|| -> Result<(), String> {
                // SAFETY: `with_webview` runs on the AppKit main thread and the
                // native window remains owned by the WKWebView during this callback.
                unsafe {
                    let view: &objc2_web_kit::WKWebView = &*webview.inner().cast();
                    let ns_window = view
                        .window()
                        .ok_or_else(|| "macOS 应用窗口不可用。".to_string())?;
                    let _: () = msg_send![&*ns_window, setAlphaValue: alpha];
                }
                Ok(())
            })();
            let _ = tx.send(result);
        })
        .map_err(|error| format!("无法访问 macOS 应用窗口：{error}"))?;

    tauri::async_runtime::spawn_blocking(move || rx.recv_timeout(WINDOW_UPDATE_TIMEOUT))
        .await
        .map_err(|error| format!("等待 macOS 应用透明度更新时任务异常：{error}"))?
        .map_err(|_| "更新 macOS 应用透明度超时。".to_string())?
}

#[cfg(windows)]
fn set_windows_window_opacity(window: &WebviewWindow, alpha: f64) -> Result<(), String> {
    use windows::Win32::{
        Foundation::COLORREF,
        UI::WindowsAndMessaging::{
            GetWindowLongPtrW, SetLayeredWindowAttributes, SetWindowLongPtrW, GWL_EXSTYLE,
            LWA_ALPHA, WS_EX_LAYERED,
        },
    };

    let hwnd = window
        .hwnd()
        .map_err(|error| format!("Windows 应用窗口不可用：{error}"))?;
    let alpha_byte = (alpha * 255.0).round() as u8;

    // SAFETY: `hwnd` belongs to the current Tauri window. Style updates preserve
    // every unrelated extended-window bit and are verified before changing alpha.
    unsafe {
        let current_style = GetWindowLongPtrW(hwnd, GWL_EXSTYLE);
        let layered_bit = WS_EX_LAYERED.0 as isize;

        if alpha_byte == u8::MAX {
            if current_style & layered_bit != 0 {
                SetLayeredWindowAttributes(hwnd, COLORREF(0), u8::MAX, LWA_ALPHA)
                    .map_err(|error| format!("无法恢复 Windows 应用窗口透明度：{error}"))?;
                SetWindowLongPtrW(hwnd, GWL_EXSTYLE, current_style & !layered_bit);
                if GetWindowLongPtrW(hwnd, GWL_EXSTYLE) & layered_bit != 0 {
                    return Err("无法恢复 Windows 应用窗口样式。".to_string());
                }
            }
            return Ok(());
        }

        if current_style & layered_bit == 0 {
            SetWindowLongPtrW(hwnd, GWL_EXSTYLE, current_style | layered_bit);
            let updated_style = GetWindowLongPtrW(hwnd, GWL_EXSTYLE);
            if updated_style & layered_bit == 0 {
                return Err("无法启用 Windows 分层窗口透明度。".to_string());
            }
        }

        SetLayeredWindowAttributes(hwnd, COLORREF(0), alpha_byte, LWA_ALPHA)
            .map_err(|error| format!("无法更新 Windows 应用窗口透明度：{error}"))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn converts_safe_opacity_boundaries_to_alpha() {
        assert_eq!(opacity_alpha(70), Ok(0.7));
        assert_eq!(opacity_alpha(100), Ok(1.0));
    }

    #[test]
    fn rejects_opacity_outside_safe_range() {
        assert_eq!(
            opacity_alpha(69).unwrap_err(),
            "应用透明度必须在 70% 到 100% 之间。"
        );
    }
}
