# PROJECT CONTEXT — Bối cảnh Dự án

> ⚠️ File nằm trong danh sách ngoại lệ (G.2) — **luôn ghi đè/cập nhật trực tiếp**, không đính kèm ngày tháng.

**Cập nhật lần cuối:** 2026-11-26 18:10

---

## 1. Tổng quan Dự án
- **Tên dự án:** LifeHub (repo/thư mục: MySpace) — chờ người dùng chốt tên và identifier `com.lifehub.app`
- **Thư mục:** `D:\04.Project_me\MySpace`
- **Mục tiêu chính:** ứng dụng desktop Windows (`.exe`) local-first gom Inbox/Quick Capture, Tasks, Projects, Calendar, Notes, Dashboard; dự án chủ lực cho CV. Spec: [./spec/lifehub_spec_20261126.md](./spec/lifehub_spec_20261126.md)
- **Đối tượng người dùng:** một người dùng trên Windows 10/11, không tài khoản
- **Trạng thái hiện tại:** **v0.2 đã merge vào `main`** (tag `v0.2.0`, chưa push). v0.1: khung, Quick Capture → Inbox, khay, CI, Settings, Areas, Backup/Restore, design system. v0.2: Inbox đủ CRUD + chuyển thành Task, Tasks (List ảo hoá, Board kéo thả, panel chi tiết, checklist, tag, task lặp, lọc theo hạn/múi giờ), Thùng rác, tìm kiếm không dấu, Command Palette. Trên bản gộp: lint, tsc, Vitest 47/47, build, fmt, clippy, cargo test 160/160 xanh; release: lọc 5.000 Task 21 ms, search 3–4 ms. `contract.ts` re-export toàn bộ từ bindings. Chưa kiểm bằng tay toàn luồng UI với core thật. Bước tiếp: B3 + C3 (v0.3: Projects, Kanban theo dự án, Dashboard). ADR ở [./adr/](./adr/).

## 2. Tech Stack
| Tầng | Công nghệ | Phiên bản | Ghi chú |
|---|---|---|---|
| Frontend | React + TypeScript + Vite, Tailwind v4, shadcn/ui, TanStack Query, Zustand, React Router, Tiptap, FullCalendar (MIT), dnd-kit | React 19 | WebView2 |
| Backend | Rust core trong Tauri 2 (rusqlite, rusqlite_migration, ts-rs, tokio, tracing) | Rust 1.99 | nghiệp vụ chỉ ở Rust (ADR-003) |
| Database | SQLite (WAL, FTS5 `unicode61 remove_diacritics 2`) | bundled | [schema](./plan/lifehub_schema_20261126.md) |
| DevOps/Hạ tầng | GitHub Actions `windows-latest`, tauri-action, NSIS, updater qua GitHub Releases | — | máy có Node 22, npm 11, MSVC Build Tools 2019 |

## 3. Kiến trúc Tổng quan
- **Mô hình kiến trúc:** Tauri 2; Rust core là modular monolith theo chiều dọc (domain / application / infrastructure / commands mỗi module); frontend chỉ gọi command qua IPC có kiểu.
- **Sơ đồ luồng chính** *(khuyến khích dùng Mermaid)*:
```mermaid
flowchart LR
    UI[React UI / Quick Capture] -->|invoke| CMD[Tauri commands]
    CMD --> MOD[Rust modules]
    MOD --> DB[(SQLite + FTS5)]
    SCH[Reminder scheduler] --> DB
    SCH --> WN[Windows notifications]
    CMD -. entity-changed .-> UI
```

## 4. Ràng buộc Kỹ thuật & Nghiệp vụ
- Ràng buộc kỹ thuật: offline hoàn toàn; không tải script/font từ mạng; capability Tauri tối thiểu; một kết nối ghi SQLite.
- **Git/GitHub:** có git, remote `origin` = https://github.com/TranCongAnh-01A/MySpace.git, nhánh mặc định `main` (kiểm tra 2026-11-26). Máy chưa cài `gh`. `.gitignore` đã tạo (A1).
- Ràng buộc nghiệp vụ: xem quy tắc đã chốt ở [analysis mục 3](./plan/lifehub_analysis_20261126.md) và [schema mục 3](./plan/lifehub_schema_20261126.md).
- Các quy định đặc thù (pháp lý, bảo mật ngành, v.v.): ...

## 5. Quy ước Đặt tên & Cấu trúc Thư mục
```
MySpace/
├── src/          # React (phiên C)
├── src-tauri/    # Rust core (phiên B)
├── tests/e2e/    # phiên D
├── .github/      # CI
└── docs/
```

## 6. Danh sách Module/Tính năng Chính
| Module | Mô tả | Trạng thái |
|---|---|---|
| Khung + Quick Capture → Inbox | Phiên A | Xong (A1 ✅, A2 ✅) |
| Nền tảng v0.1: Settings, Areas, Backup, design system | B1 + C1 | Xong, đã merge (v0.1.0) |
| Inbox, Tasks, Search | v0.2 (B2 + C2) | Xong, đã merge (v0.2.0) |
| Projects, Kanban, Dashboard | v0.3 (B3 + C3) | Chưa bắt đầu |
| Calendar, Reminders | v0.4 (B4 + C4) | Chưa bắt đầu |
| Notes | v0.5 (B5 + C5) | Chưa bắt đầu |
| E2E, Auto Update, v1.0 | Phiên D | Chưa bắt đầu |

## 7. Liên kết Liên quan
- Xem thêm tại [Bản đồ tài liệu](./INDEX.md)
- Rule cục bộ: [./LOCAL_RULE.md](./LOCAL_RULE.md)
