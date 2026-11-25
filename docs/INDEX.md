# INDEX — Bản đồ Tài liệu Dự án

> File này là **mục lục trung tâm**, giúp AI (và người mới) nắm nhanh toàn bộ cấu trúc tài liệu của dự án.
> ⚠️ File nằm trong danh sách ngoại lệ (G.2) — **luôn ghi đè/cập nhật trực tiếp**, không đính kèm ngày tháng.

**Cập nhật lần cuối:** 2026-11-26 00:32

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
| _(ví dụ)_ `[ten_du_an]_audit_20260712.md` | 2026-07-12 | Audit toàn diện lần đầu | [./ten_du_an_audit_20260712.md](./ten_du_an_audit_20260712.md) |

## 4. Cấu trúc Thư mục Tổng quan
> 💡 **Quy hoạch tài liệu:** Hệ thống thư mục này được thiết kế tương ứng với các **AI Triggers** (như `#plan`, `#explain`, `#audit`...) để AI tự động phân loại và lưu trữ file đúng vị trí.
```
docs/
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
│   ├── TEMPLATE_analysis.md
│   ├── TEMPLATE_impl.md
│   └── TEMPLATE_plan.md
├── review/                 # Báo cáo code review (Trigger: #review)
│   └── TEMPLATE_review.md
├── spec/                   # Đặc tả yêu cầu của người dùng (Trigger: #spec)
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

