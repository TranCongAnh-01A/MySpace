pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|_app, _args, _cwd| {}))
        .run(tauri::generate_context!())
        .expect("lỗi khi chạy LifeHub");
}
