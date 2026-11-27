# 🛠️ KẾ HOẠCH TRIỂN KHAI: Phase D2 — Auto Update + phát hành (v0.9.0 → v0.9.1)

> **Ngày:** 2026-11-28 · **Phiên chính:** Claude Opus 5.5 · **Triển khai bằng:** phiên phụ D2 (mới), Sonnet, effort medium
> **Nhánh git:** worktree mới tách từ `main` (`4025150`) · **Bật:** plugin `mattpocock-skills` (diagnosing-bugs khi gặp lỗi khó), skill (kho) `writing-guidelines` (README, release notes)
> Người triển khai làm đúng file này. Chỗ nào không làm được hoặc phải làm khác thì ghi vào báo cáo, không tự đổi hướng.
> Đọc trước: [phân tích Phase D2](./lifehub_analysis_20261126.md), [ADR-008](../adr/ADR-008-phan-phoi.md), spec mục 9.2, 12.2, 12.3 ([../spec/lifehub_spec_20261126.md](../spec/lifehub_spec_20261126.md)), [log D1](../log/log_20261127_1200.md).

## 1. Mục tiêu
- **Xong khi:**
  - Tag `v0.9.0` tạo được một **bản nháp** release trên GitHub, gồm `LifeHub_0.9.0_x64-setup.exe`, file chữ ký `.sig` và `latest.json`.
  - Bản 0.9.0 cài trên máy tự phát hiện bản `v0.9.1` và tự cập nhật lên 0.9.1, dữ liệu vẫn còn nguyên. Bước này người dùng chạy theo checklist.
  - Có README đầy đủ, release notes của 0.9.0 và 0.9.1, checklist cài thử trên máy sạch.
  - Đã quét bí mật trên toàn bộ lịch sử git và báo kết quả, để người dùng chuyển repo sang public.
- **Không làm:**
  - Ký Authenticode (ADR-008: chấp nhận cảnh báo SmartScreen).
  - MSI.
  - Sửa lỗi E2E trên CI (để D3).
  - Thêm tính năng ngoài mục 2.
  - Tag `v1.0.0` (để D3).

## 2. Quyết định đã chốt

### 2.1. Nơi phát hành
- Người dùng đã chọn **chuyển repo `TranCongAnh-01A/MySpace` sang public**. Người dùng tự bấm chuyển trong GitHub Settings; Claude không làm việc này.
- Trước khi người dùng chuyển, D2 quét bí mật trên **toàn bộ lịch sử**, xem mục 2.6.
- Endpoint updater: `https://github.com/TranCongAnh-01A/MySpace/releases/latest/download/latest.json`.
  - `releases/latest` chỉ trỏ tới release đã **publish**, không phải nháp, không phải pre-release. Vì vậy bản nháp luôn phải chờ người dùng tự xem rồi bấm Publish. Đây là bước chặn cuối cùng.

### 2.2. Khoá ký updater (bảo mật: bắt buộc làm đúng)
- **Người dùng tự tạo khoá** trên máy của mình. D2 đưa lệnh và hướng dẫn: `npm run tauri signer generate -- -w "$env:USERPROFILE\.tauri\lifehub.key"`, có đặt mật khẩu.
- Người dùng tự dán hai giá trị vào GitHub → Settings → Secrets → Actions:
  - `TAURI_SIGNING_PRIVATE_KEY`: nội dung file `.key`.
  - `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`: mật khẩu khoá.
- **D2 không bao giờ đọc, in, chép hay commit file `.key`, và không bao giờ hỏi mật khẩu.**
  - D2 chỉ nhận **khoá công khai** (nội dung file `lifehub.key.pub`). Người dùng dán vào chat, hoặc D2 đọc riêng file `.pub`.
  - Khoá công khai được phép commit, đặt vào `plugins.updater.pubkey`.
- `.gitignore` thêm `*.key` để không commit nhầm.
- Trong `README` và checklist có cảnh báo: mất khoá bí mật thì các bản đã cài **không cập nhật được nữa**. Người dùng phải tự sao lưu khoá ở chỗ an toàn.

### 2.3. Updater trong app
- **Thêm plugin:** `tauri-plugin-updater` và `tauri-plugin-process` (để relaunch), cả phía Rust lẫn npm (`@tauri-apps/plugin-updater`, `@tauri-apps/plugin-process`).
- **Capability `main.json`:** thêm `updater:default` và `process:allow-restart`. Cửa sổ `quick-capture` không có hai quyền này.
- **`tauri.conf.json`:**
  - `bundle.createUpdaterArtifacts: true`.
  - `plugins.updater`: `pubkey`, `endpoints` (mục 2.1), `windows.installMode: "passive"`.
