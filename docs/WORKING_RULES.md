# QUY TẮC LÀM VIỆC — Người dùng & Claude

> File cố định, không gắn ngày. Mọi phiên (session) Claude làm việc trên dự án này **phải đọc file này trước**, cùng với [PROJECT_CONTEXT.md](./PROJECT_CONTEXT.md) và [INDEX.md](./INDEX.md).
> Các template trong `docs/` có nhắc tới trigger kiểu `#plan`, `#sync`, `#spec`... (từ MCP server cũ). Ở đây không cần trigger: cứ nói bằng lời ("lập plan", "đồng bộ docs"...), Claude làm theo đúng quy tắc bên dưới.

**Tạo lúc:** 2026-11-26 00:32

---

## 1. Quy tắc quản lý tài liệu `docs/`

### 1.1. Chỗ để file
- Mọi file **không phải code** (ghi chú, hướng dẫn, báo cáo, phân tích) đặt trong `docs/`, không để ở thư mục gốc. Chỉ `README.md` được ở gốc.
- Đúng loại thì vào đúng thư mục:

| Loại | Thư mục | Tên file |
|---|---|---|
| Yêu cầu do người dùng viết | `docs/spec/` | `[ten]_spec_YYYYMMDD.md` |
| Kế hoạch, phân tích kế hoạch | `docs/plan/` | `[ten]_plan_YYYYMMDD.md`, `[ten]_analysis_YYYYMMDD.md` |
| Nhật ký mỗi phiên | `docs/log/` | `log_YYYYMMDD.md` |
| Review code | `docs/review/` | `[ten]_review_YYYYMMDD.md` |
| Audit bảo mật/hiệu năng | `docs/audit/` | `[ten]_audit_YYYYMMDD.md` |
| Giải thích code | `docs/explain/` | `[ten]_explain_YYYYMMDD.md` |
| Hướng dẫn cài/chạy | `docs/` | `[ten]_setup.md` |
| Script Claude viết cho dự án | `docs/local_instructions/scripts/` | tên cố định |
| Không thuộc loại nào | `docs/misc/` | tự đặt |

- Loại file nháp lặp lại nhiều (scratch, kết quả test tạm) thì được tạo thư mục riêng như `docs/scratch/`, và phải nói lý do.

### 1.2. Đường dẫn
- Link giữa các file `.md` **chỉ dùng đường dẫn tương đối** (`./`, `../`). Cấm `C:\...`, `D:\...`, `file:///...` hoặc đường dẫn bắt đầu bằng `/`.

### 1.3. Đặt tên và phiên bản
- File báo cáo/ghi chép (plan, analysis, log, review, audit, explain, spec) **gắn ngày `_YYYYMMDD`**, không ghi đè bản cũ. Trùng trong ngày thì thêm `_HHMM` hoặc `_v2`, `_v3`.
- File **tên cố định, sửa trực tiếp**: `INDEX.md`, `PROJECT_CONTEXT.md`, `ONBOARDING.md`, `LOCAL_RULE.md`, `WORKING_RULES.md`, `README.md`, các file `*_setup.md`, và file trong `local_instructions/`.

### 1.4. Template
- Tạo tài liệu loại nào thì **dùng đúng template** của loại đó (file `TEMPLATE_*` trong thư mục tương ứng), giữ nguyên tiêu đề, bảng, cấu trúc; chỉ điền nội dung. Không tự bịa cấu trúc.
- Khi dùng template, xoá khối chú thích `TEMPLATE INSTRUCTION` và các chỗ giữ chỗ `[...]`.
- **File spec do người dùng tự điền. Claude chỉ đọc, tuyệt đối không sửa.**

### 1.5. Đồng bộ (bắt buộc, cùng lượt)
Mỗi khi tạo hoặc sửa bất kỳ file nào trong `docs/`, trong **cùng lượt trả lời** phải cập nhật **cả hai**:
- `docs/INDEX.md`: thêm/sửa link tới file đó.
- `docs/PROJECT_CONTEXT.md`: cập nhật tiến độ/trạng thái liên quan (chỉ phần bị ảnh hưởng).
Nếu thay đổi quá lớn, báo người dùng và đề xuất "đồng bộ lại toàn bộ docs" thay vì cập nhật nửa vời.

### 1.6. Ngôn ngữ
- Tài liệu trong `docs/` viết **tiếng Việt** (cho người đọc). Code và comment theo quy ước sẵn có của dự án.

---

## 2. Quy trình làm việc theo phiên

