# 🛠️ KẾ HOẠCH TRIỂN KHAI: Phiên A — Khung ứng dụng + luồng mỏng

> **Ngày:** 2026-11-26 00:55 · **Phiên chính:** Claude Opus 5.5 · **Triển khai bằng:** phiên phụ, Sonnet, effort medium
> **Nhánh git:** `main` · **Bật:** skill (kho) `typescript-patterns`
> Người triển khai làm đúng file này. Chỗ nào không làm được hoặc phải làm khác: ghi vào báo cáo, không tự đổi hướng.
> Đọc trước: [../WORKING_RULES.md](../WORKING_RULES.md), [../PROJECT_CONTEXT.md](../PROJECT_CONTEXT.md), [phân tích mục 3](./lifehub_analysis_20261126.md), [schema](./lifehub_schema_20261126.md).

## 1. Mục tiêu
- **Xong khi:**
  - Phase A1: `npm run tauri dev` mở được cửa sổ; `npm run tauri build` ra `LifeHub_0.1.0_x64-setup.exe`; workflow CI xanh trên GitHub (người dùng push, Claude hỏi trước).
  - Phase A2: trên bản đã cài, đóng cửa sổ thì app ẩn xuống khay; `Ctrl+Shift+Space` mở Quick Capture; gõ rồi Enter thì dòng đó hiện ngay trong Inbox ở cửa sổ chính; thoát hẳn rồi mở lại vẫn còn; mở app lần hai thì đưa cửa sổ cũ lên trước; `cargo test`, `npm test`, `npm run lint` xanh.
- **Không làm:** design system, titlebar đẹp, sidebar, Settings UI (phiên C); các module khác ngoài `inbox_create`/`inbox_list` (phiên B); updater, E2E (phiên D).

## 2. Quyết định đã chốt
- Tên sản phẩm `LifeHub`, identifier `com.lifehub.app`, version `0.1.0` (đổi nếu người dùng trả lời khác ở câu hỏi 1 của phân tích).
- npm; React 19 + TS strict + Vite; Tailwind v4 (chỉ cài và dùng vài class thô); TanStack Query; React Router (một route `/inbox` là đủ).
- Vite chạy multi-page: `index.html` (cửa sổ chính, label `main`) và `quick-capture.html` (label `quick-capture`).
- Cửa sổ chính: `decorations: false`, kích thước tối thiểu 960×600. Có một titlebar thô với `data-tauri-drag-region` và 3 nút (phiên C làm lại phần này). Cửa sổ Quick Capture: 560×72, `decorations: false`, `alwaysOnTop`, `skipTaskbar`, `visible: false`, `center`. Ẩn khi mất focus hoặc khi bấm Esc.
- Plugin Tauri dùng ở phase này: `single-instance` (đăng ký **đầu tiên**), `global-shortcut`, `window-state`, `log` không dùng (log dùng `tracing`, để phiên B làm). Tray dùng API `tray` có sẵn trong Tauri 2.
- Rust: rusqlite `bundled` (bản bundled có FTS5; kiểm tra bằng test tạo bảng `fts5`), rusqlite_migration, uuid `v7`, serde, thiserror, ts-rs, time hoặc chrono (chọn **chrono**).
- Migration `001_init.sql` = nguyên khối SQL trong [schema](./lifehub_schema_20261126.md). Nạp bằng `include_str!`.
- Trước khi migrate, nếu file DB đã có và còn migration chưa chạy thì chép file sang `backups/pre-migration-<UTC>.db` (dùng `VACUUM INTO`). Chưa cần ghi vào bảng `backups`; phiên B làm phần đó.
- Kết nối: `struct Db(Mutex<rusqlite::Connection>)` để trong state của Tauri. Pragma: `foreign_keys=ON`, `journal_mode=WAL`, `busy_timeout=5000`, `synchronous=NORMAL`. Có test khẳng định `PRAGMA foreign_keys` trả về 1.
- `AppError` có dạng `{ code, message, details? }` theo phân tích mục 3. `impl From<rusqlite::Error>` ra `DB`; `serde::Serialize` để trả qua IPC.
- ts-rs xuất ra `src/lib/ipc/bindings/` bằng `#[ts(export, export_to = "../../src/lib/ipc/bindings/")]`. Lệnh `cargo test` sẽ tự sinh lại. Commit cả các file đã sinh.
- Module inbox chia đủ 4 lớp theo spec 7.2 (`domain.rs`, `application.rs`, `infrastructure.rs`, `commands.rs`). Trait repository nằm ở `application`. Đây là **mẫu** cho phiên B làm theo, nên viết gọn và rõ.
- Sau khi tạo Inbox item, core phát `entity-changed { entity: 'inbox', ids: [id] }`. Cửa sổ chính nghe event này và invalidate query `['inbox']`.
- Capability tối thiểu: `main` và `quick-capture` có `core:default`, quyền ẩn/hiện/thu nhỏ/kéo cửa sổ, và event. Không cấp quyền `fs`.
- CI: `.github/workflows/ci.yml` chạy trên `windows-latest`, kích hoạt khi push hoặc mở PR. Các bước: `npm ci` → `npm run lint` → `npm test` → `cargo fmt --check` → `cargo clippy -- -D warnings` → `cargo test` → `tauri-apps/tauri-action` build (không release), upload bộ cài làm artifact. Cache Rust bằng `swatinem/rust-cache`.