- **Khi nào kiểm tra cập nhật:**
  - Lúc khởi động, sau khoảng 10 giây và chỉ ở bản release. Bản debug và bản chạy với `LIFEHUB_DATA_DIR`/`LIFEHUB_E2E` không tự kiểm tra, để E2E không gọi mạng.
    - Lỗi hoặc không có mạng: chỉ ghi log ở mức `info`, không hiện gì.
  - Settings → Hệ thống:
    - Hiện "Phiên bản hiện tại: x.y.z".
    - Nút "Kiểm tra cập nhật": hiện kết quả "Đang dùng bản mới nhất", "Có bản x.y.z" hoặc lỗi kèm nút thử lại.
  - Không thêm cài đặt "tự kiểm tra cập nhật". Muốn có thì ghi vào báo cáo để làm ở D3.
- **Khi có bản mới:** hiện dialog gồm số phiên bản và ghi chú phát hành (`update.body`, hiện dạng văn bản thuần, **không render HTML**). Dialog có hai nút: "Cập nhật và khởi động lại" và "Để sau".
  - "Để sau" chỉ ẩn dialog trong phiên chạy này.
- **Thứ tự khi cập nhật** (an toàn dữ liệu):
  1. Lưu ngay mọi Note đang có thay đổi chưa lưu. Dùng lại cơ chế flush của `useAppWillQuit` / `useNoteAutosave`, tách thành một hàm dùng chung nếu cần. Chờ tối đa 1,5 giây như `app_quit_ready`.
  2. Gọi lệnh sao lưu đang có (`backup_now`, hoặc lệnh tương đương) để có bản sao lưu ngay trước khi cập nhật.
     - Dùng loại backup đang có. **Không** thêm migration hay giá trị mới vào ràng buộc CHECK.
     - Sao lưu lỗi thì dừng cập nhật và hiện lỗi.
  3. `downloadAndInstall`, có thanh tiến độ phần trăm.
     - Trên Windows, bộ cài passive sẽ tự đóng app. Gọi `relaunch()` sau đó để phòng trường hợp app chưa bị đóng.
- **Hiển thị lỗi:** lỗi tải hoặc lỗi chữ ký thì hiện "Không cập nhật được: <lý do>". Không bao giờ chạy file chưa xác minh được chữ ký; plugin đã tự đảm bảo việc này, đừng tắt nó.
- **i18n:** đủ vi và en. Dialog có `aria-label` và dùng được bằng bàn phím.
- **Test:** viết test Vitest cho phần điều phối, với plugin updater được mock. Cần kiểm tra:
  - Thứ tự flush → sao lưu → cài.
  - Sao lưu lỗi thì không cài.
  - Không có bản mới thì không hiện dialog.
  - Lỗi khi tự kiểm tra lúc khởi động thì không hiện gì.

### 2.4. Phiên bản và workflow phát hành
- Đặt `package.json` và `Cargo.toml` thành `0.9.0`. `version:check` phải xanh.
- `scripts/version-check.mjs` thêm tuỳ chọn `--tag <tag>`: báo lỗi nếu tag khác `v<version>`.
- **Workflow mới `.github/workflows/release.yml`:**
  - Chạy khi `push` tag `v*`, trên `windows-latest`, với `permissions: contents: write`.
  - Các bước: checkout → Node 22 + `npm ci` → Rust (cache) → `npm run version:check -- --tag ${{ github.ref_name }}` → lint + `npm test` + `cargo test` → `tauri-apps/tauri-action` (dùng tag hoặc phiên bản ổn định mới nhất, ghi rõ phiên bản đã chọn) với:
    - `tagName: ${{ github.ref_name }}`, `releaseName: "LifeHub ${{ github.ref_name }}"`.
    - `releaseDraft: true`, `prerelease: false`, `includeUpdaterJson: true`.
    - `releaseBody`: đọc từ file `docs/release/<tag>.md`. Thiếu file này thì workflow báo lỗi.
  - `env`: `GITHUB_TOKEN`, `TAURI_SIGNING_PRIVATE_KEY`, `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` lấy từ Secrets. **Không** `echo` hay in Secrets ra log.
- Kiểm tra kích thước bộ cài (spec: dưới 15 MB), ghi con số vào log và README.
- **D2 không tự tạo hay push tag.** Người dùng đồng ý thì mới push. Thứ tự làm ở mục 4.

