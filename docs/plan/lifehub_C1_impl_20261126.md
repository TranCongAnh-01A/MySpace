# 🛠️ KẾ HOẠCH TRIỂN KHAI: Phase C1 — Design system + vỏ ứng dụng (v0.1)

> **Ngày:** 2026-11-26 02:20 · **Phiên chính:** Claude Opus 5.5 · **Triển khai bằng:** phiên phụ C, Sonnet, effort medium
> **Nhánh git:** `feat/ui` (worktree riêng) · **Bật:** skill (kho) `vercel-react-best-practices`, `vercel-composition-patterns`, `typescript-patterns`, `web-design-guidelines`
> Người triển khai làm đúng file này. Chỗ nào không làm được hoặc phải làm khác: ghi vào báo cáo, không tự đổi hướng.
> Đọc trước: [../WORKING_RULES.md](../WORKING_RULES.md), [../PROJECT_CONTEXT.md](../PROJECT_CONTEXT.md), [phân tích mục 3 + Phiên C](./lifehub_analysis_20261126.md), spec mục 4 ([../spec/lifehub_spec_20261126.md](../spec/lifehub_spec_20261126.md)), **hợp đồng v0.1 ở mục 2.1 của [kế hoạch B1](./lifehub_B1_impl_20261126.md)**.

## 1. Mục tiêu
- **Xong khi:**
  - `VITE_IPC_MOCK=1 npm run dev` mở trong trình duyệt thấy đủ vỏ ứng dụng (titlebar, sidebar, Inbox, Settings với 5 tab), ở cả theme Dark và Light, đổi theme áp dụng ngay.
  - Mọi control đến được bằng Tab, có focus ring rõ.
  - `npm run lint`, `npm test`, `npm run build` xanh.
  - `npm run tauri dev` (core thật của nhánh `main`, chưa có command v0.1) không trắng màn hình: Inbox vẫn chạy; Settings hiện error state dễ hiểu.
- **Không làm:** Command Palette, Tasks, Projects, Dashboard (C2+); mọi file trong `src-tauri/` và `src/lib/ipc/bindings/` (phiên B).

## 2. Quyết định đã chốt
- **Kiểu dữ liệu tạm:** chép đúng các type trong hợp đồng v0.1 (B1 mục 2.1) vào `src/lib/ipc/contract.ts`. `commands.ts` và `mock.ts` import từ đây. Khi merge với B1, phase C2 bước 0 sẽ chuyển sang dùng `bindings/`. **Không tự thêm trường** ngoài hợp đồng; thiếu gì thì nhắn phiên chính.
- **Gọi command:** thêm wrapper vào `commands.ts` cho mọi command v0.1 (tên hàm camelCase: `settingsGet`, `settingsUpdate`, `shortcutRegister`, `areaList`, `areaCreate`, `areaUpdate`, `areaReorder`, `areaDelete`, `backupNow`, `backupList`, `backupRestore`, `exportJson`, `openDataFolder`, `openLogFolder`, `appInfo`). Tham số `invoke` đúng như bảng hợp đồng (ví dụ `invoke('settings_update', { patch })`).
- **Mock** (`mock.ts`): dữ liệu trong bộ nhớ, đủ mọi command v0.1, có độ trễ giả 150 ms để thấy loading state. `shortcutRegister('Alt+F4')` trả `CONFLICT`; `backupRestore` thì reload trang. Ở chế độ mock, mọi API Tauri (`getCurrentWindow`, `listen`) phải được bọc kiểm tra để không lỗi trong trình duyệt. Gom phần này vào `src/lib/tauri.ts`.
- **TanStack Query:**
  - Query key theo entity: `['settings']`, `['areas']`, `['backups']`, `['inbox', status]`.
  - Một hook `useEntityChangedInvalidation()` gắn ở gốc app: nghe `entity-changed` và invalidate theo `entity`.
  - Mutation đổi settings dùng optimistic update, lỗi thì rollback và hiện toast.
- **Thư viện npm thêm:**
  - shadcn/ui (Tailwind v4, copy component vào `src/components/ui/`) cùng các gói Radix nó cần.
  - `lucide-react`, `sonner` (toast), `react-day-picker` + `date-fns` (Date Picker; dùng locale `vi`/`enUS`).
  - `@fontsource-variable/inter`, `zustand`.
  - `@dnd-kit/core`, `@dnd-kit/sortable` (sắp xếp Areas, có `KeyboardSensor`).
  - Không dùng i18next; không tải gì từ mạng lúc chạy.
- **Design token** (`src/styles/tokens.css`, biến CSS gắn vào Tailwind v4 bằng `@theme`):

