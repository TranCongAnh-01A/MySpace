# 🛠️ KẾ HOẠCH TRIỂN KHAI: Phase D3a — Đo hiệu năng, đối chiếu nghiệm thu, E2E trên CI

> **Ngày:** 2026-11-28 · **Phiên chính:** Claude Opus 5.5 · **Triển khai bằng:** phiên phụ D3a (mới), Sonnet, effort medium
> **Nhánh git:** worktree mới tách từ `main` (`5ef6a8f`, v0.9.1) · **Bật:** plugin `mattpocock-skills` (dùng diagnosing-bugs cho E2E trên CI)
> Người triển khai làm đúng file này. Chỗ nào không làm được hoặc phải làm khác: ghi vào báo cáo, không tự đổi hướng.
> Đọc trước: spec mục 9.3, 12.2 ([../spec/lifehub_spec_20261126.md](../spec/lifehub_spec_20261126.md)); mục "Việc còn mở: E2E trên CI" trong [log D1](../log/log_20261127_1200.md); [kế hoạch D2](./lifehub_D2_impl_20261128.md).

## 0. Vì sao tách D3 thành D3a và D3b
- **D3a (file này):** gồm các việc làm được ngay, không cần đợi 2 tuần dùng thật.
- **D3b:** sau khoảng 2 tuần người dùng dùng LifeHub hằng ngày. Phiên chính gom các điểm khó chịu người dùng đã ghi trong Inbox, sửa theo lô, rồi tag `v1.0.0`. D3b có kế hoạch riêng.

## 1. Mục tiêu
- **Xong khi:**
  - Có số đo cho các mục tiêu ở spec 9.3, ghi rõ cấu hình máy và kích thước dữ liệu. Mục nào không đạt thì ghi nguyên nhân và hướng sửa; **không tự tối ưu lớn** trong D3a.
  - Có bảng đối chiếu tiêu chí nghiệm thu ở spec 12.2. Mỗi tiêu chí ghi bằng chứng (test, E2E, người dùng đã thử ở phiên bản nào) hoặc chỗ còn thiếu.
  - Job `e2e` trên CI: hoặc xanh và bỏ được `continue-on-error`, hoặc đã thử tối đa **2 giả thuyết** rồi ghi kết luận. Trường hợp sau thì chấp nhận đây là giới hạn đã biết, và E2E chạy trên máy trước mỗi lần phát hành.
  - Mọi kiểm tra cũ vẫn xanh.
- **Không làm:**
  - Sửa lỗi theo trải nghiệm dùng thật (để D3b).
  - Thêm tính năng.
  - Tag hay phát hành bản mới.
  - Thêm `LICENSE` (người dùng tự quyết).

## 2. Quyết định đã chốt

### 2.1. Đo hiệu năng
- **Phần core (Rust):** viết test đo, gắn `#[ignore]`, chạy bằng `cargo test --release -- --ignored perf_`. Đặt trong `src-tauri/src/system/perf_tests.rs` hoặc file test tương đương.
  - Dữ liệu: tạo DB tạm (`tempfile`) qua đúng `db::open` và các use case/repository đang có. **Không** chạm vào thư mục dữ liệu thật.
  - Gồm 5.000 Task (chia đều nhiều Project, trạng thái, deadline) và tổng cộng 10.000 bản ghi tìm kiếm được (Task + Note + Project), có chữ tiếng Việt có dấu.
  - Đo bằng median của 20 lần chạy, in ra stdout:
    - `task_list` với vài bộ lọc thường dùng (theo Project, theo trạng thái, quá hạn): mục tiêu dưới 100 ms.
    - `search` không dấu (ví dụ "nhac nho", "ghi chu"): mục tiêu dưới 100 ms.
    - `dashboard`/`today`: chỉ ghi số đo để tham khảo.
  - Test không assert theo thời gian, để không flaky trên CI. Chỉ in số đo và assert kết quả đúng.
