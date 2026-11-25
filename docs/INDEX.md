# INDEX — Bản đồ Tài liệu Dự án

> File này là **mục lục trung tâm**, giúp AI (và người mới) nắm nhanh toàn bộ cấu trúc tài liệu của dự án.
> ⚠️ File nằm trong danh sách ngoại lệ (G.2) — **luôn ghi đè/cập nhật trực tiếp**, không đính kèm ngày tháng.

**Cập nhật lần cuối:** 2026-11-26 02:05

---

## 1. Tài liệu Cốt lõi (luôn phải đọc khi bootstrap)
| File | Mô tả | Link |
|---|---|---|
| Bối cảnh dự án | Mục tiêu, tech stack, ràng buộc nghiệp vụ | [./PROJECT_CONTEXT.md](./PROJECT_CONTEXT.md) |
| Rule cục bộ | Rule riêng, ưu tiên cao nhất | [./LOCAL_RULE.md](./LOCAL_RULE.md) |
| Onboarding | Tài liệu cho thành viên mới | [./ONBOARDING.md](./ONBOARDING.md) |
| Quy tắc làm việc | Quy tắc làm việc với Claude (tài liệu, model, skill) | [./WORKING_RULES.md](./WORKING_RULES.md) |

## 2. Rule Con theo Module (docs/local_instructions/rules/)
| File | Phạm vi áp dụng | Link |
|---|---|---|
| _(ví dụ)_ `auth_rule.md` | Quy tắc riêng cho module xác thực | [./local_instructions/rules/auth_rule.md](./local_instructions/rules/auth_rule.md) |

## 3. Tài liệu Kiểm toán / Báo cáo (có ngày tháng, không ghi đè)
| File | Ngày tạo | Ghi chú | Link |
|---|---|---|---|
| `lifehub_spec_20261126.md` | 2026-11-26 | Kế hoạch gốc của người dùng (Claude chỉ đọc) | [./spec/lifehub_spec_20261126.md](./spec/lifehub_spec_20261126.md) |
| `lifehub_analysis_20261126.md` | 2026-11-26 | Phân tích kế hoạch: phiên A–D, phase, hợp đồng IPC | [./plan/lifehub_analysis_20261126.md](./plan/lifehub_analysis_20261126.md) |
| `lifehub_schema_20261126.md` | 2026-11-26 | Schema SQL MVP (migration 001) | [./plan/lifehub_schema_20261126.md](./plan/lifehub_schema_20261126.md) |
| `lifehub_A-khung_impl_20261126.md` | 2026-11-26 | Kế hoạch triển khai phiên A (khung + luồng mỏng) | [./plan/lifehub_A-khung_impl_20261126.md](./plan/lifehub_A-khung_impl_20261126.md) |
| `log_20261126.md` | 2026-11-26 | Nhật ký phiên làm việc (phiên A) | [./log/log_20261126.md](./log/log_20261126.md) |

## 3b. Quyết định kiến trúc (docs/adr/, tên cố định)
| File | Quyết định | Link |
|---|---|---|
| ADR-001 | Nền tảng desktop: Tauri 2 | [./adr/ADR-001-nen-tang-tauri.md](./adr/ADR-001-nen-tang-tauri.md) |
| ADR-002 | Local-first, không tài khoản | [./adr/ADR-002-local-first.md](./adr/ADR-002-local-first.md) |
| ADR-003 | Nghiệp vụ nằm ở Rust | [./adr/ADR-003-nghiep-vu-o-rust.md](./adr/ADR-003-nghiep-vu-o-rust.md) |
| ADR-004 | Tìm kiếm SQLite FTS5 | [./adr/ADR-004-tim-kiem-fts5.md](./adr/ADR-004-tim-kiem-fts5.md) |
| ADR-005 | Trạng thái Task cố định | [./adr/ADR-005-trang-thai-task-co-dinh.md](./adr/ADR-005-trang-thai-task-co-dinh.md) |
| ADR-006 | Fractional indexing | [./adr/ADR-006-fractional-indexing.md](./adr/ADR-006-fractional-indexing.md) |
| ADR-007 | Phạm vi lặp lại | [./adr/ADR-007-pham-vi-lap-lai.md](./adr/ADR-007-pham-vi-lap-lai.md) |
| ADR-008 | Phân phối, cập nhật, ký số | [./adr/ADR-008-phan-phoi.md](./adr/ADR-008-phan-phoi.md) |

## 4. Cấu trúc Thư mục Tổng quan
> 💡 **Quy hoạch tài liệu:** Hệ thống thư mục này được thiết kế tương ứng với các **AI Triggers** (như `#plan`, `#explain`, `#audit`...) để AI tự động phân loại và lưu trữ file đúng vị trí.
```
docs/
├── adr/                    # Quyết định kiến trúc ADR-001…008 (tên cố định)
├── audit/                  # Báo cáo kiểm toán (Trigger: #audit)
│   └── TEMPLATE_audit_YYYYMMDD.md
├── explain/                # Giải thích logic code (Trigger: #explain)
│   └── TEMPLATE_explain.md
├── local_instructions/
│   └── scripts/            # Script tiện ích riêng cho dự án
├── log/                    # Nhật ký hoạt động (Trigger: #log)
│   └── TEMPLATE_log_YYYYMMDD.md
├── misc/                   # Tài liệu khác
│   └── TEMPLATE_file.md
├── plan/                   # Kế hoạch, phân tích, triển khai (Trigger: #plan)
│   ├── lifehub_analysis_20261126.md
│   ├── lifehub_schema_20261126.md
│   ├── lifehub_A-khung_impl_20261126.md
│   ├── TEMPLATE_analysis.md
│   ├── TEMPLATE_impl.md
│   └── TEMPLATE_plan.md
├── review/                 # Báo cáo code review (Trigger: #review)
│   └── TEMPLATE_review.md
├── spec/                   # Đặc tả yêu cầu của người dùng (Trigger: #spec)
│   ├── lifehub_spec_20261126.md
│   └── TEMPLATE_spec.md
├── INDEX.md                # [CORE] Bản đồ tài liệu
├── LOCAL_RULE.md           # [CORE] Quy tắc tối cao của dự án
├── ONBOARDING.md           # [CORE] Cẩm nang thành viên mới
├── PROJECT_CONTEXT.md      # [CORE] Bối cảnh, tech stack, tiến độ (Trigger: #sync)
├── WORKING_RULES.md        # [CORE] Quy tắc làm việc với Claude
└── TEMPLATE_setup.md       # Mẫu hướng dẫn chạy dự án (Trigger: #readme)
```

## 5. Ghi chú
- Mỗi khi tạo file tài liệu mới có đính kèm ngày tháng (theo G.2), **bắt buộc** thêm dòng liên kết vào mục 3 ở trên.
- Nếu phát hiện mục lục này lỗi thời (thiếu module mới, sai tech stack...), hãy chạy `#sync` để cập nhật lại.