### 2.5. Tài liệu
- **`README.md`** (viết lại đầy đủ, dùng `writing-guidelines`, tiếng Việt, có một đoạn tóm tắt tiếng Anh ngắn ở đầu). Gồm:
  - Vấn đề và giải pháp.
  - Tính năng của 6 module.
  - Ảnh chụp màn hình: D2 tự chụp bằng mock trong built-in browser (`VITE_IPC_MOCK=1`), lưu vào `docs/media/`, dùng ảnh PNG đã nén.
  - Chỗ đặt GIF demo: `docs/media/demo.gif`. Người dùng tự quay; README để sẵn dòng đó và tạm comment lại.
  - Sơ đồ kiến trúc (Mermaid: các lớp domain/application/infrastructure/commands, IPC, event) và ERD (Mermaid, lấy từ `001_init.sql`, chỉ các bảng chính).
  - Link tới 8 ADR.
  - Tải bản cài: link `releases/latest`.
  - **Cảnh báo SmartScreen:** cách bấm "More info → Run anyway", và lý do: chưa ký Authenticode, xem ADR-008.
  - Nơi lưu dữ liệu (`%LOCALAPPDATA%\com.lifehub.app`), sao lưu và khôi phục, quyền riêng tư (dữ liệu chỉ nằm trên máy; không có telemetry; chỉ gọi mạng khi kiểm tra cập nhật).
  - Hướng dẫn build, test, E2E (`npm run e2e:setup`, `e2e:build`, `e2e`).
  - Cách phát hành: tạo khoá, Secrets, tag, Publish bản nháp.
  - Giấy phép: **không** tự thêm file LICENSE. Ghi vào báo cáo để người dùng chọn.
- **Release notes:** `docs/release/v0.9.0.md` (tóm tắt v0.1–v0.5 + D1 + updater) và `docs/release/v0.9.1.md` (bản thử cập nhật; ghi những thay đổi nhỏ có trong bản đó). Viết ngắn, theo góc nhìn người dùng.
- **Checklist cài thử:** `docs/release/install-checklist.md`, người dùng tự chạy theo.
  - Máy sạch: Windows 11 Home không có Windows Sandbox hay Hyper-V. Gợi ý dùng VirtualBox với ISO Windows 10/11 từ Microsoft, hoặc một máy khác. Ghi rõ là tuỳ chọn.
  - Các mục cần thử:
    - SmartScreen, cài không cần quyền admin, kích thước bộ cài.
    - Lần chạy đầu và dữ liệu mẫu.
    - Quick Capture bằng phím tắt toàn cục, thông báo nhắc nhở, khay hệ thống, autostart.
    - **Cập nhật 0.9.0 → 0.9.1:** dữ liệu còn nguyên, có bản sao lưu trước khi cập nhật.
    - Gỡ cài đặt: có lựa chọn giữ hoặc xoá dữ liệu. Kiểm tra bộ gỡ NSIS của Tauri; nếu không có lựa chọn này thì ghi vào báo cáo.
  - Mỗi mục là một ô ☐ để người dùng đánh dấu.

### 2.6. Chuẩn bị chuyển public: quét bí mật
- **Quét toàn bộ lịch sử**, không chỉ cây file hiện tại:
  - `git log -p --all` lọc theo các mẫu: `PRIVATE KEY`, `api[_-]?key`, `secret`, `token`, `password`, `ghp_`, `github_pat_`, `sk-`, `AKIA`, `.env`.
  - Danh sách file từng bị commit: `git log --all --name-only --format= | sort -u`, để tìm `.env`, `*.key`, `*.pem`, `*.db` lạ.
  - Không tải thêm công cụ quét bên ngoài. Nếu muốn dùng gitleaks thì hỏi người dùng trước.
- **Rà file có thông tin cá nhân:** `ke-hoach.md` ở gốc repo (bản gốc của spec), `docs/**`, fixture `src-tauri/tests/fixtures/lifehub_v0.5.0.db` (chỉ được chứa dữ liệu mẫu).
  - Email trong tác giả commit sẽ bị công khai khi chuyển public: ghi điều này vào báo cáo. Người dùng tự quyết định.
- **Kết quả:** một bảng trong log gồm mẫu, số chỗ khớp và đánh giá (khớp thật hay khớp nhầm).
  - Nếu có bí mật thật: **dừng**, không tự viết lại lịch sử. Báo lại cho phiên chính.

