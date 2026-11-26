use serde::{Deserialize, Serialize};
use ts_rs::TS;

use crate::error::{AppError, AppResult};

pub const MAX_NAME_CHARS: usize = 100;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "../../src/lib/ipc/bindings/")]
pub struct Area {
    pub id: String,
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub color: Option<String>,
    pub sort_key: String,
}

#[derive(Debug, Clone, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "../../src/lib/ipc/bindings/")]
pub struct AreaCreate {
    pub name: String,
    #[serde(default)]
    #[ts(optional)]
    pub color: Option<String>,
}

/// Trường nào có mặt thì đổi. `color: ""` = xoá màu.
#[derive(Debug, Clone, Default, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "../../src/lib/ipc/bindings/")]
pub struct AreaPatch {
    #[serde(default)]
    #[ts(optional)]
    pub name: Option<String>,
    #[serde(default)]
    #[ts(optional)]
    pub color: Option<String>,
}

pub fn validate_name(raw: &str) -> AppResult<String> {
    let name = raw.trim();
    if name.is_empty() {
        return Err(AppError::validation("Tên Area không được để trống"));
    }
    if name.chars().count() > MAX_NAME_CHARS {
        return Err(AppError::validation(format!(
            "Tên Area tối đa {MAX_NAME_CHARS} ký tự"
        )));
    }
    Ok(name.to_string())
}

/// Màu `#RRGGBB`; chuỗi rỗng = không có màu.
pub fn validate_color(raw: &str) -> AppResult<Option<String>> {
    let color = raw.trim();
    if color.is_empty() {
        return Ok(None);
    }
    let ok = color.len() == 7
        && color.starts_with('#')
        && color[1..].chars().all(|c| c.is_ascii_hexdigit());
    if !ok {
        return Err(AppError::validation("Màu phải có dạng #RRGGBB"));
    }
    Ok(Some(color.to_string()))
}

impl Area {
    pub fn new(id: String, input: &AreaCreate, sort_key: String) -> AppResult<Self> {
        let color = match &input.color {
            Some(c) => validate_color(c)?,
            None => None,
        };
        Ok(Self {
            id,
            name: validate_name(&input.name)?,
            color,
            sort_key,
        })
    }

    pub fn apply(&mut self, patch: &AreaPatch) -> AppResult<()> {
        let name = patch.name.as_deref().map(validate_name).transpose()?;
        let color = patch.color.as_deref().map(validate_color).transpose()?;
        if let Some(n) = name {
            self.name = n;
        }
        if let Some(c) = color {
            self.color = c;
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::error::ErrorCode;

    fn create(name: &str, color: Option<&str>) -> AppResult<Area> {
        Area::new(
            "1".into(),
            &AreaCreate {
                name: name.into(),
                color: color.map(Into::into),
            },
            "V".into(),
        )
    }

    #[test]
    fn trims_name_and_rejects_empty_or_too_long() {
        assert_eq!(create("  Sức khoẻ ", None).unwrap().name, "Sức khoẻ");
        for bad in ["", "   "] {
            assert_eq!(create(bad, None).unwrap_err().code, ErrorCode::Validation);
        }
        assert!(create(&"a".repeat(100), None).is_ok());
        assert!(create(&"a".repeat(101), None).is_err());
    }

    #[test]
    fn color_must_be_hex_or_empty() {
        assert_eq!(
            create("a", Some("#A08BDF")).unwrap().color.as_deref(),
            Some("#A08BDF")
        );
        assert_eq!(create("a", Some("")).unwrap().color, None);
        for bad in ["red", "#12345", "#GGGGGG", "A08BDF", "#A08BDF0"] {
            assert!(create("a", Some(bad)).is_err(), "{bad}");
        }
    }

    #[test]
    fn patch_changes_given_fields_and_empty_color_clears() {
        let mut a = create("Cũ", Some("#112233")).unwrap();
        a.apply(&AreaPatch {
            name: Some("Mới".into()),
            color: None,
        })
        .unwrap();
        assert_eq!(
            (a.name.as_str(), a.color.as_deref()),
            ("Mới", Some("#112233"))
        );
        a.apply(&AreaPatch {
            name: None,
            color: Some(String::new()),
        })
        .unwrap();
        assert_eq!(a.color, None);
    }

    #[test]
    fn invalid_patch_leaves_area_unchanged() {
        let mut a = create("Giữ", Some("#112233")).unwrap();
        let before = a.clone();
        let err = a
            .apply(&AreaPatch {
                name: Some("Đổi".into()),
                color: Some("xanh".into()),
            })
            .unwrap_err();
        assert_eq!(err.code, ErrorCode::Validation);
        assert_eq!(a, before);
    }

    #[test]
    fn serializes_without_null_color() {
        let json = serde_json::to_value(create("a", None).unwrap()).unwrap();
        assert!(json.get("color").is_none());
        assert_eq!(json["sortKey"], "V");
    }
}
