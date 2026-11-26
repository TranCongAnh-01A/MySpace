export type KeyLike = {
  key: string;
  code: string;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  metaKey: boolean;
};

const MODIFIER_KEYS = new Set(['Control', 'Alt', 'Shift', 'Meta', 'AltGraph', 'OS']);

const NAMED: Record<string, string> = {
  Space: 'Space',
  Enter: 'Enter',
  Tab: 'Tab',
  Backspace: 'Backspace',
  Delete: 'Delete',
  Insert: 'Insert',
  Home: 'Home',
  End: 'End',
  PageUp: 'PageUp',
  PageDown: 'PageDown',
  ArrowUp: 'Up',
  ArrowDown: 'Down',
  ArrowLeft: 'Left',
  ArrowRight: 'Right',
  Backquote: '`',
  Minus: '-',
  Equal: '=',
  BracketLeft: '[',
  BracketRight: ']',
  Backslash: '\\',
  Semicolon: ';',
  Quote: "'",
  Comma: ',',
  Period: '.',
  Slash: '/',
};

export function isModifierOnly(e: Pick<KeyLike, 'key'>): boolean {
  return MODIFIER_KEYS.has(e.key);
}

function keyName(e: KeyLike): string | null {
  if (/^Key[A-Z]$/.test(e.code)) return e.code.slice(3);
  if (/^Digit[0-9]$/.test(e.code)) return e.code.slice(5);
  if (/^F([1-9]|1[0-9]|2[0-4])$/.test(e.code)) return e.code;
  return NAMED[e.code] ?? null;
}

/**
 * Đổi sự kiện phím thành accelerator của Tauri: `Ctrl`/`Alt`/`Shift`/`Super` + phím.
 * Trả `null` nếu chưa là tổ hợp hợp lệ (chỉ có phím bổ trợ, phím lạ, hoặc không kèm phím bổ trợ).
 */
export function eventToAccelerator(e: KeyLike): string | null {
  if (isModifierOnly(e)) return null;
  const key = keyName(e);
  if (!key) return null;
  const mods = [
    e.ctrlKey && 'Ctrl',
    e.altKey && 'Alt',
    e.shiftKey && 'Shift',
    e.metaKey && 'Super',
  ].filter((m): m is string => typeof m === 'string');
  if (mods.length === 0) return null;
  return [...mods, key].join('+');
}
