# 🗄️ SCHEMA SQL MVP: LifeHub (migration 001)

> **Ngày:** 2026-11-26 00:55 · **Phiên chính:** Claude Opus 5.5, effort high
> Thuộc [phân tích](./lifehub_analysis_20261126.md), mục 3. Nguồn: spec mục 8 ([../spec/lifehub_spec_20261126.md](../spec/lifehub_spec_20261126.md)).
> Phiên A chép nguyên khối SQL dưới đây vào `src-tauri/migrations/001_init.sql`. Trước v0.1 sửa thẳng file này **và** `001`; sau v0.1 chỉ thêm migration mới.

## 1. Quy ước
- Pragma đặt trong code mỗi lần mở kết nối, không đặt trong migration: `foreign_keys = ON`, `journal_mode = WAL`, `busy_timeout = 5000`, `synchronous = NORMAL`.
- `*_at`: thời điểm UTC, `TEXT` dạng `YYYY-MM-DDTHH:MM:SS.sssZ`. `*_date`: ngày thuần `YYYY-MM-DD`.
- Khoá ngoại ghép `(x_id, workspace_id)` bảo đảm bản ghi con cùng workspace với cha. Khi `x_id` là NULL thì SQLite không kiểm tra khoá ngoại đó, đúng ý đồ.
- **Không dùng `ON DELETE SET NULL` cho khoá ghép** (nó sẽ đặt NULL cả `workspace_id`). Khi purge, use case tự tách hoặc xoá các bản ghi con trước.
- `version` tăng 1 ở mỗi lần cập nhật (tầng repository).
- `search_index` và `change_log` được ghi ở tầng repository, trong cùng transaction, qua helper `search::index/remove` và `changelog::record`. Không dùng trigger. `search_map` giữ rowid FTS để xoá/cập nhật không phải quét bảng.
- ID cố định khi seed: workspace mặc định `019ac000-0000-7000-8000-000000000001`, lịch mặc định `019ac000-0000-7000-8000-000000000002` (hằng số trong Rust).

## 2. SQL

