# Số đo hiệu năng v1 (spec 9.3)

> Đo ngày 2026-11-28 trong phase D3a, trên mã nguồn v0.9.1. Chỉ công bố số đã đo; mục chưa đo ghi rõ.

## Cấu hình máy
| Mục | Giá trị |
|---|---|
| CPU | Intel Core i7-11800H @ 2,30 GHz (8 nhân / 16 luồng) |
| RAM | 15,8 GB |
| Ổ đĩa | SSD NVMe (WDC SN530 512 GB, KIOXIA Exceria Plus G3) |
| Hệ điều hành | Windows 11 Home Single Language 10.0.26300 |
| Công cụ | Rust 1.99.1, build `--release` |

## Kết quả
| Mục tiêu (spec 9.3) | Số đo | Đạt? | Dữ liệu | Cách đo lại |
|---|---|---|---|---|
| `task_list` không lọc: tham khảo | median 23,3 ms | tham khảo | 5.000 Task / 20 Project | lệnh A |
| `task_list` lọc theo Project: dưới 100 ms | median 1,3 ms (250 kết quả) | ✅ | như trên | lệnh A |
| `task_list` lọc theo trạng thái: dưới 100 ms | median 5,4 ms (1.250 kết quả) | ✅ | như trên | lệnh A |
| `task_list` quá hạn: dưới 100 ms | median 7,3 ms (1.667 kết quả) | ✅ | như trên | lệnh A |
| Tìm kiếm không dấu trên 10.000 bản ghi: dưới 100 ms | "nhac nho" 5,3 ms · "ghi chu" 12,8 ms · "dong tien so 4" 3,9 ms | ✅ | 5.000 Task + 4.980 Note + 20 Project = 10.000 | lệnh A |
| Dashboard / Today (chỉ tham khảo) | median 31,1 ms | tham khảo | như trên | lệnh A |
| Danh sách 5.000 Task: ảo hoá | DOM chỉ mount 20–28 dòng, `scrollHeight` 242.544 px (5.053 × 48) | ✅ (số node) | mock 5.053 Task | mục "Frontend" |
| Danh sách 5.000 Task: lọc ở frontend | **chưa đo được** (xem ghi chú) | ⚠️ | — | mục "Frontend" |
| File cài đặt: dưới 15 MB | `LifeHub_0.9.0_x64-setup.exe` 3,68 MiB (số đo ở D2) | ✅ | — | `npm run tauri build -- --bundles nsis` |
| Khởi động nguội đến Today: dưới 2 giây | **chưa đo** — log `startup_ms` đã thêm, chờ đo trên bản cài | ☐ | — | mục "Đo trên bản cài" |
| Mở Quick Capture: dưới 200 ms | **chưa đo** — log `quick_capture_show_ms` đã thêm | ☐ | — | mục "Đo trên bản cài" |

Median của 20 lần chạy, DB tạm có WAL, chạy qua `db::open` và đúng các use case của app. Tiếng Việt có dấu trong cả Task, Note, Project.
Chưa có mục nào vượt mục tiêu ở phần core, nên không đề xuất tối ưu.

## Lệnh đo lại
Lệnh A (phần core; DB tạm trong thư mục temp, tự xoá, không chạm dữ liệu thật):
```powershell
cd src-tauri
cargo test --release -- --ignored perf_ --nocapture
```
Test nằm ở `src-tauri/src/system/perf_tests.rs`, không assert thời gian (tránh flaky), chỉ assert kết quả đúng.

## Frontend (5.000 Task)
Chạy mock: `$env:VITE_IPC_MOCK=1; npx vite`, mở `/tasks`, rồi trong console:
```js
window.__lifehubMock.seedLarge()   // thêm 5.000 Task vào bộ nhớ mock
```
Chuyển sang trang khác rồi quay lại Tasks để nạp lại. Đếm `document.querySelector('[role=listbox]').querySelectorAll('[id^=task-row-]').length`.
Kết quả: 20 dòng khi ở đầu danh sách, 28 dòng sau khi cuộn tới cuối; tổng chiều cao 5.053 × 48 px.

**Ghi chú về thời gian lọc ở frontend:** pane trình duyệt trong phiên đo bị ẩn nên `requestAnimationFrame` bị chậm, và mock cố ý có độ trễ giả (`setTimeout`) cùng bước nạp lại truy vấn; các số đo thô (khoảng 0,5–2 s) chủ yếu phản ánh hai điều đó, không phản ánh ứng dụng thật. Vì vậy không công bố. Lọc thật chạy ở core (dòng `task_list` ở trên, dưới 25 ms). Cảm giác cuộn mượt cần người dùng kiểm tra trên bản cài.

## Đo trên bản cài (người dùng làm)
Bản release ghi hai dòng log mức `info`, chỉ chứa con số (không có nội dung người dùng):
- `startup_ms`: từ đầu `run()` tới khi Today có dữ liệu và vẽ xong lần đầu (sau 2 khung hình). Chưa tính thời gian hệ điều hành nạp process và WebView2 trước `run()`, nên cộng thêm cảm nhận khoảng 0,1–0,3 s khi so với mục tiêu 2 giây.
- `quick_capture_show_ms`: thời gian core xử lý từ lúc nhận phím tắt đến khi cửa sổ Quick Capture được `show` và `focus`. Chưa gồm thời gian webview vẽ nội dung.

Cách đo:
1. Cài bản mới, mở **Cài đặt → Dữ liệu → Mở thư mục log**.
2. Khởi động nguội (vừa bật máy, hoặc sau khi thoát hẳn app một lúc) 3–5 lần; khởi động ấm 3–5 lần.
3. Mở file log mới nhất, tìm `startup_ms` và `quick_capture_show_ms`; ghi giá trị lớn nhất và median vào bảng trên.
