// Wrapper chỉ dùng trên CI để chẩn đoán E2E: msedgedriver chạy file này thay cho lifehub.exe.
// Ghi giờ bắt đầu, tham số, các biến WEBVIEW2_*/LIFEHUB_* (cấu hình, không có dữ liệu người dùng),
// stdout/stderr của app và mã thoát vào thư mục E2E_LOG_DIR. Build: rustc scripts/e2e-app-wrapper.rs
use std::env;
use std::fs::{File, OpenOptions};
use std::io::Write;
use std::path::Path;
use std::process::Command;
use std::thread;
use std::time::Duration;
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
    // Giả thuyết 2 (CI): thêm cờ trình duyệt WebView2 (VD `--disable-gpu`) vào biến msedgedriver đã đặt.
    let mut cmd = Command::new(&real);
    cmd.args(&args).stdout(out).stderr(err);
    if let Ok(extra) = env::var("E2E_EXTRA_BROWSER_ARGS") {
        let base = env::var("WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS").unwrap_or_default();
        cmd.env("WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS", format!("{base} {extra}"));
        writeln!(log, "  thêm cờ trình duyệt: {extra}").ok();
    }
    // Chẩn đoán thụ động: sau 20 giây xem DevToolsActivePort có nằm trong thư mục dữ liệu WebView2 không.
    if let Ok(udf) = env::var("WEBVIEW2_USER_DATA_FOLDER") {
        let logp = format!("{dir}/app-wrapper.log");
        thread::spawn(move || {
            thread::sleep(Duration::from_secs(20));
            let mut l = OpenOptions::new().append(true).open(logp).expect("log");
            let eb = Path::new(&udf).join("EBWebView");
            let f = eb.join("DevToolsActivePort");
            writeln!(l, "[+20s] {} tồn tại: {}", f.display(), f.exists()).ok();
            if let Ok(t) = std::fs::read_to_string(&f) {
                writeln!(l, "[+20s] nội dung: {}", t.replace(char::from(10), " | ")).ok();
            }
            if let Ok(rd) = std::fs::read_dir(&eb) {
                let names: Vec<String> = rd
                    .flatten()
                    .take(30)
                    .map(|e| e.file_name().to_string_lossy().into_owned())
                    .collect();
                writeln!(l, "[+20s] thư mục EBWebView: {names:?}").ok();
            } else {
                writeln!(l, "[+20s] không đọc được {}", eb.display()).ok();
            }
        });
    }
    let status = cmd.status();
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
