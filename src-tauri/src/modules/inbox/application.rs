use crate::clock::Clock;
use crate::error::AppResult;
use crate::ids;

use super::domain::{InboxItem, InboxStatus};

/// Cổng ra của module: lớp infrastructure cài trait này.
pub trait InboxRepository {
    fn insert(&self, item: &InboxItem) -> AppResult<()>;
    /// Mới nhất trước. `None` = mọi trạng thái.
    fn list(&self, status: Option<InboxStatus>) -> AppResult<Vec<InboxItem>>;
}

pub fn create(
    repo: &dyn InboxRepository,
    clock: &dyn Clock,
    content: &str,
) -> AppResult<InboxItem> {
    let item = InboxItem::new(ids::new_id(), content, clock.now_iso())?;
    repo.insert(&item)?;
    Ok(item)
}

pub fn list(repo: &dyn InboxRepository, status: Option<InboxStatus>) -> AppResult<Vec<InboxItem>> {
    repo.list(status)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::clock::FixedClock;
    use crate::db;
    use crate::error::ErrorCode;
    use crate::modules::inbox::infrastructure::SqliteInboxRepository;
    use chrono::{Duration, TimeZone, Utc};

    fn clock_at(secs: i64) -> FixedClock {
        FixedClock(Utc.with_ymd_and_hms(2026, 11, 26, 0, 0, 0).unwrap() + Duration::seconds(secs))
    }

    #[test]
    fn created_item_appears_in_list() {
        let conn = db::open_in_memory().unwrap();
        let repo = SqliteInboxRepository::new(&conn);
        let item = create(&repo, &clock_at(0), "Gọi điện cho khách").unwrap();
        let items = list(&repo, None).unwrap();
        assert_eq!(items, vec![item]);
    }

    #[test]
    fn empty_content_is_validation_error() {
        let conn = db::open_in_memory().unwrap();
        let repo = SqliteInboxRepository::new(&conn);
        let err = create(&repo, &clock_at(0), "  ").unwrap_err();
        assert_eq!(err.code, ErrorCode::Validation);
        assert!(list(&repo, None).unwrap().is_empty());
    }

    #[test]
    fn list_is_newest_first_and_filters_status() {
        let conn = db::open_in_memory().unwrap();
        let repo = SqliteInboxRepository::new(&conn);
        let a = create(&repo, &clock_at(0), "một").unwrap();
        let b = create(&repo, &clock_at(5), "hai").unwrap();
        let ids: Vec<_> = list(&repo, Some(InboxStatus::Open))
            .unwrap()
            .into_iter()
            .map(|i| i.id)
            .collect();
        assert_eq!(ids, vec![b.id, a.id]);
        assert!(list(&repo, Some(InboxStatus::Processed))
            .unwrap()
            .is_empty());
    }
}
