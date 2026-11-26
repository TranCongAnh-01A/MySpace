//! Khoá sắp xếp dạng chuỗi (fractional indexing, base-62).
//!
//! Bảng chữ `0-9A-Za-z` đã theo đúng thứ tự byte (số < HOA < thường), nên chuỗi
//! trả về sắp xếp đúng theo so sánh TEXT (BINARY) của SQLite. Khoá không bao giờ kết
//! thúc bằng `0`, nhờ đó luôn còn chỗ để chèn thêm vào giữa.

use crate::error::{AppError, AppResult};

const DIGITS: &[u8; 62] = b"0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

fn digit_value(c: u8) -> usize {
    DIGITS.iter().position(|&d| d == c).unwrap_or(0)
}

/// Khoá nằm giữa `before` và `after` (`before < kết quả < after`).
/// `None` ở đầu = chèn lên đầu danh sách, `None` ở cuối = chèn xuống cuối.
pub fn between(before: Option<&str>, after: Option<&str>) -> String {
    let a = before.unwrap_or("").as_bytes();
    let b = after.map(str::as_bytes);
    if let Some(b) = b {
        debug_assert!(a < b, "before phải nhỏ hơn after");
    }
    String::from_utf8(midpoint(a, b)).expect("khoá luôn là ASCII")
}

/// Tính khoá cho một lần "xếp vào cạnh" (kéo thả). `before` = khoá mục ngay trên vị trí mới,
/// `after` = khoá mục ngay dưới. Chỉ cho một phía thì phía kia lấy từ mục kề thật sự qua
/// `neighbour(khoá, sau_hay_không)`. Cả hai thiếu thì xếp cuối (`last`).
pub fn place(
    before: Option<&str>,
    after: Option<&str>,
    last: impl FnOnce() -> AppResult<Option<String>>,
    neighbour: impl Fn(&str, bool) -> AppResult<Option<String>>,
) -> AppResult<String> {
    let (lower, upper) = match (before, after) {
        (None, None) => (last()?, None),
        (Some(b), Some(a)) => (Some(b.to_string()), Some(a.to_string())),
        (Some(b), None) => (Some(b.to_string()), neighbour(b, true)?),
        (None, Some(a)) => (neighbour(a, false)?, Some(a.to_string())),
    };
    if let (Some(l), Some(u)) = (&lower, &upper) {
        if l >= u {
            return Err(AppError::validation(
                "beforeId phải nằm ngay trên afterId trong danh sách",
            ));
        }
    }
    Ok(between(lower.as_deref(), upper.as_deref()))
}

fn midpoint(a: &[u8], b: Option<&[u8]>) -> Vec<u8> {
    if let Some(b) = b {
        // Bỏ phần đầu chung (a coi như được đệm bằng '0').
        let mut n = 0;
        while n < b.len() && a.get(n).copied().unwrap_or(b'0') == b[n] {
            n += 1;
        }
        if n > 0 {
            let mut out = b[..n].to_vec();
            out.extend(midpoint(a.get(n..).unwrap_or(&[]), Some(&b[n..])));
            return out;
        }
    }
    let da = a.first().map_or(0, |&c| digit_value(c));
    let db = b.and_then(|b| b.first()).map_or(62, |&c| digit_value(c));
    if db - da > 1 {
        return vec![DIGITS[(da + db).div_ceil(2)]];
    }
    match b {
        // Hai chữ số liền kề: b còn đuôi thì cắt b ngay chữ số đầu là đủ.
        Some(b) if b.len() > 1 => vec![b[0]],
        _ => {
            let mut out = vec![DIGITS[da]];
            out.extend(midpoint(a.get(1..).unwrap_or(&[]), None));
            out
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn assert_sorted(keys: &[String]) {
        for w in keys.windows(2) {
            assert!(w[0] < w[1], "sai thứ tự: {} !< {}", w[0], w[1]);
        }
    }

    #[test]
    fn first_key_is_nonempty() {
        assert!(!between(None, None).is_empty());
    }

    #[test]
    fn appends_in_order() {
        let mut keys = vec![between(None, None)];
        for _ in 0..1000 {
            let next = between(keys.last().map(String::as_str), None);
            keys.push(next);
        }
        assert_sorted(&keys);
    }

    #[test]
    fn prepends_in_order() {
        let mut keys = vec![between(None, None)];
        for _ in 0..1000 {
            let k = between(None, keys.first().map(String::as_str));
            keys.insert(0, k);
        }
        assert_sorted(&keys);
    }

    #[test]
    fn inserts_in_the_middle_repeatedly() {
        let mut keys = vec![between(None, None)];
        keys.push(between(keys.last().map(String::as_str), None));
        assert_sorted(&keys);
        // Luôn chèn ngay sau phần tử đầu (trường hợp xấu nhất cho độ dài khoá).
        for _ in 0..1000 {
            let k = between(Some(&keys[0]), Some(&keys[1]));
            keys.insert(1, k);
        }
        assert_sorted(&keys);
        // Và chèn vào giữa danh sách.
        for _ in 0..200 {
            let mid = keys.len() / 2;
            let k = between(Some(&keys[mid - 1]), Some(&keys[mid]));
            keys.insert(mid, k);
        }
        assert_sorted(&keys);
    }

    #[test]
    fn keys_never_end_with_zero() {
        let mut keys = vec![between(None, None)];
        for i in 0..300 {
            let k = if i % 2 == 0 {
                between(None, keys.first().map(String::as_str))
            } else {
                between(keys.last().map(String::as_str), None)
            };
            assert!(!k.ends_with('0'), "{k}");
            keys.push(k);
        }
    }

    #[test]
    fn matches_sqlite_text_order() {
        let conn = rusqlite::Connection::open_in_memory().unwrap();
        conn.execute("CREATE TABLE t (k TEXT NOT NULL)", [])
            .unwrap();
        let mut keys = vec![between(None, None)];
        keys.push(between(keys.last().map(String::as_str), None));
        for i in 0..300 {
            match i % 3 {
                0 => {
                    let k = between(None, keys.first().map(String::as_str));
                    keys.insert(0, k);
                }
                1 => {
                    let k = between(keys.last().map(String::as_str), None);
                    keys.push(k);
                }
                _ => {
                    let k = between(Some(&keys[0]), Some(&keys[1]));
                    keys.insert(1, k);
                }
            }
        }
        for k in &keys {
            conn.execute("INSERT INTO t VALUES (?1)", [k]).unwrap();
        }
        let from_db: Vec<String> = conn
            .prepare("SELECT k FROM t ORDER BY k")
            .unwrap()
            .query_map([], |r| r.get(0))
            .unwrap()
            .map(Result::unwrap)
            .collect();
        assert_eq!(from_db, keys);
    }
}
