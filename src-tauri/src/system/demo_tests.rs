use super::*;
use crate::clock::FixedClock;
use crate::db;
use crate::modules::dashboard::application as dashboard;
use crate::modules::projects::application::get_overview;
use crate::modules::search::application as search_app;
use chrono::TimeZone;

#[test]
fn seeds_ggstudio_with_26_of_40_done_and_refuses_twice() {
    let mut conn = db::open_in_memory().unwrap();
    let c = FixedClock(Utc.with_ymd_and_hms(2026, 11, 26, 3, 0, 0).unwrap());
    let ctx = TimeCtx::new("Asia/Ho_Chi_Minh", c.0);
    {
        let tx = conn.transaction().unwrap();
        seed(&tx, &c, &ctx).unwrap();
        tx.commit().unwrap();
    }
    let repo = SqliteProjectRepository::new(&conn, &c);
    let gg = projects_app::list(&repo, false)
        .unwrap()
        .into_iter()
        .find(|p| p.name.starts_with(DEMO_MARKER))
        .unwrap();
    assert_eq!(gg.status, ProjectStatus::Active);
    assert_eq!(gg.color.as_deref(), Some("#A08BDF"));
    let o = get_overview(&repo, &gg.id).unwrap();
    assert_eq!((o.progress.done, o.progress.total), (26, 40));
    assert_eq!(o.progress.percent, Some(65));
    assert_eq!((o.counts.in_progress, o.counts.review), (2, 2));

    let view = dashboard::today(&conn, &c, &ctx).unwrap();
    assert_eq!((view.today.len(), view.overdue.len()), (3, 2));
    assert_eq!(view.active_projects.len(), 2);
    let n = |table: &str| -> i64 {
        conn.query_row(&format!("SELECT count(*) FROM {table}"), [], |r| r.get(0))
            .unwrap()
    };
    assert_eq!((n("areas"), n("projects"), n("tasks")), (2, 2, 46));
    assert_eq!((n("tags"), n("inbox_items")), (3, 3));
    assert!(!search_app::search(&conn, "ggstudio", None, None)
        .unwrap()
        .is_empty());

    let tx = conn.transaction().unwrap();
    assert_eq!(seed(&tx, &c, &ctx).unwrap_err().code, ErrorCode::Conflict);
}