| Token | Dark (spec 4.5) | Light (chốt ở đây) |
|---|---|---|
| `--bg` | `#15161B` | `#F7F7F9` |
| `--sidebar` | `#1B1D23` | `#EEEFF3` |
| `--surface` | `#23252D` | `#FFFFFF` |
| `--primary` | `#A08BDF` | `#6A52C7` |
| `--success` | `#63BB91` | `#25855A` |
| `--danger` | `#E57373` | `#C53030` |
| `--warning` | `#EAB75C` | `#975A16` |
| `--text` | `#F1F2F5` | `#1B1D23` |
| `--muted` | `#9598A5` | `#5C5F6B` |
| `--border` | `#2E3039` | `#DCDDE3` |

  Thêm `--primary-fg` (chữ trên nền primary) và `--focus` (bằng `--primary`). Kiểm tra độ tương phản chữ thường ≥ 4.5:1 (skill `web-design-guidelines`); token nào không đạt thì chỉnh **màu Light** và ghi vào báo cáo. Không đổi màu Dark của spec, trừ khi không đạt chuẩn.
- **Theme:** gắn `data-theme="dark|light"` lên `<html>`. `System` theo `matchMedia('(prefers-color-scheme: dark)')` và nghe khi nó đổi. Để không nháy màn hình: script inline trong `index.html` đọc theme đã cache ở `localStorage` (`lifehub.theme`) trước khi React chạy; khi `settings_get` trả về thì cập nhật cache.
- **i18n:** từ điển tự viết `src/lib/i18n/{vi.ts,en.ts,index.ts}`. `en` phải có đủ khoá như `vi` (TS kiểm tra kiểu). Hook `useT()` lấy ngôn ngữ từ settings. Mọi chuỗi giao diện đi qua `t()`. Định dạng ngày theo `dateFormat` qua `src/lib/format/date.ts` (có test).
- **Vỏ ứng dụng:**
  - `TitleBar`: vùng kéo `data-tauri-drag-region`; logo "LifeHub"; ô tìm kiếm **chỉ hiển thị** gợi ý `Ctrl+K`, disabled kèm tooltip "Sắp có" (Command Palette làm ở C2); nút "+ Thêm nhanh" mở dialog tạo Inbox item; 3 nút cửa sổ theo chuẩn Windows (nút đóng hover màu đỏ).
  - `Sidebar`: thu gọn được (chỉ còn icon), trạng thái lưu bằng Zustand persist (`lifehub.ui`). Theo spec 4.2 "không tạo menu chết", **v0.1 chỉ hiện Inbox (kèm số mục Open) và Settings**. Today, Tasks, Calendar, Notes, Projects, Areas sẽ thêm ở phase tương ứng.
  - Routes: `/inbox` (mặc định), `/settings/:tab?`.
  - Phím tắt trong app (`src/app/shortcuts.ts`): `Ctrl+2` → Inbox; `Ctrl+,` → Settings; `Ctrl+Q` → `appQuit`; `Esc` đóng dialog (Radix lo sẵn). `Ctrl+1/3/4/5` chưa gán. Không bắt phím khi đang gõ trong ô nhập, trừ `Ctrl+Q`.
  - Bố cục: không có thanh cuộn của cả trang; chỉ vùng nội dung cuộn. Không dùng hiệu ứng hover kiểu web cho mọi thứ. Menu chuột phải (Context Menu) cho từng Inbox item: Xoá đang disabled, ghi "Sắp có".
- **Màn hình Settings** (5 tab, đặt dưới `src/modules/settings/`):
  1. **Chung:** theme, ngôn ngữ, múi giờ (combobox tìm kiếm từ `Intl.supportedValuesOf('timeZone')`), định dạng ngày, ngày bắt đầu tuần.
  2. **Phím tắt & hệ thống:** ô ghi phím tắt (bấm tổ hợp → hiện "Ctrl+Shift+Space"; định dạng accelerator của Tauri: `Ctrl`/`Alt`/`Shift`/`Super` + phím; Esc để huỷ). Lưu bằng `shortcutRegister`; `CONFLICT` → báo lỗi ngay dưới ô và giữ phím cũ. Ngoài ra: khởi động cùng Windows, khởi động ẩn (chỉ bật được khi đã bật khởi động cùng Windows), đóng cửa sổ thì thu vào khay.
  3. **Thông báo:** bật/tắt; thời gian nhắc mặc định (0, 5, 10, 15, 30, 60 phút, 1 ngày); số ngày giữ Thùng rác (7, 14, 30, 60, 90).
  4. **Lĩnh vực (Areas):** danh sách sắp xếp kéo thả (dnd-kit sortable + `KeyboardSensor`; kéo xong gọi `areaReorder` với `beforeId`/`afterId`), thêm, đổi tên tại chỗ, chọn màu (8 màu cố định lấy từ token), xoá (dialog xác nhận ghi rõ "Task/Project thuộc lĩnh vực này sẽ trở thành không có lĩnh vực").
  5. **Dữ liệu:** hiện `dataDir`; nút mở thư mục dữ liệu và thư mục log; "Sao lưu ngay"; bảng các bản sao lưu (ngày, loại, dung lượng) có nút "Khôi phục" (dialog xác nhận: "Dữ liệu hiện tại sẽ được sao lưu trước, sau đó ứng dụng khởi động lại"); "Xuất JSON" (thành công → toast có đường dẫn; `null` → không làm gì).
