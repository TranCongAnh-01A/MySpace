import { foldText } from './text';

describe('foldText', () => {
  it('bỏ dấu và đổi đ', () => {
    expect(foldText('Đặt lịch họp ằ ẵ ặ ỷ ữ')).toBe('dat lich hop a a a y u');
  });
});
