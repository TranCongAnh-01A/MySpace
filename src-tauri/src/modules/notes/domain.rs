use serde::{Deserialize, Serialize};
use serde_json::Value;
use ts_rs::TS;

use crate::error::{AppError, AppResult};

pub const MAX_TITLE_CHARS: usize = 300;
pub const MAX_CONTENT_BYTES: usize = 2 * 1024 * 1024;
pub const MAX_PARENT_DEPTH: usize = 50;
pub const EXCERPT_CHARS: usize = 160;
const MAX_NODE_DEPTH: usize = 64;

/// Nội dung rỗng của một Note mới.
pub const EMPTY_DOC: &str = r#"{"type":"doc","content":[]}"#;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "../../src/lib/ipc/bindings/")]
pub struct Note {
    pub id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub project_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub parent_note_id: Option<String>,
    pub title: String,
    /// Chuỗi JSON của Tiptap (`JSON.stringify(editor.getJSON())`).
    pub content_json: String,
    #[ts(type = "number")]
    pub version: u64,
    pub task_ids: Vec<String>,
    pub tag_ids: Vec<String>,
    pub created_at: String,
    pub updated_at: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub deleted_at: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "../../src/lib/ipc/bindings/")]
pub struct NoteSummary {
    pub id: String,
    pub title: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub project_id: Option<String>,
    pub updated_at: String,
    /// 160 ký tự đầu của `search_text`, xuống dòng đổi thành dấu cách.
    pub excerpt: String,
}

#[derive(Debug, Clone, Default, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "../../src/lib/ipc/bindings/")]
pub struct NoteCreate {
    #[serde(default)]
    #[ts(optional)]
    pub title: Option<String>,
    #[serde(default)]
    #[ts(optional)]
    pub content_json: Option<String>,
    #[serde(default)]
    #[ts(optional)]
    pub project_id: Option<String>,
    #[serde(default)]
    #[ts(optional)]
    pub parent_note_id: Option<String>,
    #[serde(default)]
    #[ts(optional)]
    pub task_id: Option<String>,
    #[serde(default)]
    #[ts(optional)]
    pub tag_ids: Option<Vec<String>>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/lib/ipc/bindings/")]
pub enum NoteSort {
    Updated,
    Title,
    Created,
}

#[derive(Debug, Clone, Default, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "../../src/lib/ipc/bindings/")]
pub struct NoteFilter {
    #[serde(default)]
    #[ts(optional)]
    pub project_id: Option<String>,
    #[serde(default)]
    #[ts(optional)]
    pub task_id: Option<String>,
    #[serde(default)]
    #[ts(optional)]
    pub tag_id: Option<String>,
    #[serde(default)]
    #[ts(optional)]
    pub trashed: Option<bool>,
    #[serde(default)]
    #[ts(optional)]
    pub sort: Option<NoteSort>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "../../src/lib/ipc/bindings/")]
pub struct NoteSaveResult {
    #[ts(type = "number")]
    pub version: u64,
    pub updated_at: String,
}

/// Tham số `note_move`: thiếu = giữ nguyên, `null` = bỏ, có giá trị = đặt.
#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NoteMoveArgs {
    pub id: String,
    #[serde(default, with = "::serde_with::rust::double_option")]
    pub project_id: Option<Option<String>>,
    #[serde(default, with = "::serde_with::rust::double_option")]
    pub parent_note_id: Option<Option<String>>,
}

// ---------- Kiểm tra ----------

pub fn validate_title(raw: &str) -> AppResult<String> {
    let title = raw.trim();
    if title.chars().count() > MAX_TITLE_CHARS {
        return Err(AppError::validation(format!(
            "Tiêu đề tối đa {MAX_TITLE_CHARS} ký tự"
        )));
    }
    Ok(title.to_string())
}

fn invalid(what: &str, name: &str) -> AppError {
    let mut e = AppError::validation("Nội dung ghi chú không hợp lệ");
    e.details = Some(format!("{what} không được phép: {name}"));
    e
}

const BLOCKS: [&str; 6] = [
    "paragraph",
    "heading",
    "listItem",
    "taskItem",
    "codeBlock",
    "blockquote",
];

