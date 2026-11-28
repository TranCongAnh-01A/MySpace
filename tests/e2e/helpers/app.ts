import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import {
  cpSync,
  createWriteStream,
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';

export const ROOT = path.resolve(import.meta.dirname, '..', '..', '..');
const REAL_BINARY = path.join(ROOT, 'src-tauri', 'target', 'debug', 'lifehub.exe');
const NATIVE_DRIVER = path.join(ROOT, '.e2e', 'msedgedriver.exe');
export const DRIVER_PORT = 4444;

/** Có đặt `E2E_LOG_DIR` (CI): ghi log tauri-driver, msedgedriver (verbose) và log của app vào đó. */
const LOG_DIR = process.env.E2E_LOG_DIR ? path.resolve(process.env.E2E_LOG_DIR) : undefined;

/**
 * Trên CI (có `E2E_LOG_DIR`), msedgedriver chạy app qua một wrapper `.exe` nhỏ (biên dịch từ
 * `scripts/e2e-app-wrapper.rs`) để biết app có khởi động không và ghi stdout/stderr/mã thoát.
 * tauri-driver bắt buộc đường dẫn kết thúc bằng `.exe`. Chạy trên máy thì dùng thẳng `lifehub.exe`.
 */
const WRAPPER = LOG_DIR ? path.join(LOG_DIR, 'app-wrapper.exe') : undefined;

function buildAppWrapper(logDir: string, out: string): void {
  mkdirSync(logDir, { recursive: true });
  const r = spawnSync('rustc', [path.join(ROOT, 'scripts', 'e2e-app-wrapper.rs'), '-o', out], {
    stdio: 'inherit',
  });
  if (r.status !== 0) throw new Error('Không biên dịch được e2e-app-wrapper.rs');
}

export const APP_BINARY = WRAPPER ?? REAL_BINARY;

let driver: ChildProcess | undefined;
let driverLog: ReturnType<typeof createWriteStream> | undefined;
let sessionDir: string | undefined;

/** Thư mục gốc tạm của spec hiện tại. Dữ liệu app nằm ở `<gốc>/data`. */
export function e2eRoot(): string {
  if (!sessionDir) throw new Error('Chưa có thư mục dữ liệu E2E');
  return sessionDir;
}

/**
 * An toàn dữ liệu thật: thư mục E2E luôn nằm trong thư mục tạm của hệ điều hành,
 * không bao giờ nằm trong (hoặc trùng) `%LOCALAPPDATA%\com.lifehub.app`.
 */
function assertSafe(dir: string): void {
  const real = path
    .join(process.env.LOCALAPPDATA ?? 'C:\\__none__', 'com.lifehub.app')
    .toLowerCase();
  const d = path.resolve(dir).toLowerCase();
  const tmp = path.resolve(os.tmpdir()).toLowerCase();
  if (!d.startsWith(tmp + path.sep) || d === real || d.startsWith(real + path.sep)) {
    throw new Error(`Từ chối chạy E2E với thư mục dữ liệu không an toàn: ${dir}`);
  }
}

function waitForPort(port: number, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const attempt = () => {
      const s = net.connect(port, '127.0.0.1');
      s.once('connect', () => {
        s.destroy();
        resolve();
      });
      s.once('error', () => {
        s.destroy();
        if (Date.now() > deadline) reject(new Error(`tauri-driver không mở cổng ${port}`));
        else setTimeout(attempt, 200);
      });
    };
    attempt();
  });
}

/** Tạo thư mục dữ liệu tạm và chạy tauri-driver với biến môi trường riêng cho E2E. */
export async function startDriver(): Promise<void> {
  if (!existsSync(REAL_BINARY)) {
    throw new Error(`Chưa có ${REAL_BINARY}. Chạy: npm run e2e:build`);
  }
  if (!existsSync(NATIVE_DRIVER)) {
    throw new Error('Chưa có .e2e/msedgedriver.exe. Chạy: npm run e2e:setup');
  }
  if (WRAPPER && LOG_DIR && !existsSync(WRAPPER)) buildAppWrapper(LOG_DIR, WRAPPER);
  sessionDir = mkdtempSync(path.join(os.tmpdir(), 'lifehub-e2e-'));
  assertSafe(sessionDir);
  const webview = path.join(sessionDir, 'webview2');
  mkdirSync(webview, { recursive: true });
  let nativeDriver = NATIVE_DRIVER;
  let stdio: 'inherit' | ['ignore', 'inherit', 'inherit'] | ['ignore', number, number] = [
    'ignore',
    'inherit',
    'inherit',
  ];
  if (LOG_DIR) {
    const prefix = `spec${process.pid}-`;
    mkdirSync(LOG_DIR, { recursive: true });
    // tauri-driver không cho truyền cờ cho msedgedriver, nên bọc bằng một .cmd để bật log chi tiết.
    nativeDriver = path.join(LOG_DIR, `${prefix}msedgedriver-wrapper.cmd`);
    writeFileSync(
      nativeDriver,
      `@echo off

"${NATIVE_DRIVER}" --verbose --log-path="${path.join(LOG_DIR, `${prefix}msedgedriver.log`)}" %*

`,
    );
    driverLog = createWriteStream(path.join(LOG_DIR, `${prefix}tauri-driver.log`));
    stdio = ['ignore', 'pipe', 'pipe'] as never;
  }
  driver = spawn('tauri-driver', ['--port', String(DRIVER_PORT), '--native-driver', nativeDriver], {
    stdio: stdio as never,
    env: {
      ...process.env,
      LIFEHUB_DATA_DIR: path.join(sessionDir, 'data'),
      LIFEHUB_E2E: '1',
      LIFEHUB_REAL_BINARY: REAL_BINARY,
      // Giả thuyết 2 (chỉ CI): tắt GPU của WebView2; wrapper nối cờ này vào biến của msedgedriver.
      ...(LOG_DIR ? { E2E_EXTRA_BROWSER_ARGS: '--disable-gpu' } : {}),
      // WebView2 mặc định đặt dữ liệu trình duyệt trong thư mục dữ liệu thật của app.
      WEBVIEW2_USER_DATA_FOLDER: webview,
    },
  });
  if (driverLog) {
    driver.stdout?.pipe(driverLog, { end: false });
    driver.stderr?.pipe(driverLog, { end: false });
  }
  driver.once('error', (e) => console.error('tauri-driver lỗi:', e));
  await waitForPort(DRIVER_PORT, 15_000);
}

/** Dừng tauri-driver và dọn thư mục tạm của spec. */
export function stopDriver(): void {
  driver?.kill();
  driver = undefined;
  driverLog?.end();
  driverLog = undefined;
  if (sessionDir) {
    assertSafe(sessionDir);
    if (LOG_DIR) {
      try {
        cpSync(
          path.join(sessionDir, 'data', 'logs'),
          path.join(LOG_DIR, `spec${process.pid}-app-logs`),
          {
            recursive: true,
          },
        );
      } catch {
        /* app chưa kịp tạo thư mục log */
      }
    }
    try {
      rmSync(sessionDir, { recursive: true, force: true });
    } catch {
      /* file còn bị khoá: bỏ qua, thư mục nằm trong thư mục tạm */
    }
    sessionDir = undefined;
  }
}
