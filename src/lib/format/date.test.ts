import { formatBytes, formatDate, formatDateTime } from './date';

describe('formatDate', () => {
  const iso = '2026-11-26T17:30:00.000Z';

  it('định dạng theo ba kiểu', () => {
    expect(formatDate(iso, 'DD/MM/YYYY', 'UTC')).toBe('26/11/2026');
    expect(formatDate(iso, 'MM/DD/YYYY', 'UTC')).toBe('11/26/2026');
    expect(formatDate(iso, 'YYYY-MM-DD', 'UTC')).toBe('2026-11-26');
  });

  it('tôn trọng múi giờ (qua ngày mới ở Việt Nam)', () => {
    expect(formatDate(iso, 'DD/MM/YYYY', 'Asia/Ho_Chi_Minh')).toBe('27/11/2026');
    expect(formatDateTime(iso, 'DD/MM/YYYY', 'Asia/Ho_Chi_Minh')).toBe('27/11/2026 00:30');
  });

  it('chuỗi không hợp lệ trả về rỗng', () => {
    expect(formatDate('không phải ngày', 'DD/MM/YYYY')).toBe('');
  });
});

describe('formatBytes', () => {
  it('đổi đơn vị', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(2048)).toBe('2.0 KB');
    expect(formatBytes(3 * 1024 * 1024)).toBe('3.0 MB');
  });
});