const NODES: [&str; 13] = [
    "doc",
    "paragraph",
    "heading",
    "text",
    "bulletList",
    "orderedList",
    "listItem",
    "taskList",
    "taskItem",
    "codeBlock",
    "blockquote",
    "horizontalRule",
    "hardBreak",
];

fn scalar_or_null(v: &Value) -> bool {
    matches!(
        v,
        Value::Null | Value::Bool(_) | Value::Number(_) | Value::String(_)
    )
}

fn check_node_attrs(node_type: &str, attrs: &serde_json::Map<String, Value>) -> AppResult<()> {
    for (key, value) in attrs {
        let ok = match (node_type, key.as_str()) {
            ("heading", "level") => value.as_u64().is_some_and(|l| (1..=3).contains(&l)),
            ("taskItem", "checked") => value.is_boolean() || value.is_null(),
            ("codeBlock", "language") => match value {
                Value::Null => true,
                Value::String(s) => {
                    s.chars().count() <= 30
                        && s.chars()
                            .all(|c| matches!(c, 'a'..='z' | '0'..='9' | '+' | '#' | '-'))
                }
                _ => false,
            },
            // Tiptap luôn ghi `start` cho danh sách đánh số.
            ("orderedList", "start") => value.as_u64().is_some(),
            _ => false,
        };
        if !ok {
            return Err(invalid("Thuộc tính", &format!("{node_type}.{key}")));
        }
    }
    Ok(())
}

fn check_mark(mark: &Value) -> AppResult<()> {
    let name = mark.get("type").and_then(Value::as_str).unwrap_or("?");
    match name {
        "bold" | "italic" | "strike" | "code" => Ok(()),
        "link" => {
            let attrs = mark.get("attrs").and_then(Value::as_object);
            let href = attrs
                .and_then(|a| a.get("href"))
                .and_then(Value::as_str)
                .unwrap_or("")
                .trim()
                .to_ascii_lowercase();
            if !["http://", "https://", "mailto:"]
                .iter()
                .any(|p| href.starts_with(p))
            {
                return Err(invalid("Liên kết", "link.href"));
            }
            // Tiptap thêm `target`, `rel`, `class`: chỉ nhận giá trị đơn giản.
            for (k, v) in attrs.into_iter().flatten() {
                let ok = match k.as_str() {
                    "href" => true,
                    "target" | "rel" | "class" => v.is_null() || v.is_string(),
                    _ => false,
                };
                if !ok {
                    return Err(invalid("Thuộc tính", &format!("link.{k}")));
                }
            }
            Ok(())
        }
        other => Err(invalid("Mark", other)),
    }
}

fn check_node(node: &Value, depth: usize) -> AppResult<()> {
    if depth > MAX_NODE_DEPTH {
        return Err(AppError::validation("Nội dung ghi chú lồng quá sâu"));
    }
    let Some(obj) = node.as_object() else {
        return Err(invalid("Node", "(không phải object)"));
    };
    let node_type = obj.get("type").and_then(Value::as_str).unwrap_or("?");
    if !NODES.contains(&node_type) {
        return Err(invalid("Node", node_type));
    }
    if let Some(attrs) = obj.get("attrs") {
        match attrs.as_object() {
            Some(a) if a.values().all(scalar_or_null) => check_node_attrs(node_type, a)?,
            _ => return Err(invalid("Thuộc tính", node_type)),
        }
    }
    if node_type == "text" {
        if !obj.get("text").is_some_and(Value::is_string) {
            return Err(invalid("Node", "text (thiếu nội dung)"));
        }
    } else if obj.contains_key("text") {
        return Err(invalid("Thuộc tính", &format!("{node_type}.text")));
    }
    if let Some(marks) = obj.get("marks") {
        if node_type != "text" {
            return Err(invalid("Mark", node_type));
        }
        for m in marks.as_array().ok_or_else(|| invalid("Mark", "?"))? {
            check_mark(m)?;
        }
    }
    if let Some(children) = obj.get("content") {
        for child in children
            .as_array()
            .ok_or_else(|| invalid("Node", "content"))?
        {
            check_node(child, depth + 1)?;
        }
    }
    for key in obj.keys() {
        if !matches!(
            key.as_str(),
            "type" | "attrs" | "content" | "marks" | "text"
        ) {
            return Err(invalid("Thuộc tính", &format!("{node_type}.{key}")));
        }
    }
    Ok(())
}

