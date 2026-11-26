import { eventToAccelerator, isModifierOnly, type KeyLike } from './accelerator';

const ev = (over: Partial<KeyLike>): KeyLike => ({
  key: 'a',
  code: 'KeyA',
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
  metaKey: false,
  ...over,
});

describe('eventToAccelerator', () => {
  it('Ctrl+Shift+Space', () => {
    expect(eventToAccelerator(ev({ key: ' ', code: 'Space', ctrlKey: true, shiftKey: true }))).toBe(
      'Ctrl+Shift+Space',
    );
  });

  it('chữ, số, phím F, mũi tên và phím Windows', () => {
    expect(eventToAccelerator(ev({ ctrlKey: true, altKey: true }))).toBe('Ctrl+Alt+A');
    expect(eventToAccelerator(ev({ code: 'Digit7', ctrlKey: true }))).toBe('Ctrl+7');
    expect(eventToAccelerator(ev({ code: 'F5', altKey: true }))).toBe('Alt+F5');
    expect(eventToAccelerator(ev({ code: 'ArrowUp', ctrlKey: true }))).toBe('Ctrl+Up');
    expect(eventToAccelerator(ev({ metaKey: true }))).toBe('Super+A');
  });

  it('không hợp lệ: thiếu phím bổ trợ, chỉ có phím bổ trợ, phím lạ', () => {
    expect(eventToAccelerator(ev({}))).toBeNull();
    expect(
      eventToAccelerator(ev({ key: 'Control', code: 'ControlLeft', ctrlKey: true })),
    ).toBeNull();
    expect(eventToAccelerator(ev({ code: 'IntlRo', ctrlKey: true }))).toBeNull();
  });

  it('nhận ra phím bổ trợ', () => {
    expect(isModifierOnly({ key: 'Shift' })).toBe(true);
    expect(isModifierOnly({ key: 'a' })).toBe(false);
  });
});
