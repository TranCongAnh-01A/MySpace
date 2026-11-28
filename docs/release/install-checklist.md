# Checklist cài thử LifeHub trên máy sạch

> Người dùng tự chạy và đánh dấu ☐ → ☑. Ghi lại điều gì lạ vào mục "Ghi chú" cuối file.
> **Cảnh báo khoá ký:** mất khoá bí mật của updater (`lifehub.key`) thì mọi bản đã cài sẽ không cập nhật được nữa. Sao lưu file `.key` và mật khẩu ở chỗ an toàn (ví dụ trình quản lý mật khẩu), tách khỏi repo.

## 0. Chuẩn bị
- ☐ **Máy sạch (tuỳ chọn, nhưng nên có):** Windows 11 Home không có Windows Sandbox hay Hyper-V. Dùng VirtualBox với ISO Windows 10/11 tải từ Microsoft, hoặc một máy khác chưa từng cài LifeHub. Nếu thử trên máy đang dùng, **xuất JSON và sao lưu** dữ liệu LifeHub trước.
- ☐ Khoá ký đã tạo, hai Secrets đã dán vào GitHub (`TAURI_SIGNING_PRIVATE_KEY`, `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`), file `.key` đã sao lưu.
- ☐ Repo đã chuyển public (Settings → General → Danger Zone → Change visibility).
- ☐ Tag `v0.9.0` đã push, workflow Release xanh, bản nháp có đủ 3 file: `LifeHub_0.9.0_x64-setup.exe`, file `.sig`, `latest.json`.
- ☐ Bấm **Publish release** cho bản nháp `v0.9.0`.

## 1. Cài đặt bản 0.9.0
- ☐ Tải bộ cài từ trang Releases. Kích thước: ______ MB (spec: dưới 15 MB).
- ☐ Chạy bộ cài: SmartScreen hiện cảnh báo → bấm **More info → Run anyway**.
- ☐ Cài xong **không bị hỏi quyền quản trị** (UAC).
- ☐ LifeHub có trong Start menu và mở được.

## 2. Lần chạy đầu
- ☐ Mở lần đầu ra màn hình Hôm nay, không lỗi.
- ☐ Dữ liệu mẫu hiện đúng (nếu có), hoặc app trống và dùng được.
- ☐ Đổi giao diện sáng/tối, đổi ngôn ngữ vi/en: có hiệu lực ngay.

## 3. Hệ thống
- ☐ **Quick Capture:** bấm `Ctrl+Shift+Space` khi LifeHub đang ẩn, gõ một dòng, Enter → mục xuất hiện trong Inbox.
- ☐ **Nhắc nhở:** tạo việc có nhắc nhở sau 2 phút → Windows hiện thông báo.
- ☐ **Khay hệ thống:** biểu tượng LifeHub ở khay; bấm đúp mở cửa sổ; menu chuột phải có "Thoát".
- ☐ Đóng cửa sổ thì thu vào khay (khi bật tuỳ chọn).
- ☐ **Autostart:** bật "Khởi động cùng Windows", đăng xuất/đăng nhập lại hoặc khởi động lại máy → LifeHub chạy (ẩn nếu bật "Khởi động ẩn").
- ☐ Thoát bằng khay rồi mở lại: dữ liệu và ghi chú đang soạn còn nguyên.

## 4. Tạo dữ liệu để thử cập nhật
- ☐ Tạo vài việc, một dự án, một ghi chú có nội dung nhận ra được (ví dụ "TEST-UPDATE-0.9.0").
- ☐ Ghi lại: số lượng việc ______ · tên ghi chú ______.

## 5. Cập nhật 0.9.0 → 0.9.1
- ☐ Đổi phiên bản thành 0.9.1 trên `main`, thêm `docs/release/v0.9.1.md`, push tag `v0.9.1`, workflow xanh.
- ☐ Bấm **Publish release** cho `v0.9.1`.
- ☐ Mở LifeHub 0.9.0 đã cài. **Cài đặt → Phím tắt & hệ thống → Kiểm tra cập nhật** (hoặc chờ khoảng 10 giây sau khi mở app): hiện hộp thoại "Có bản mới: LifeHub 0.9.1" cùng ghi chú.
- ☐ Bấm **Để sau**: hộp thoại đóng; mở lại bằng nút "Xem và cập nhật".
- ☐ Soạn dở một ghi chú (đừng bấm lưu), rồi bấm **Cập nhật và khởi động lại**.
- ☐ Thanh tiến độ chạy, app tự đóng và mở lại.
- ☐ Phiên bản hiện tại là **0.9.1** (Cài đặt → Phím tắt & hệ thống).
- ☐ Dữ liệu còn nguyên: số việc, dự án, ghi chú TEST-UPDATE đúng như mục 4; ghi chú soạn dở đã được lưu.
- ☐ **Có bản sao lưu ngay trước khi cập nhật:** Cài đặt → Dữ liệu → danh sách sao lưu có một bản mới, thời điểm trùng lúc bấm cập nhật.
- ☐ Kiểm tra lại cập nhật: hiện "Đang dùng bản mới nhất".
- ☐ (Tuỳ chọn) Thử ngắt mạng rồi bấm "Kiểm tra cập nhật": hiện lỗi kèm nút "Thử lại", app vẫn dùng bình thường.

## 6. Gỡ cài đặt
- ☐ Cài đặt Windows → Ứng dụng → LifeHub → Gỡ cài đặt.
- ☐ Bộ gỡ có **lựa chọn giữ hoặc xoá dữ liệu** không? ☐ Có ☐ Không. Nếu không, ghi vào mục "Ghi chú" (dữ liệu nằm ở `%LOCALAPPDATA%\com.lifehub.app` và có thể còn lại sau khi gỡ).
- ☐ Cài lại: dữ liệu còn (nếu chọn giữ) hoặc app trống (nếu chọn xoá).

## Ghi chú
(ghi lỗi, điều bất ngờ, kích thước bộ cài, thời gian cập nhật…)