/// Parse và kiểm tra `contentJson` theo allowlist. Trả về cây đã parse.
pub fn validate_content(raw: &str) -> AppResult<Value> {
    if raw.len() > MAX_CONTENT_BYTES {
        return Err(AppError::validation("Nội dung ghi chú tối đa 2 MB"));
    }
    let doc: Value = serde_json::from_str(raw)
        .map_err(|_| AppError::validation("Nội dung ghi chú không phải JSON hợp lệ"))?;
    if doc.get("type").and_then(Value::as_str) != Some("doc") {
        return Err(invalid("Node gốc", "(cần type = doc)"));
    }
    check_node(&doc, 0)?;
    Ok(doc)
}

fn push_text(node: &Value, out: &mut String) {
    let kind = node.get("type").and_then(Value::as_str).unwrap_or("");
    if BLOCKS.contains(&kind) && !out.is_empty() && !out.ends_with('\n') {
        out.push('\n');
    }
    match kind {
        "text" => {
            if let Some(t) = node.get("text").and_then(Value::as_str) {
                out.push_str(t);
            }
        }
        "hardBreak" => out.push('\n'),
        _ => {}
    }
    for child in node
        .get("content")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
    {
        push_text(child, out);
    }
}

/// Văn bản thuần của cây Tiptap (cho FTS và `excerpt`).
pub fn extract_text(doc: &Value) -> String {
    let mut out = String::new();
    push_text(doc, &mut out);
    out.trim().to_string()
}

pub fn excerpt(search_text: &str) -> String {
    search_text
        .chars()
        .take(EXCERPT_CHARS)
        .map(|c| if c == '\n' { ' ' } else { c })
        .collect()
}

