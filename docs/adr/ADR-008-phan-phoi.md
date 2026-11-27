# ADR-008 — Phân phối: NSIS per-user, Auto Update qua GitHub Releases
- **Trạng thái:** Đã chấp nhận · **Ngày:** 2026-11-26

## Bối cảnh
LifeHub là ứng dụng Windows cài bằng file `.exe` và cần tự cập nhật (spec mục 1.1, 9.1). Phải quyết định bộ cài, cách cập nhật và có ký số hay không. Ký số ảnh hưởng đến cảnh báo của Windows SmartScreen (spec mục 12.3).

## Các phương án đã cân nhắc
- **Bộ cài MSI:** là tùy chọn, không phải phương án chính (spec mục 12.3).
- **Ký số Authenticode (chứng thư hoặc dịch vụ ký trên cloud):** cân nhắc nếu phát hành rộng (spec mục 12.3).
- **Không ký số, chấp nhận cảnh báo SmartScreen và ghi trong README:** được chọn cho Portfolio (analysis mục 2).

## Quyết định
- **Bộ cài:** NSIS (`LifeHub_x.y.z_x64-setup.exe`), cài theo người dùng hiện tại, không cần quyền admin (spec mục 12.3).
- **Auto Update:** plugin updater của Tauri đọc manifest từ GitHub Releases. Gói cập nhật được ký bằng khóa riêng của updater, khác với chứng thư Authenticode. Khóa bí mật lưu trong GitHub Secrets, không commit (spec mục 12.3).
- **Ký số:** chưa ký Authenticode. Chấp nhận cảnh báo SmartScreen và ghi rõ trong README (analysis mục 2, spec mục 12.3). Nếu phát hành rộng thì cân nhắc chứng thư ký mã.
- **CI/CD:** GitHub Actions trên `windows-latest`. Tag `v*` tạo bản nháp release kèm bộ cài và manifest cập nhật (spec mục 12.3).

## Hệ quả
**Tích cực**
- Cài và gỡ cài đặt không cần quyền admin.
- Gói cập nhật phải có chữ ký của updater. Không chạy file không được xác minh (spec mục 9.2).

**Đánh đổi**
- Windows SmartScreen cảnh báo khi cài. Người dùng phải được hướng dẫn trong README (spec mục 13, rủi ro 5).
- Auto Update đọc từ GitHub Releases nên repo phải để public khi cần dùng cập nhật. Analysis đề xuất để private đến khoảng v0.3 rồi chuyển public. Đây là câu hỏi người dùng cần trả lời (analysis mục 2).
  - **Cập nhật 2026-11-28:** người dùng chọn chuyển repo `MySpace` sang public trước khi phát hành bản có updater (Phase D2), sau khi quét bí mật trên toàn bộ lịch sử.

## Liên quan
- [Spec mục 9.2, 12.3, 13](../spec/lifehub_spec_20261126.md)
- [Phân tích: mục 2 và 3](../plan/lifehub_analysis_20261126.md)
- [ADR-001: nền tảng Tauri 2](./ADR-001-nen-tang-tauri.md)
- [ADR-002: local-first](./ADR-002-local-first.md)