```sql
-- ===== Nền tảng =====
CREATE TABLE workspaces (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);

CREATE TABLE settings (
  key         TEXT PRIMARY KEY,
  value_json  TEXT NOT NULL CHECK (json_valid(value_json)),
  updated_at  TEXT NOT NULL
);

CREATE TABLE areas (
  id            TEXT PRIMARY KEY,
  workspace_id  TEXT NOT NULL REFERENCES workspaces(id),
  name          TEXT NOT NULL CHECK (length(trim(name)) > 0),
  color         TEXT,
  sort_key      TEXT NOT NULL,
  version       INTEGER NOT NULL DEFAULT 1,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL,
  deleted_at    TEXT,
  UNIQUE (id, workspace_id)
);

-- ===== Projects =====
CREATE TABLE projects (
  id            TEXT PRIMARY KEY,
  workspace_id  TEXT NOT NULL REFERENCES workspaces(id),
  area_id       TEXT,
  name          TEXT NOT NULL CHECK (length(trim(name)) > 0),
  description   TEXT NOT NULL DEFAULT '',
  status        TEXT NOT NULL DEFAULT 'Active'
                CHECK (status IN ('Planned','Active','OnHold','Completed')),
  color         TEXT,
  icon          TEXT,
  start_date    TEXT,
  target_date   TEXT,
  sort_key      TEXT NOT NULL,
  archived_at   TEXT,
  version       INTEGER NOT NULL DEFAULT 1,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL,
  deleted_at    TEXT,
  UNIQUE (id, workspace_id),
  FOREIGN KEY (area_id, workspace_id) REFERENCES areas(id, workspace_id),
  CHECK (start_date IS NULL OR target_date IS NULL OR target_date >= start_date)
);

CREATE TABLE milestones (            -- [Nice]
  id          TEXT PRIMARY KEY,
  project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title       TEXT NOT NULL CHECK (length(trim(title)) > 0),
  due_date    TEXT,
  is_done     INTEGER NOT NULL DEFAULT 0 CHECK (is_done IN (0,1)),
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  deleted_at  TEXT
);

-- ===== Tasks =====
CREATE TABLE recurrence_series (
  id             TEXT PRIMARY KEY,
  workspace_id   TEXT NOT NULL REFERENCES workspaces(id),
  frequency      TEXT NOT NULL CHECK (frequency IN ('Daily','Weekly','Monthly')),
  interval       INTEGER NOT NULL DEFAULT 1 CHECK (interval BETWEEN 1 AND 365),
  by_weekday     TEXT,                 -- 'Mo,We,Fr' hoặc NULL
  template_json  TEXT NOT NULL CHECK (json_valid(template_json)),
  is_active      INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL,
  deleted_at     TEXT
);

CREATE TABLE tasks (
  id                    TEXT PRIMARY KEY,
  workspace_id          TEXT NOT NULL REFERENCES workspaces(id),
  project_id            TEXT,
  area_id               TEXT,
  title                 TEXT NOT NULL CHECK (length(trim(title)) > 0),
  description           TEXT NOT NULL DEFAULT '',
  status                TEXT NOT NULL DEFAULT 'Todo'
                        CHECK (status IN ('Todo','InProgress','Review','Done')),
  previous_status       TEXT CHECK (previous_status IS NULL OR previous_status IN ('Todo','InProgress','Review')),
  priority              TEXT NOT NULL DEFAULT 'Medium'
                        CHECK (priority IN ('Urgent','High','Medium','Low')),
  start_date            TEXT,
  due_date              TEXT,
  due_at                TEXT,
  estimated_minutes     INTEGER CHECK (estimated_minutes IS NULL OR estimated_minutes > 0),
  completed_at          TEXT,
  sort_key              TEXT NOT NULL,
  recurrence_series_id  TEXT REFERENCES recurrence_series(id),
  occurrence_date       TEXT,
  archived_at           TEXT,
  version               INTEGER NOT NULL DEFAULT 1,
  created_at            TEXT NOT NULL,
  updated_at            TEXT NOT NULL,
  deleted_at            TEXT,
  FOREIGN KEY (project_id, workspace_id) REFERENCES projects(id, workspace_id),
  FOREIGN KEY (area_id, workspace_id)    REFERENCES areas(id, workspace_id),
  CHECK (due_date IS NULL OR due_at IS NULL),
  CHECK (project_id IS NULL OR area_id IS NULL),
  CHECK ((status = 'Done') = (completed_at IS NOT NULL)),
  CHECK ((recurrence_series_id IS NULL) = (occurrence_date IS NULL)),
  UNIQUE (recurrence_series_id, occurrence_date)
);

CREATE TABLE checklist_items (
  id          TEXT PRIMARY KEY,
  task_id     TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  content     TEXT NOT NULL CHECK (length(trim(content)) > 0),
  is_done     INTEGER NOT NULL DEFAULT 0 CHECK (is_done IN (0,1)),
  sort_key    TEXT NOT NULL,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);

-- ===== Tags =====
CREATE TABLE tags (
  id            TEXT PRIMARY KEY,
  workspace_id  TEXT NOT NULL REFERENCES workspaces(id),
  name          TEXT NOT NULL CHECK (length(trim(name)) > 0),
  color         TEXT,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL,
  deleted_at    TEXT
);
CREATE UNIQUE INDEX ux_tags_name ON tags (workspace_id, name COLLATE NOCASE) WHERE deleted_at IS NULL;

CREATE TABLE task_tags (
  task_id  TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  tag_id   TEXT NOT NULL REFERENCES tags(id)  ON DELETE CASCADE,
  PRIMARY KEY (task_id, tag_id)
) WITHOUT ROWID;

-- ===== Notes =====
CREATE TABLE notes (
  id              TEXT PRIMARY KEY,
  workspace_id    TEXT NOT NULL REFERENCES workspaces(id),
  project_id      TEXT,
  parent_note_id  TEXT REFERENCES notes(id),
  title           TEXT NOT NULL DEFAULT '',
  content_json    TEXT NOT NULL DEFAULT '{"type":"doc","content":[]}' CHECK (json_valid(content_json)),
  search_text     TEXT NOT NULL DEFAULT '',
  version         INTEGER NOT NULL DEFAULT 1,
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL,
  deleted_at      TEXT,
  FOREIGN KEY (project_id, workspace_id) REFERENCES projects(id, workspace_id),
  CHECK (parent_note_id IS NULL OR parent_note_id <> id)
);

CREATE TABLE note_tags (
  note_id  TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  tag_id   TEXT NOT NULL REFERENCES tags(id)  ON DELETE CASCADE,
  PRIMARY KEY (note_id, tag_id)
) WITHOUT ROWID;

CREATE TABLE note_tasks (
  note_id  TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  task_id  TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  PRIMARY KEY (note_id, task_id)
) WITHOUT ROWID;

-- ===== Inbox =====
CREATE TABLE inbox_items (
  id                 TEXT PRIMARY KEY,
  workspace_id       TEXT NOT NULL REFERENCES workspaces(id),
  content            TEXT NOT NULL CHECK (length(trim(content)) > 0),
  status             TEXT NOT NULL DEFAULT 'Open' CHECK (status IN ('Open','Processed')),
  converted_task_id  TEXT REFERENCES tasks(id),
  converted_note_id  TEXT REFERENCES notes(id),
  processed_at       TEXT,
  version            INTEGER NOT NULL DEFAULT 1,
  created_at         TEXT NOT NULL,
  updated_at         TEXT NOT NULL,
  deleted_at         TEXT,
  CHECK (converted_task_id IS NULL OR converted_note_id IS NULL),
  CHECK ((status = 'Processed') = (converted_task_id IS NOT NULL OR converted_note_id IS NOT NULL)),
  CHECK ((status = 'Processed') = (processed_at IS NOT NULL))
);

-- ===== Calendar =====
CREATE TABLE calendars (
  id            TEXT PRIMARY KEY,
  workspace_id  TEXT NOT NULL REFERENCES workspaces(id),
  name          TEXT NOT NULL CHECK (length(trim(name)) > 0),
  color         TEXT,
  is_default    INTEGER NOT NULL DEFAULT 0 CHECK (is_default IN (0,1)),
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL,
  deleted_at    TEXT
);

CREATE TABLE events (
  id           TEXT PRIMARY KEY,
  calendar_id  TEXT NOT NULL REFERENCES calendars(id),
  task_id      TEXT REFERENCES tasks(id),
  title        TEXT NOT NULL CHECK (length(trim(title)) > 0),
  description  TEXT NOT NULL DEFAULT '',
  is_all_day   INTEGER NOT NULL CHECK (is_all_day IN (0,1)),
  start_at     TEXT,
  end_at       TEXT,
  start_date   TEXT,
  end_date     TEXT,                   -- tính cả ngày cuối (inclusive)
  version      INTEGER NOT NULL DEFAULT 1,
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL,
  deleted_at   TEXT,
  CHECK (
    (is_all_day = 1 AND start_date IS NOT NULL AND end_date IS NOT NULL AND end_date >= start_date
                    AND start_at IS NULL AND end_at IS NULL)
    OR
    (is_all_day = 0 AND start_at IS NOT NULL AND end_at IS NOT NULL AND end_at > start_at
                    AND start_date IS NULL AND end_date IS NULL)
  )
);

-- ===== Reminders =====
CREATE TABLE reminders (
  id              TEXT PRIMARY KEY,
  task_id         TEXT REFERENCES tasks(id)  ON DELETE CASCADE,
  event_id        TEXT REFERENCES events(id) ON DELETE CASCADE,
  trigger_at      TEXT NOT NULL,
  offset_minutes  INTEGER,             -- trước deadline/giờ bắt đầu; NULL = giờ cố định
  status          TEXT NOT NULL DEFAULT 'Pending'
                  CHECK (status IN ('Pending','Sent','Dismissed','Missed')),
  sent_at         TEXT,
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL,
  deleted_at      TEXT,
  CHECK ((task_id IS NULL) <> (event_id IS NULL)),
  CHECK (offset_minutes IS NULL OR offset_minutes >= 0)
);

-- ===== Tìm kiếm =====
CREATE VIRTUAL TABLE search_index USING fts5(
  title, body,
  tokenize = 'unicode61 remove_diacritics 2'
);
CREATE TABLE search_map (
  kind       TEXT NOT NULL CHECK (kind IN ('Task','Project','Note','Inbox')),
  entity_id  TEXT NOT NULL,
  fts_rowid  INTEGER NOT NULL UNIQUE,
  PRIMARY KEY (kind, entity_id)
) WITHOUT ROWID;

-- ===== Hệ thống =====
CREATE TABLE change_log (
  seq         INTEGER PRIMARY KEY AUTOINCREMENT,
  entity      TEXT NOT NULL,
  entity_id   TEXT NOT NULL,
  op          TEXT NOT NULL CHECK (op IN ('Insert','Update','Delete')),
  changed_at  TEXT NOT NULL,
  synced_at   TEXT
);

CREATE TABLE backups (
  id          TEXT PRIMARY KEY,
  file_name   TEXT NOT NULL UNIQUE,
  reason      TEXT NOT NULL CHECK (reason IN ('Manual','Daily','PreMigration','PreRestore')),
  size_bytes  INTEGER NOT NULL CHECK (size_bytes >= 0),
  created_at  TEXT NOT NULL
);

-- ===== Index =====
CREATE INDEX ix_tasks_ws_status      ON tasks (workspace_id, status)            WHERE deleted_at IS NULL;
CREATE INDEX ix_tasks_ws_due_date    ON tasks (workspace_id, due_date)          WHERE deleted_at IS NULL;
CREATE INDEX ix_tasks_ws_due_at      ON tasks (workspace_id, due_at)            WHERE deleted_at IS NULL;
CREATE INDEX ix_tasks_project_board  ON tasks (project_id, status, sort_key)    WHERE deleted_at IS NULL;
CREATE INDEX ix_tasks_area           ON tasks (area_id);
CREATE INDEX ix_tasks_series         ON tasks (recurrence_series_id);
CREATE INDEX ix_checklist_task       ON checklist_items (task_id, sort_key);
CREATE INDEX ix_task_tags_tag        ON task_tags (tag_id);
CREATE INDEX ix_note_tags_tag        ON note_tags (tag_id);
CREATE INDEX ix_note_tasks_task      ON note_tasks (task_id);
CREATE INDEX ix_notes_project        ON notes (project_id, updated_at)          WHERE deleted_at IS NULL;
CREATE INDEX ix_notes_parent         ON notes (parent_note_id);
CREATE INDEX ix_inbox_ws_status      ON inbox_items (workspace_id, status, created_at) WHERE deleted_at IS NULL;
CREATE INDEX ix_inbox_conv_task      ON inbox_items (converted_task_id);
CREATE INDEX ix_inbox_conv_note      ON inbox_items (converted_note_id);
CREATE INDEX ix_projects_ws          ON projects (workspace_id, archived_at)    WHERE deleted_at IS NULL;
CREATE INDEX ix_projects_area        ON projects (area_id);
CREATE INDEX ix_events_cal_start     ON events (calendar_id, start_at)          WHERE deleted_at IS NULL;
CREATE INDEX ix_events_cal_date      ON events (calendar_id, start_date)        WHERE deleted_at IS NULL;
CREATE INDEX ix_events_task          ON events (task_id);
CREATE INDEX ix_reminders_due        ON reminders (status, trigger_at)          WHERE deleted_at IS NULL;
CREATE INDEX ix_reminders_task       ON reminders (task_id);
CREATE INDEX ix_reminders_event      ON reminders (event_id);
CREATE INDEX ix_milestones_project   ON milestones (project_id);
CREATE INDEX ix_change_log_unsynced  ON change_log (synced_at) WHERE synced_at IS NULL;

-- ===== Seed =====
INSERT INTO workspaces (id, name, created_at, updated_at)
VALUES ('019ac000-0000-7000-8000-000000000001', 'Mặc định',
        strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now'));
INSERT INTO calendars (id, workspace_id, name, color, is_default, created_at, updated_at)
VALUES ('019ac000-0000-7000-8000-000000000002', '019ac000-0000-7000-8000-000000000001',
        'Cá nhân', '#A08BDF', 1,
        strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now'));
```

