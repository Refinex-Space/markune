// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    if std::env::args().nth(1).as_deref() == Some("--agent-mcp-stdio") {
        if markune_lib::agents::proxy_main().is_err() { std::process::exit(1); }
        return;
    }
    markune_lib::run();
}
