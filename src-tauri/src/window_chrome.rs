use serde::Serialize;
use tauri::WebviewWindow;

#[derive(Clone, Copy, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MacosTitlebarMetrics {
    traffic_light_center_y: f64,
}

#[tauri::command]
pub async fn get_macos_titlebar_metrics(
    window: WebviewWindow,
) -> Result<Option<MacosTitlebarMetrics>, String> {
    #[cfg(target_os = "macos")]
    {
        read_macos_titlebar_metrics(&window).await
    }

    #[cfg(not(target_os = "macos"))]
    {
        let _ = window;
        Ok(None)
    }
}

#[cfg(target_os = "macos")]
async fn read_macos_titlebar_metrics(
    window: &WebviewWindow,
) -> Result<Option<MacosTitlebarMetrics>, String> {
    use std::{sync::mpsc, time::Duration};

    use objc2::{msg_send, runtime::AnyObject};
    use objc2_foundation::NSRect;

    const METRICS_TIMEOUT: Duration = Duration::from_secs(2);
    const NS_WINDOW_CLOSE_BUTTON: usize = 0;

    let (tx, rx) = mpsc::sync_channel::<Result<Option<MacosTitlebarMetrics>, String>>(1);
    window
        .with_webview(move |webview| {
            let result = (|| -> Result<Option<MacosTitlebarMetrics>, String> {
                // SAFETY: `with_webview` runs on the AppKit main thread, and every
                // borrowed native object remains owned by the window for this callback.
                unsafe {
                    let view: &objc2_web_kit::WKWebView = &*webview.inner().cast();
                    let ns_window = view
                        .window()
                        .ok_or_else(|| "macOS 标题栏窗口不可用。".to_string())?;
                    let close_button: *mut AnyObject = msg_send![
                        &*ns_window,
                        standardWindowButton: NS_WINDOW_CLOSE_BUTTON
                    ];

                    if close_button.is_null() {
                        return Ok(None);
                    }

                    let button_superview: *mut AnyObject = msg_send![close_button, superview];
                    if button_superview.is_null() {
                        return Ok(None);
                    }

                    let button_frame: NSRect = msg_send![close_button, frame];
                    let frame_in_webview: NSRect = msg_send![
                        button_superview,
                        convertRect: button_frame,
                        toView: view
                    ];
                    let webview_bounds: NSRect = msg_send![view, bounds];
                    let is_flipped: bool = msg_send![view, isFlipped];
                    let traffic_light_center_y = traffic_light_center_y(
                        frame_in_webview,
                        webview_bounds.size.height,
                        is_flipped,
                    )
                    .ok_or_else(|| "macOS 标题栏返回了无效的红绿灯坐标。".to_string())?;

                    Ok(Some(MacosTitlebarMetrics {
                        traffic_light_center_y,
                    }))
                }
            })();
            let _ = tx.send(result);
        })
        .map_err(|error| format!("无法访问 macOS 标题栏：{error}"))?;

    tauri::async_runtime::spawn_blocking(move || rx.recv_timeout(METRICS_TIMEOUT))
        .await
        .map_err(|error| format!("等待 macOS 标题栏坐标时任务异常：{error}"))?
        .map_err(|_| "读取 macOS 标题栏坐标超时。".to_string())?
}

#[cfg(target_os = "macos")]
fn traffic_light_center_y(
    frame_in_webview: objc2_foundation::NSRect,
    webview_height: f64,
    is_flipped: bool,
) -> Option<f64> {
    let button_top = if is_flipped {
        frame_in_webview.origin.y
    } else {
        webview_height - frame_in_webview.origin.y - frame_in_webview.size.height
    };
    let center_y = button_top + frame_in_webview.size.height / 2.0;

    (center_y.is_finite() && (0.0..=128.0).contains(&center_y)).then_some(center_y)
}

#[cfg(all(test, target_os = "macos"))]
mod tests {
    use objc2_foundation::{NSPoint, NSRect, NSSize};

    use super::traffic_light_center_y;

    #[test]
    fn reads_a_flipped_webview_coordinate_from_the_top() {
        let frame = NSRect::new(NSPoint::new(15.0, 32.0), NSSize::new(14.0, 14.0));

        assert_eq!(traffic_light_center_y(frame, 860.0, true), Some(39.0));
    }

    #[test]
    fn converts_a_non_flipped_webview_coordinate_from_the_bottom() {
        let frame = NSRect::new(NSPoint::new(15.0, 814.0), NSSize::new(14.0, 14.0));

        assert_eq!(traffic_light_center_y(frame, 860.0, false), Some(39.0));
    }

    #[test]
    fn rejects_coordinates_outside_the_titlebar_safety_band() {
        let frame = NSRect::new(NSPoint::new(15.0, 180.0), NSSize::new(14.0, 14.0));

        assert_eq!(traffic_light_center_y(frame, 860.0, true), None);
    }
}