## 3. Quy tắc mà schema không tự bảo đảm (use case phải làm)
- Task `Done`: đặt `completed_at`, lưu `previous_status` (nếu khác `Done`). Mở lại: trả về `previous_status` (mặc định `Todo`), xoá `completed_at`.
- Task lặp: khi chuyển sang `Done` thì sinh lần tiếp theo trong cùng transaction. Nếu vi phạm `UNIQUE(recurrence_series_id, occurrence_date)` thì coi như đã sinh rồi, không báo lỗi.
- Xoá mềm Task thì xoá mềm luôn Event có `task_id` đó và Reminder `Pending` của nó. Purge Task: xoá cứng `inbox_items` trỏ tới Task, xoá cứng Event của Task, rồi mới xoá Task.
- Archive/Delete Project với `Detach`: đặt `project_id = NULL` cho Task và Note trước. Với `WithChildren`: archive hoặc xoá mềm cả Task và Note.
- Tiến độ Project = số Task `Done` / số Task có `archived_at IS NULL AND deleted_at IS NULL`.
- Đổi `due_date`/`due_at` của Task hoặc `start_at` của Event: tính lại `trigger_at` cho Reminder `Pending` có `offset_minutes`.
- Mọi lần ghi Task, Project, Note, Inbox: gọi `search::index` (hoặc `remove` khi xoá mềm) và `changelog::record` trong cùng transaction.
- Trash purge sau 30 ngày (đổi được trong Settings), chạy khi khởi động app.
