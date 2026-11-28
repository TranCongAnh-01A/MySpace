// Wrapper chỉ dùng trên CI để chẩn đoán E2E: msedgedriver chạy file này thay cho lifehub.exe.
// Ghi giờ bắt đầu, tham số, các biến WEBVIEW2_*/LIFEHUB_* (cấu hình, không có dữ liệu người dùng),
// stdout/stderr của app và mã thoát vào thư mục E2E_LOG_DIR. Build: rustc scripts/e2e-app-wrapper.rs
use std::env;
use std::fs::{File, OpenOptions};
use std::io::Write;
use std::process::Command;
use std::time::{SystemTime, UNIX_EPOCH};

fn main() {
    let dir = env::var("E2E_LOG_DIR").expect("E2E_LOG_DIR");
    let real = env::var("LIFEHUB_REAL_BINARY").expect("LIFEHUB_REAL_BINARY");
    let args: Vec<String> = env::args().skip(1).collect();
    let mut log = OpenOptions::new()
        .create(true)
        .append(true)
        .open(format!("{dir}/app-wrapper.log"))
        .expect("mở log");
    let now = || SystemTime::now().duration_since(UNIX_EPOCH).map_or(0, |d| d.as_millis());
    writeln!(log, "[{}] wrapper bắt đầu; tham số: {args:?}", now()).ok();
    for (k, v) in env::vars() {
        if k.starts_with("WEBVIEW2_") || k.starts_with("LIFEHUB_") {
            writeln!(log, "  env {k}={v}").ok();
        }
    }
    let out = File::create(format!("{dir}/app-stdout.log")).expect("stdout");
    let err = File::create(format!("{dir}/app-stderr.log")).expect("stderr");
    let status = Command::new(&real).args(&args).stdout(out).stderr(err).status();
    match status {
        Ok(s) => {
            writeln!(log, "[{}] app thoát: {s}", now()).ok();
            std::process::exit(s.code().unwrap_or(1));
        }
        Err(e) => {
            writeln!(log, "[{}] không chạy được app: {e}", now()).ok();
            std::process::exit(1);
        }
    }
}
