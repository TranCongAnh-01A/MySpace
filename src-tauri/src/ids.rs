use uuid::Uuid;

/// Workspace mặc định, được seed trong migration 001.
pub const DEFAULT_WORKSPACE_ID: &str = "019ac000-0000-7000-8000-000000000001";

/// Sinh ID mới (UUID v7, sắp xếp được theo thời gian).
pub fn new_id() -> String {
    Uuid::now_v7().to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ids_are_v7_and_unique() {
        let a = new_id();
        let b = new_id();
        assert_ne!(a, b);
        assert_eq!(Uuid::parse_str(&a).unwrap().get_version_num(), 7);
    }
}
