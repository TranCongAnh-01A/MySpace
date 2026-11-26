use rusqlite::{params, Connection};

use crate::error::AppResult;

use super::application::SettingsRepository;

pub struct SqliteSettingsRepository<'a> {
    conn: &'a Connection,
}

impl<'a> SqliteSettingsRepository<'a> {
    pub fn new(conn: &'a Connection) -> Self {
        Self { conn }
    }
}

impl SettingsRepository for SqliteSettingsRepository<'_> {
    fn load_all(&self) -> AppResult<Vec<(String, String)>> {
        let mut stmt = self.conn.prepare("SELECT key, value_json FROM settings")?;
        let rows = stmt
            .query_map([], |r| Ok((r.get(0)?, r.get(1)?)))?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(rows)
    }

    fn upsert(&self, key: &str, value_json: &str, now: &str) -> AppResult<()> {
        self.conn.execute(
            "INSERT INTO settings (key, value_json, updated_at) VALUES (?1, ?2, ?3)
             ON CONFLICT (key) DO UPDATE SET value_json = excluded.value_json,
                                             updated_at = excluded.updated_at",
            params![key, value_json, now],
        )?;
        Ok(())
    }
}