- Mỗi màn hình có đủ loading (Skeleton), empty (Empty State có lời gợi ý) và error state (thông báo + nút "Thử lại").
- **Component nền** (`src/components/ui/`): Button, Input, Textarea, Label, Switch, Select, Combobox, Dialog, AlertDialog, DropdownMenu, ContextMenu, Tabs, Card, Toast (sonner), Badge, Skeleton, EmptyState, DatePicker, Tooltip, Kbd. Chỉ thêm component có dùng ở C1, trừ DatePicker (C2 cần; làm sẵn kèm test).
- **Quick Capture** (`src/windows/quick-capture/`): đổi giao diện sang token và component mới, giữ nguyên hành vi của phase A. Hiện dòng gợi ý cú pháp `#tag @project !high` dạng mờ, chưa xử lý cú pháp ([Nice], để sau).
- **Inbox** (`src/modules/inbox/`): đổi giao diện, giữ test cũ (sửa selector nếu cần); thêm empty state ("Inbox trống. Nhấn Ctrl+Shift+Space để ghi nhanh").
- **Font:** import `@fontsource-variable/inter` (đã có bộ ký tự tiếng Việt). Kiểm tra hiển thị "Ghi nhanh vào Inbox… ằ ẵ ặ ỷ ữ" không lỗi dấu.

## 3. File được sửa
| File | Việc | Ghi chú |
|---|---|---|
| `package.json`, `package-lock.json` | sửa | thư viện ở mục 2 |
| `index.html`, `quick-capture.html` | sửa | script theme chạy sớm |
| `vite.config.ts`, `tsconfig*.json`, `eslint.config.js`, `components.json` | sửa / tạo | alias `@/` → `src/` |
| `src/styles.css`, `src/styles/tokens.css` | sửa / tạo | |
| `src/main.tsx`, `src/app/**` | sửa / tạo | App shell, TitleBar, Sidebar, router, providers, shortcuts |
| `src/components/ui/**`, `src/components/**` | tạo | |
| `src/lib/ipc/{commands.ts,mock.ts,events.ts,contract.ts}` | sửa / tạo | **không** đụng `src/lib/ipc/bindings/` |
| `src/lib/{tauri.ts,i18n/**,format/**,theme/**,utils.ts}` | tạo | |
| `src/modules/{inbox,settings}/**` | sửa / tạo | kèm test |
| `src/windows/quick-capture/**` | sửa | |
| `src/test-setup.ts` | sửa | mock `matchMedia`, Tauri |
| `docs/log/log_YYYYMMDD.md` | tạo / sửa | |
| `docs/plan/lifehub_analysis_20261126.md` | chỉ đánh ✅ Phase C1 | |

> Chỉ sửa các file trong bảng. Cần đổi gì ở `src-tauri/` (capability, cấu hình cửa sổ) hoặc thiếu command/trường: nhắn phiên chính, không tự làm. `docs/INDEX.md` và `PROJECT_CONTEXT.md` **không sửa trên nhánh này**; ghi vào báo cáo.

## 4. Các bước
1. [ ] Worktree đang ở `feat/ui`; chạy `npm ci`. Đọc kỹ hợp đồng v0.1.
2. [ ] Cài shadcn/ui cho Tailwind v4, alias `@/`, token Dark/Light, font, theme (cả script chạy sớm), `src/lib/tauri.ts`.
3. [ ] `contract.ts`, wrapper trong `commands.ts`, `mock.ts` đủ command, hook invalidation, i18n vi/en, định dạng ngày.
4. [ ] Component nền (mục 2) kèm test cho DatePicker, Switch, phần ghi phím tắt.
5. [ ] App shell: TitleBar, Sidebar thu gọn, router, phím tắt, dialog "Thêm nhanh" vào Inbox.
6. [ ] Settings: 5 tab; Areas có kéo thả bằng chuột và bàn phím; tab Dữ liệu.
7. [ ] Đổi giao diện Inbox + Quick Capture.
8. [ ] Rà a11y theo skill `web-design-guidelines` (focus ring, label, `aria-*`, tương phản, không dùng màu làm dấu hiệu duy nhất). Sửa những gì không đạt.
9. [ ] Kiểm tra (mục 5), ghi log, đánh ✅, commit `feat(ui): C1 design system + vỏ ứng dụng + Settings`. **Không push** khi chưa hỏi người dùng.

## 5. Kiểm tra trước khi báo xong
- [ ] `npm run lint`, `npm test` (ghi số test), `npm run build` xanh.
- [ ] `VITE_IPC_MOCK=1 npm run dev`: mở trong trình duyệt (dùng built-in browser), chụp màn hình Inbox và từng tab Settings ở cả Dark và Light. Không lỗi console. Tab qua hết các control.
- [ ] `npm run tauri dev`: Inbox chạy với core thật; Settings hiện error state, không trắng màn hình.
- [ ] `git diff main --stat` chỉ có file nằm trong bảng ở mục 3.

## 6. Báo cáo (dòng đầu đúng mẫu)
`XONG: <việc> | File: <file đã đổi> | Kiểm tra: <đã chạy gì: kết quả> | Khác kế hoạch: <không / gì> | Còn lại: <không / gì>`