### 2.1. Nguyên tắc
- **Mỗi khối việc lớn một phiên riêng** (giao diện, backend, ghép nối...). Không ôm nhiều khối việc trong một phiên.
- Mỗi phiên **mở đầu** bằng việc đọc: `WORKING_RULES.md` → `PROJECT_CONTEXT.md` → file analysis mới nhất trong `docs/plan/` → spec liên quan.
- Mỗi phiên **kết thúc** bằng: ghi `docs/log/log_YYYYMMDD.md` (đã làm gì, file nào đổi, việc còn dở), cập nhật `PROJECT_CONTEXT.md` và `INDEX.md`.
- Thoả thuận chung giữa các phiên (đường dẫn API, tên trường dữ liệu, cấu trúc database) phải được **chốt trong spec/analysis trước** khi các phiên làm song song.
- Hai phiên **không sửa cùng một file cùng lúc**.

### 2.1b. Git và GitHub
- **Chưa có git/GitHub:** Claude nhắc người dùng đưa dự án lên GitHub và đề nghị làm giúp (`git init`, `.gitignore`, commit đầu, tạo repo, mặc định private). Tạo repo và push phải được người dùng đồng ý. Khi chưa có, các phiên **chạy lần lượt**, không song song.
- **Đã có GitHub:** dùng nhánh khi cần:
  - Phiên chạy song song với phiên khác, hoặc phiên lớn/rủi ro → nhánh riêng `feat/<mảng>` (VD: `feat/ui`, `feat/backend`), ghi trong file analysis.
  - Phiên ngắn chạy một mình → làm trên nhánh chính.
- Đầu phiên: chuyển sang đúng nhánh ghi trong analysis trước khi sửa code.
- Cuối mỗi phase: commit (push thì hỏi trước).
- Gộp nhánh về nhánh chính khi phase cuối của phiên đã kiểm tra xong và người dùng đồng ý.
- Không bao giờ commit `.env`, khoá bí mật, `vendor/`, `node_modules/`.

### 2.2. Quy trình mẫu

| Phiên | Làm gì | Model | Skill/plugin |
|---|---|---|---|
| 1. Lên kế hoạch | Chốt tính năng, API, database → spec + analysis | Opus, effort high | `grilling`, `to-spec`, `to-tickets` |
| 2. Giao diện | Làm theo spec | Sonnet, medium (Opus cho trang mới khi hạn mức tuần < 50%) | `hallmark` (trang mới) hoặc `impeccable` (dự án có sẵn) |
| 3. Backend | Làm theo spec | Sonnet, medium | `tdd` |
| 4. Ghép nối & test | Nối hai phần, test toàn luồng | Sonnet, medium (lỗi khó sai 2 lần → Opus) | `diagnosing-bugs` khi có lỗi |
| 5. Review | Review trước khi gộp nhánh | Opus, high | `code-review` |

> Gói Pro: model và số phiên chạy song song còn phụ thuộc hạn mức tuần (xem skill `work-routing`, mục 1). Hạn mức tuần trên 80% thì chạy một phiên một lúc, chỉ Sonnet/Haiku.

Phiên 2 và 3 chạy song song được khi đã có spec và dùng git tách nhánh.

### 2.3. Chọn model và skill
- Mọi skill/plugin **mặc định tắt** (skill nằm trong kho `~/.claude/skills-kho/`, plugin tắt ở cấp máy). Chỉ bật cho dự án này khi một phiên cần:
  - Skill: chép từ kho vào `.claude/skills/` của dự án (nên chép sẵn trước khi mở phiên cần nó).
  - Plugin: bật riêng cho dự án (`.claude/settings.local.json`), **có hiệu lực từ phiên mới**, nên được bật sẵn trước khi mở phiên cần nó.
- Đầu mỗi phiên, Claude báo: **Model:** … (lý do) · **Bật:** … (lý do).
- Xong phiên: xoá skill đã chép, tắt plugin của phiên (trừ khi phiên khác của dự án còn cần), báo `Đã tắt: …`, rồi bật sẵn plugin cho phiên tiếp theo.
- `hallmark` và `impeccable` không dùng cùng lúc cho một việc.

### 2.4. Chia phase bên trong một phiên
- **Phiên** chia theo mảng việc (giao diện, backend...). **Không** tách một mảng ra nhiều phiên.
- Trong một phiên, nếu các việc **ngắn** thì làm liền một lượt (1 phase).
- Nếu việc **lớn**, chia thành phase (đã ghi sẵn trong file analysis). Làm **từng phase một**:
  1. Làm xong các việc của phase.
  2. Kiểm tra theo mục "Xong khi" của phase đó.
  3. Cập nhật docs: đánh dấu ✅ trong file analysis, ghi `docs/log/log_YYYYMMDD.md`, cập nhật `PROJECT_CONTEXT.md` + `INDEX.md`.
  4. Báo người dùng phase đã xong, rồi mới sang phase sau.
- Mỗi phase kết thúc bằng thứ **chạy được và kiểm tra được**, không dừng giữa chừng.
- Nhờ docs được cập nhật sau mỗi phase, nếu phiên bị dài quá hoặc phải mở phiên mới, phiên mới đọc docs là làm tiếp được phase kế.
