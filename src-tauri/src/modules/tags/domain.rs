use serde::{Deserialize, Serialize};
use ts_rs::TS;

use crate::error::{AppError, AppResult};
use crate::modules::areas::domain::validate_color;

pub const MAX_NAME_CHARS: usize = 50;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "../../src/lib/ipc/bindings/")]
pub struct Tag {
    pub id: String,
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub color: Option<String>,
}

#[derive(Debug, Clone, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "../../src/lib/ipc/bindings/")]
pub struct TagCreate {
    pub name: String,
    #[serde(default)]
    #[ts(optional)]
    pub color: Option<String>,
}

/// `color: ""` = xoá màu.
#[derive(Debug, Clone, Default, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "../../src/lib/ipc/bindings/")]
pub struct TagPatch {
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
        return Err(AppError::validation("Tên tag không được để trống"));
    }
    if name.chars().count() > MAX_NAME_CHARS {
        return Err(AppError::validation(format!(
            "Tên tag tối đa {MAX_NAME_CHARS} ký tự"
        )));
    }
    Ok(name.to_string())
}

impl Tag {
    pub fn new(id: String, input: &TagCreate) -> AppResult<Self> {
        let color = match &input.color {
            Some(c) => validate_color(c)?,
            None => None,
        };
        Ok(Self {
            id,
            name: validate_name(&input.name)?,
            color,
        })
    }

    pub fn apply(&mut self, patch: &TagPatch) -> AppResult<()> {
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

    #[test]
    fn name_limits_and_color() {
        let mk = |n: &str, c: Option<&str>| {
            Tag::new(
                "1".into(),
                &TagCreate {
                    name: n.into(),
                    color: c.map(Into::into),
                },
            )
        };
        assert_eq!(mk("  việc nhà ", None).unwrap().name, "việc nhà");
        assert!(mk(" ", None).is_err());
        assert!(mk(&"a".repeat(50), None).is_ok());
        assert!(mk(&"a".repeat(51), None).is_err());
        assert!(mk("a", Some("đỏ")).is_err());
        assert_eq!(mk("a", Some("")).unwrap().color, None);
    }
}