- **Khởi động và Quick Capture (đo trong app):**
  - Thêm log `info` ở mức có cấu trúc, **không ghi nội dung người dùng**:
    - `startup_ms`: từ lúc process bắt đầu tới khi frontend báo đã vẽ xong Today lần đầu. Thêm một command nhẹ `app_ready`, hoặc dùng lại command có sẵn nếu hợp; gọi một lần sau lần render đầu có dữ liệu.
    - `quick_capture_show_ms`: từ lúc nhận phím tắt toàn cục tới khi cửa sổ Quick Capture được show và focus.
  - Bản release cũng ghi các log này, vì người dùng sẽ đo trên bản cài thật. Trong log D3a, viết hướng dẫn: mở thư mục log từ Settings, tìm `startup_ms`, đo vài lần cả khởi động nguội lẫn ấm.
- **Cuộn 5.000 Task:** list đã có virtualization (`@tanstack/react-virtual`).
  - Kiểm tra ở chế độ mock với 5.000 Task: thêm tuỳ chọn seed lớn vào mock, chỉ bật khi có cờ, ví dụ `window.__lifehubMock.seedLarge()`.
  - Đếm số node trong DOM của list (phải cỡ vài chục, không phải 5.000). Ghi lại thời gian lọc ở frontend nếu lọc tại chỗ.
- **Bộ cài:** đã có số đo ở D2 (3,68 MB). Chỉ cần chép vào bảng.
- **Kết quả:** ghi trong `docs/release/perf-v1.md`. Bảng gồm: mục tiêu, số đo, đạt hay không, cấu hình máy (CPU, RAM, ổ đĩa, phiên bản Windows), kích thước dữ liệu, lệnh đo lại.

### 2.2. Bảng đối chiếu nghiệm thu
- Viết `docs/release/acceptance-v1.md`. Mỗi dòng ứng với một tiêu chí ở spec 12.2, gồm các cột:
  - Tiêu chí.
  - Bằng chứng tự động: tên test hoặc spec E2E cụ thể.
  - Bằng chứng thủ công: người dùng đã thử ở bản nào. Lấy từ `docs/PROJECT_CONTEXT.md` và các log; ví dụ thông báo Windows đã thử ở v0.4, Notes thử ở v0.5, tự cập nhật thử ở v0.9.1.
  - Trạng thái: ✅, ⚠️ (thiếu bằng chứng) hoặc ☐ (chưa làm).
  - Việc cần làm cho D3b.
- **Không tự đánh ✅** khi không tìm được bằng chứng cụ thể.
- Riêng tiêu chí "gỡ cài đặt có hỏi giữ hay xoá dữ liệu": đọc cấu hình NSIS của Tauri 2 đang dùng, xem bộ gỡ có tuỳ chọn xoá dữ liệu app không. Ghi kết quả. Nếu cần sửa cấu hình thì chỉ đề xuất, không sửa.
- Thiếu test tự động **nhỏ** cho một tiêu chí thì được thêm. Ví dụ: chuyển Inbox hai lần không tạo bản ghi trùng, nếu chưa có test.

### 2.3. E2E trên CI (tối đa 2 giả thuyết, mỗi lần chỉ thay đổi một thứ)
- Mỗi giả thuyết cần một lần push. **Hỏi người dùng trước mỗi lần push.** Repo đã public, nên D3a tự đọc kết quả CI qua API công khai, không cần token:
  - `https://api.github.com/repos/TranCongAnh-01A/MySpace/actions/runs?branch=<nhánh>`
  - `.../runs/<id>/jobs`
- Artifact `e2e-logs` có thể tải qua API (cần token), nên **hỏi người dùng tải về** nếu cần.
- **Giả thuyết 1 (làm trước):** chưa biết app có thật sự khởi động khi msedgedriver chạy nó hay không.
  - Bọc `lifehub.exe` bằng một wrapper (`.cmd` hoặc `.ps1`), ghi thời điểm bắt đầu, toàn bộ biến môi trường liên quan (`WEBVIEW2_*`, `LIFEHUB_*`), stdout/stderr của app và mã thoát vào `e2e-logs`.
  - Trỏ `ms:edgeOptions.binary` (qua `tauri:options.application`) tới wrapper này. Chỉ làm trên CI, có điều kiện `CI`.
  - Kết quả cho biết bước kế tiếp.