## 3. File được sửa
| File | Việc | Ghi chú |
|---|---|---|
| `src-tauri/{Cargo.toml,Cargo.lock,tauri.conf.json}` | sửa | plugin updater/process, cấu hình updater, 0.9.0 |
| `src-tauri/capabilities/main.json` | sửa | quyền updater, process |
| `src-tauri/src/lib.rs` | sửa | đăng ký plugin; không kiểm tra cập nhật khi chạy tách biệt |
| `package.json`, `package-lock.json` | sửa | gói plugin, 0.9.0 |
| `scripts/version-check.mjs` | sửa | `--tag` |
| `src/modules/updates/**` | tạo | hook, dialog, có test |
| `src/modules/settings/SystemTab.tsx` | sửa | phiên bản + nút kiểm tra |
| `src/app/**`, `src/modules/notes/**` | sửa | gắn kiểm tra lúc khởi động; tách hàm flush dùng chung (không đổi hành vi) |
| `src/lib/i18n/**` | sửa | |
| `.github/workflows/release.yml` | tạo | |
| `.gitignore` | sửa | `*.key` |
| `README.md`, `docs/media/**`, `docs/release/**` | tạo / sửa | |
| `docs/log/…`, `docs/plan/lifehub_analysis_20261126.md` | tạo / chỉ đánh ✅ D2 | |

> Không sửa `docs/INDEX.md`, `PROJECT_CONTEXT.md`, `docs/spec/**`, `docs/adr/**`. Không thêm migration.

## 4. Các bước
1. [ ] Tạo worktree từ `main`, chạy `npm ci`, build lần đầu ở chế độ chạy nền.
2. [ ] Quét bí mật (mục 2.6), ghi kết quả vào log. Báo kết quả cho người dùng ngay, để họ chuyển repo sang public sớm nếu sạch.
3. [ ] Hướng dẫn người dùng tạo khoá và dán vào Secrets (mục 2.2). Chờ người dùng gửi khoá công khai.
4. [ ] Làm updater: plugin, cấu hình, capability, `src/modules/updates`, Settings, gắn vào lúc khởi động, test.
5. [ ] Phiên bản 0.9.0, `version-check --tag`, `release.yml`.
6. [ ] README, ảnh chụp, release notes, checklist cài thử.
7. [ ] Kiểm tra (mục 5), ghi log, đánh ✅ D2 trong analysis. Commit `feat: D2 auto update, release workflow, README`. Hỏi người dùng trước khi push nhánh.
8. [ ] **Thử phát hành:**
   - Sau khi phiên chính đã review và người dùng đồng ý merge vào `main`, người dùng mới đồng ý push tag `v0.9.0`.
   - Workflow tạo bản nháp. Người dùng xem bản nháp và bấm Publish, rồi cài bản 0.9.0.
   - Đổi phiên bản thành 0.9.1, gồm release notes và một thay đổi nhỏ có thể thấy được (ví dụ dòng phiên bản trong Settings). Hỏi người dùng rồi mới push tag `v0.9.1`, sau đó người dùng Publish.
   - Người dùng mở bản 0.9.0 đã cài: app phải tự cập nhật lên 0.9.1.
   - Repo private nên Claude không xem được Actions; nhờ người dùng xem giúp.

## 5. Kiểm tra trước khi báo xong
- [ ] `npm run lint`, `npm test` (ghi số test), `npm run build`, `npm run version:check` xanh; `version:check -- --tag v0.9.0` xanh, `--tag v0.9.2` báo lỗi.
- [ ] `cargo fmt --check`, `cargo clippy --all-targets -- -D warnings`, `cargo test` xanh (ghi số test).
- [ ] `npm run e2e` trên máy vẫn 5/5 xanh. Bản debug không gọi kiểm tra cập nhật: xác nhận bằng log.
- [ ] `npm run tauri build` ra được bộ cài NSIS. Ghi kích thước file. Nếu máy có biến khoá thì bản build ra được `.sig`; không có khoá thì báo lỗi ký đúng như dự kiến, ghi lại.
- [ ] Xem `release.yml` bằng mắt: Secrets không bị in ra, có `permissions`, có `releaseDraft: true`.
- [ ] `git log -p` của nhánh D2 không chứa khoá bí mật nào. Chỉ có khoá công khai trong `tauri.conf.json`.
- [ ] Chụp README đã render (built-in browser hoặc preview markdown); ảnh và link đều dùng được.

## 6. Báo cáo (dòng đầu đúng mẫu)
`XONG: <việc> | File: <file đã đổi> | Kiểm tra: <đã chạy gì: kết quả> | Khác kế hoạch: <không / gì> | Còn lại: <không / gì>`