/// Nội dung Tiptap gồm một đoạn văn chứa `text` (xuống dòng thành `hardBreak`).
pub fn paragraph_doc(text: &str) -> String {
    let mut nodes: Vec<Value> = Vec::new();
    for (i, line) in text.lines().enumerate() {
        if i > 0 {
            nodes.push(serde_json::json!({ "type": "hardBreak" }));
        }
        if !line.is_empty() {
            nodes.push(serde_json::json!({ "type": "text", "text": line }));
        }
    }
    serde_json::json!({
        "type": "doc",
        "content": [{ "type": "paragraph", "content": nodes }]
    })
    .to_string()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::error::ErrorCode;

    fn doc(content: &str) -> String {
        format!(r#"{{"type":"doc","content":[{content}]}}"#)
    }

    fn text_of(raw: &str) -> String {
        extract_text(&validate_content(raw).unwrap())
    }

    #[test]
    fn extracts_heading_list_checklist_code_and_link() {
        let raw = doc(
            r##"{"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Yêu cầu"}]},
            {"type":"paragraph","content":[{"type":"text","text":"Xem "},
              {"type":"text","text":"tài liệu","marks":[{"type":"link","attrs":{"href":"https://a.vn","target":"_blank","rel":"noopener","class":null}},{"type":"bold"}]}]},
            {"type":"bulletList","content":[
              {"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"một"}]}]},
              {"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"hai"}]}]}]},
            {"type":"taskList","content":[
              {"type":"taskItem","attrs":{"checked":true},"content":[{"type":"paragraph","content":[{"type":"text","text":"xong"}]}]}]},
            {"type":"codeBlock","attrs":{"language":"c++"},"content":[{"type":"text","text":"let x = 1;"}]}"##,
        );
        assert_eq!(
            text_of(&raw),
            "Yêu cầu\nXem tài liệu\nmột\nhai\nxong\nlet x = 1;"
        );
    }

    #[test]
    fn empty_doc_has_empty_text() {
        assert_eq!(text_of(EMPTY_DOC), "");
    }

    #[test]
    fn unknown_node_names_first_offender() {
        let raw = doc(r#"{"type":"paragraph"},{"type":"image","attrs":{"src":"x"}}"#);
        let err = validate_content(&raw).unwrap_err();
        assert_eq!(err.code, ErrorCode::Validation);
        assert!(err.details.unwrap().contains("image"));
    }

    #[test]
    fn unknown_mark_attr_and_bad_link_are_rejected() {
        let mark = |m: &str| {
            doc(&format!(
                r#"{{"type":"paragraph","content":[{{"type":"text","text":"a","marks":[{m}]}}]}}"#
            ))
        };
        for bad in [
            r#"{"type":"underline"}"#,
            r#"{"type":"link","attrs":{"href":"javascript:alert(1)"}}"#,
            r#"{"type":"link","attrs":{"href":"JavaScript:alert(1)"}}"#,
            r#"{"type":"link","attrs":{"href":"data:text/html,x"}}"#,
            r#"{"type":"link","attrs":{}}"#,
            r#"{"type":"link","attrs":{"href":"https://a.vn","onclick":"x"}}"#,
        ] {
            let err = validate_content(&mark(bad)).unwrap_err();
            assert_eq!(err.code, ErrorCode::Validation, "{bad}");
        }
        assert!(
            validate_content(&mark(r#"{"type":"link","attrs":{"href":"mailto:a@b.c"}}"#)).is_ok()
        );
    }

    #[test]
    fn node_attrs_are_checked() {
        for bad in [
            r#"{"type":"heading","attrs":{"level":4}}"#,
            r#"{"type":"heading","attrs":{"level":1,"id":"x"}}"#,
            r#"{"type":"codeBlock","attrs":{"language":"JS"}}"#,
            r#"{"type":"codeBlock","attrs":{"language":"a b"}}"#,
            r#"{"type":"taskItem","attrs":{"checked":"yes"}}"#,
            r#"{"type":"paragraph","attrs":{"style":"x"}}"#,
        ] {
            assert_eq!(
                validate_content(&doc(bad)).unwrap_err().code,
                ErrorCode::Validation,
                "{bad}"
            );
        }
        assert!(
            validate_content(&doc(r#"{"type":"codeBlock","attrs":{"language":null}}"#)).is_ok()
        );
        assert!(validate_content(&doc(
            r#"{"type":"orderedList","attrs":{"start":1},"content":[]}"#
        ))
        .is_ok());
    }

    #[test]
    fn structural_errors_are_rejected() {
        for bad in [
            "không phải json",
            "[]",
            r#"{"type":"paragraph"}"#,
            r#"{"type":"doc","content":{}}"#,
            r#"{"type":"doc","content":[{"type":"text"}]}"#,
            r#"{"type":"doc","extra":1}"#,
        ] {
            assert_eq!(
                validate_content(bad).unwrap_err().code,
                ErrorCode::Validation,
                "{bad}"
            );
        }
        let big = format!(
            r#"{{"type":"doc","content":[{{"type":"paragraph","content":[{{"type":"text","text":"{}"}}]}}]}}"#,
            "a".repeat(MAX_CONTENT_BYTES)
        );
        assert_eq!(
            validate_content(&big).unwrap_err().code,
            ErrorCode::Validation
        );
    }

    #[test]
    fn excerpt_is_160_chars_without_newlines() {
        let text = format!("a\nb{}", "c".repeat(300));
        let e = excerpt(&text);
        assert_eq!(e.chars().count(), 160);
        assert!(e.starts_with("a b"));
    }

    #[test]
    fn title_limit_and_trim() {
        assert_eq!(validate_title("  Họp  ").unwrap(), "Họp");
        assert!(validate_title(&"x".repeat(301)).is_err());
        assert!(validate_title(&"x".repeat(300)).is_ok());
    }

    #[test]
    fn paragraph_doc_is_valid_and_keeps_text() {
        let raw = paragraph_doc("dòng một\ndòng hai");
        assert_eq!(text_of(&raw), "dòng một\ndòng hai");
    }

    #[test]
    fn move_args_distinguish_missing_null_and_value() {
        let a: NoteMoveArgs = serde_json::from_str(r#"{"id":"n"}"#).unwrap();
        assert_eq!((a.project_id, a.parent_note_id), (None, None));
        let b: NoteMoveArgs =
            serde_json::from_str(r#"{"id":"n","projectId":null,"parentNoteId":"p"}"#).unwrap();
        assert_eq!(b.project_id, Some(None));
        assert_eq!(b.parent_note_id, Some(Some("p".to_string())));
    }
}
