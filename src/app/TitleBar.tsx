import { getCurrentWindow } from '@tauri-apps/api/window';

// Titlebar thô cho cửa sổ không viền; phiên C làm lại.
export function TitleBar() {
  const win = () => getCurrentWindow();
  return (
    <div className="flex h-8 shrink-0 items-center bg-[#1c1c24] text-sm select-none">
      <div data-tauri-drag-region className="flex-1 px-3 leading-8">
        LifeHub
      </div>
      <button
        aria-label="Thu nhỏ"
        className="h-8 w-11 hover:bg-white/10"
        onClick={() => void win().minimize()}
      >
        –
      </button>
      <button
        aria-label="Phóng to"
        className="h-8 w-11 hover:bg-white/10"
        onClick={() => void win().toggleMaximize()}
      >
        ▢
      </button>
      <button
        aria-label="Đóng"
        className="h-8 w-11 hover:bg-red-600"
        onClick={() => void win().close()}
      >
        ✕
      </button>
    </div>
  );
}
