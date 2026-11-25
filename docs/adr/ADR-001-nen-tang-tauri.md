# ADR-001 — Nền tảng desktop: Tauri 2
- **Trạng thái:** Đã chấp nhận · **Ngày:** 2026-11-26

## Bối cảnh
LifeHub là ứng dụng desktop Windows (`.exe`), cần editor rich text, lịch biểu và kéo thả. Ứng dụng phải nhẹ, khởi động nhanh và chạy nền ở khay hệ thống (spec mục 1.3, 4.4).

## Các phương án đã cân nhắc
- **WPF hoặc Avalonia:** tận dụng C#.
- **Electron:** dựng bằng web, nhưng bộ cài lớn hơn và tốn RAM hơn Tauri.
- **Tauri 2:** dựng giao diện bằng web trên WebView2, lõi bằng Rust.

## Quyết định
Chọn **Tauri 2** (WebView2 trên Windows), với giao diện React + TypeScript và lõi Rust (spec mục 6, 7.1).

Lý do: hệ sinh thái web có sẵn editor (Tiptap), lịch (FullCalendar) và kéo thả (dnd-kit) mạnh hơn nhiều so với WPF/Avalonia.

## Hệ quả
**Tích cực**
- Bộ cài nhỏ (vài MB đến vài chục MB) và tốn ít RAM hơn Electron (spec mục 6).
- Dùng được các thư viện web đã nêu ở trên cho editor, lịch và kéo thả.
- Tauri có sẵn plugin cho các nhu cầu nền: single-instance, global-shortcut, notification, autostart, updater (spec mục 6).

**Đánh đổi**
- Phải học Rust. Analysis ghi đây là rủi ro: Rust là ngôn ngữ mới với người phát triển (analysis mục 2).
- Giao diện phụ thuộc WebView2. Trình cài NSIS có thể tự tải WebView2 nếu máy thiếu (spec mục 6).

## Liên quan
- [Spec mục 6 và 7](../spec/lifehub_spec_20261126.md)
- [Phân tích: mục 2 và 3](../plan/lifehub_analysis_20261126.md)
- [ADR-003: nghiệp vụ nằm ở Rust](./ADR-003-nghiep-vu-o-rust.md)
