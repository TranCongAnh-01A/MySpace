import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DatePicker } from './date-picker';

describe('DatePicker', () => {
  it('hiện placeholder khi chưa chọn và ngày theo dateFormat khi đã chọn', () => {
    const { rerender } = render(
      <DatePicker
        onChange={() => {}}
        language="vi"
        dateFormat="DD/MM/YYYY"
        placeholder="Chọn ngày"
      />,
    );
    expect(screen.getByRole('button', { name: /Chọn ngày/ })).toBeInTheDocument();
    rerender(
      <DatePicker
        value={new Date(2026, 10, 26)}
        onChange={() => {}}
        language="vi"
        dateFormat="YYYY-MM-DD"
        placeholder="Chọn ngày"
      />,
    );
    expect(screen.getByRole('button', { name: /2026-11-26/ })).toBeInTheDocument();
  });

  it('chọn một ngày trong lịch thì gọi onChange và đóng', async () => {
    const onChange = vi.fn();
    render(
      <DatePicker
        value={new Date(2026, 10, 1)}
        onChange={onChange}
        language="en"
        dateFormat="DD/MM/YYYY"
        placeholder="Pick"
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: /01\/11\/2026/ }));
    await userEvent.click(await screen.findByRole('button', { name: /November 15th, 2026/ }));
    const picked = onChange.mock.calls[0]?.[0] as Date;
    expect(picked.getDate()).toBe(15);
    expect(picked.getMonth()).toBe(10);
  });
});