- **Giả thuyết 2:** chọn theo kết quả giả thuyết 1, trong số các hướng đã ghi ở log D1:
  - Dùng `--remote-debugging-pipe`.
  - Thêm `--disable-gpu` qua `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS`.
  - So với cấu hình trong ví dụ chính thức của tauri-driver cho WebdriverIO (Tauri v2), dùng `tauri:options`.
  - Cài WebView2 Runtime mới nhất trên runner, cùng msedgedriver khớp phiên bản.
- **Thử 2 lần vẫn đỏ:** dừng. Ghi kết luận vào log, giữ `continue-on-error`, đơn giản hoá job: bỏ bước smoke chẩn đoán nếu không còn cần, nhưng **giữ** upload artifact. Báo phiên chính một dòng.
- **Nếu xanh:** bỏ `continue-on-error`, bỏ các bước chẩn đoán thừa, cập nhật comment trong `ci.yml` và mục "Việc còn mở" trong log.

## 3. File được sửa
| File | Việc | Ghi chú |
|---|---|---|
| `src-tauri/src/system/**`, `src-tauri/src/lib.rs` | sửa / tạo | perf tests, log `startup_ms` và `quick_capture_show_ms`, command `app_ready` nếu cần |
| `src-tauri/src/modules/**` | chỉ đọc | trừ khi cần thêm test nhỏ cho mục 2.2 |
| `src/app/**`, `src/lib/ipc/{commands.ts,mock.ts}` | sửa | gọi `app_ready`; seed lớn cho mock |
| `src/lib/ipc/bindings/**` | sinh lại | nếu thêm kiểu mới |
| `tests/e2e/**`, `.github/workflows/ci.yml`, `scripts/**` | sửa | E2E trên CI |
| `docs/release/{perf-v1.md,acceptance-v1.md}` | tạo | |
| `docs/log/…`, `docs/plan/lifehub_analysis_20261126.md` | tạo / chỉ ghi tiến độ D3a | |

> Không sửa `docs/INDEX.md`, `PROJECT_CONTEXT.md`, `docs/spec/**`, `docs/adr/**`. Không thêm migration. Không đổi số phiên bản.

## 4. Các bước
1. [ ] Worktree tách từ `main`, chạy `npm ci`, build lần đầu ở chế độ chạy nền.
2. [ ] Perf test Rust; đo bằng `--release`, ghi lại số đo.
3. [ ] Log `startup_ms` / `quick_capture_show_ms`; seed lớn trong mock và đo DOM của list.
4. [ ] `perf-v1.md`, `acceptance-v1.md`; thêm test nhỏ nếu thiếu.
5. [ ] Chạy kiểm tra (mục 5), commit `test: D3a perf, acceptance matrix`. Hỏi người dùng rồi mới push.
6. [ ] E2E trên CI, giả thuyết 1: commit, hỏi rồi mới push, đọc kết quả qua API.
7. [ ] Giả thuyết 2, hoặc chốt kết luận (mục 2.3).
8. [ ] Ghi log, báo cáo.

## 5. Kiểm tra trước khi báo xong
- [ ] `npm run lint`, `npm test` (ghi số test), `npm run build`, `npm run version:check` xanh.
- [ ] `cargo fmt --check`, `cargo clippy --all-targets -- -D warnings`, `cargo test` xanh (ghi số test). `cargo test --release -- --ignored perf_` chạy được.
- [ ] `npm run e2e` trên máy 5/5 xanh.
- [ ] Log mới không chứa nội dung người dùng (tiêu đề Task, nội dung Note, Inbox).
- [ ] `git diff main --stat` chỉ gồm các file ở mục 3.

## 6. Báo cáo (dòng đầu đúng mẫu)
`XONG: <việc> | File: <file đã đổi> | Kiểm tra: <đã chạy gì: kết quả> | Khác kế hoạch: <không / gì> | Còn lại: <không / gì>`