## 3. File được sửa
| File | Việc | Ghi chú |
|---|---|---|
| `.gitignore` | tạo | `node_modules/`, `dist/`, `src-tauri/target/`, `src-tauri/gen/`, `.env*`, `*.db`, `*.db-wal`, `*.db-shm`, `.claude/settings.local.json`, `.claude/worktrees/` |
| `package.json`, `package-lock.json`, `vite.config.ts`, `tsconfig*.json`, `eslint.config.js`, `.prettierrc`, `index.html`, `quick-capture.html` | tạo | scripts: `dev`, `build`, `lint`, `format`, `test` (vitest), `tauri` |
| `src/main.tsx`, `src/app/{App.tsx,providers.tsx,router.tsx}`, `src/app/TitleBar.tsx` | tạo | vỏ tạm |
| `src/modules/inbox/InboxPage.tsx` (+ test) | tạo | danh sách + ô nhập thô |
| `src/windows/quick-capture/{main.tsx,QuickCapture.tsx}` | tạo | |
| `src/lib/ipc/{commands.ts,mock.ts,events.ts}`, `src/lib/ipc/bindings/*` | tạo | `commands.ts` bọc `invoke` có kiểu; `mock.ts` dùng khi `VITE_IPC_MOCK=1` |
| `src/styles.css` | tạo | Tailwind |
| `src-tauri/{Cargo.toml,build.rs,tauri.conf.json}` | tạo | |
| `src-tauri/capabilities/{main.json,quick-capture.json}` | tạo | |
| `src-tauri/icons/*` | tạo | `npm run tauri icon` từ một icon tạm |
| `src-tauri/migrations/001_init.sql` | tạo | chép từ schema |
| `src-tauri/src/{main.rs,lib.rs,error.rs,ids.rs,clock.rs}` | tạo | `clock.rs`: trait `Clock` để test giả lập giờ |
| `src-tauri/src/db/{mod.rs,migrations.rs}` | tạo | |
| `src-tauri/src/modules/{mod.rs,inbox/{mod,domain,application,infrastructure,commands}.rs}` | tạo | |
| `src-tauri/src/system/{mod.rs,tray.rs,shortcut.rs,windows.rs}` | tạo | |
| `.github/workflows/ci.yml` | tạo | |
| `README.md` | tạo | ngắn: mô tả, yêu cầu máy, lệnh dev/build |

