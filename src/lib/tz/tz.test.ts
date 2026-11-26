import { addDays, localToUtc, todayIn, utcToLocalParts, weekdayOf } from './index';

describe('tz', () => {
  it('giờ địa phương Việt Nam (UTC+7) ↔ UTC', () => {
    expect(localToUtc('2026-11-27', '09:30', 'Asia/Ho_Chi_Minh')).toBe('2026-11-27T02:30:00.000Z');
    expect(utcToLocalParts('2026-11-27T02:30:00.000Z', 'Asia/Ho_Chi_Minh')).toEqual({
      date: '2026-11-27',
      time: '09:30',
    });
  });

  it('qua nửa đêm: UTC còn hôm trước nhưng địa phương đã sang ngày mới', () => {
    expect(utcToLocalParts('2026-11-26T18:00:00.000Z', 'Asia/Ho_Chi_Minh').date).toBe('2026-11-27');
    expect(todayIn('Asia/Ho_Chi_Minh', new Date('2026-11-26T18:00:00.000Z'))).toBe('2026-11-27');
    expect(todayIn('America/New_York', new Date('2026-11-26T03:00:00.000Z'))).toBe('2026-11-25');
  });

  it('New York đổi giờ mùa hè: 2026-03-08 (EST -5 → EDT -4)', () => {
    // Trước khi đổi giờ: 12:00 EST = 17:00Z. Sau: 12:00 EDT = 16:00Z.
    expect(localToUtc('2026-03-07', '12:00', 'America/New_York')).toBe('2026-03-07T17:00:00.000Z');
    expect(localToUtc('2026-03-09', '12:00', 'America/New_York')).toBe('2026-03-09T16:00:00.000Z');
    expect(utcToLocalParts('2026-03-09T16:00:00.000Z', 'America/New_York').time).toBe('12:00');
    // Giữ đúng giờ địa phương khi chuyển qua ngày đổi giờ.
    expect(
      utcToLocalParts(localToUtc('2026-11-01', '09:00', 'America/New_York'), 'America/New_York')
        .time,
    ).toBe('09:00');
  });

  it('addDays và weekdayOf', () => {
    expect(addDays('2026-11-30', 1)).toBe('2026-12-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(weekdayOf('2026-11-27')).toBe(5); // thứ Sáu
  });
});
