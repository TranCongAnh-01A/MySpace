# LifeHub

Ứng dụng desktop Windows, local-first: gom Inbox/Quick Capture, Tasks, Projects, Calendar, Notes và Dashboard vào một nơi. Dữ liệu nằm trong một file SQLite trên máy, không cần tài khoản.

Stack: Tauri 2 (Rust core) + React 19 + TypeScript + Vite + Tailwind v4 + SQLite.

## Yêu cầu máy
- Windows 10/11 có WebView2
- Node 22 + npm
- Rust stable (MSVC) và Visual Studio Build Tools (C++)

## Lệnh
```powershell
npm install        # cài thư viện
npm run tauri dev  # chạy app ở chế độ dev
npm run tauri build # build bộ cài NSIS -> src-tauri/target/release/bundle/nsis/
npm run lint       # ESLint
npm test           # Vitest
cd src-tauri; cargo test; cargo clippy -- -D warnings; cargo fmt --check
```

Tài liệu dự án nằm trong [docs/](docs/INDEX.md).