> Chỉ sửa các file trong bảng. Cần sửa file khác: hỏi phiên chính trước. Không sửa `docs/plan/**` ngoài việc đánh ✅ vào phase A1, A2 trong file phân tích.

## 4. Các bước
**Phase A1**
1. [ ] Tạo project bằng `npm create tauri-app@latest` (React + TS, npm), hoặc dựng tay cho đúng cấu trúc ở mục 3. Đặt tên, identifier, version.
2. [ ] Bật TS strict; cấu hình ESLint (typescript-eslint, react-hooks), Prettier; Vitest + Testing Library + jsdom; Tailwind v4.
3. [ ] Cấu hình cửa sổ `main` theo mục 2; titlebar thô dùng được (kéo cửa sổ, 3 nút).
4. [ ] Viết `ci.yml`. Chạy thử toàn bộ các bước ở máy (`npm run lint`, `npm test`, `cargo fmt --check`, `cargo clippy -- -D warnings`, `cargo test`, `npm run tauri build`).
5. [ ] Commit `chore: khung Tauri 2 + React + CI`. Hỏi người dùng trước khi push. Sau khi push, xem CI có xanh không.

**Phase A2**
6. [ ] `db/`: lấy đường dẫn bằng `app.path().app_local_data_dir()`, tạo thư mục, mở kết nối, đặt pragma, backup trước khi migrate, chạy migration. Test: DB in-memory chạy migration xong có đủ bảng; `foreign_keys = 1`; FTS5 tạo được.
7. [ ] `error.rs`, `ids.rs` (UUID v7), `clock.rs` (giờ UTC theo đúng định dạng đã chốt).
8. [ ] Module `inbox`: `InboxItem` (domain, validate nội dung không rỗng và tối đa 10.000 ký tự), use case `create`/`list` (lọc theo status, mới nhất trước), repository rusqlite, 2 command. Test: tạo item → có trong list; nội dung rỗng → `VALIDATION`.
9. [ ] `lib.rs`: đăng ký `single-instance` trước tiên (mở lần hai thì show + focus cửa sổ `main`), sau đó `window-state`, `global-shortcut`; tray; xử lý `CloseRequested` của `main` (ẩn thay vì thoát); `Ctrl+Q` và menu khay "Thoát" gọi `app.exit(0)`.
10. [ ] Phím tắt `Ctrl+Shift+Space` (đặt cứng ở phase này; phiên B chuyển sang đọc từ Settings): show + center + focus cửa sổ `quick-capture`. Đăng ký lỗi (bị trùng phím) thì ghi log và không làm sập app.
11. [ ] Frontend: `commands.ts` (`inboxList`, `inboxCreate`), `events.ts` (nghe `entity-changed`), trang Inbox, cửa sổ Quick Capture (focus sẵn ô nhập; Enter → gọi `inboxCreate` → ẩn cửa sổ; Esc → ẩn cửa sổ; lỗi thì hiện ngay trong ô).
12. [ ] Build `.exe`, cài thử, đi đúng kịch bản "Xong khi" của A2.
13. [ ] Cập nhật docs theo "Khi xong phase", commit `feat: luồng Quick Capture → Inbox`. Hỏi trước khi push.

## 5. Kiểm tra trước khi báo xong
- [ ] `npm run lint`, `npm test`, `cargo fmt --check`, `cargo clippy -- -D warnings`, `cargo test` đều xanh.
- [ ] `npm run tauri build` tạo được bộ cài; cài lên máy và chạy kịch bản A2 (ghi lại kết quả từng bước).
- [ ] CI trên GitHub xanh (sau khi người dùng đồng ý push).
- [ ] Không có file `.db`, `node_modules`, `target` trong git (`git status`, `git ls-files`).

## 6. Báo cáo (dòng đầu đúng mẫu)
`XONG: <việc> | File: <file đã đổi> | Kiểm tra: <đã chạy gì: kết quả> | Khác kế hoạch: <không / gì> | Còn lại: <không / gì>`
