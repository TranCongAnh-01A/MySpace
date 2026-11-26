import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Switch } from './switch';

describe('Switch', () => {
  it('bật/tắt bằng chuột và bàn phím', async () => {
    const onChange = vi.fn();
    render(<Switch aria-label="Thông báo" checked={false} onCheckedChange={onChange} />);
    const sw = screen.getByRole('switch', { name: 'Thông báo' });
    await userEvent.click(sw);
    expect(onChange).toHaveBeenLastCalledWith(true);
    sw.focus();
    await userEvent.keyboard(' ');
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it('không bấm được khi disabled', async () => {
    const onChange = vi.fn();
    render(<Switch aria-label="Ẩn" disabled onCheckedChange={onChange} />);
    await userEvent.click(screen.getByRole('switch', { name: 'Ẩn' }));
    expect(onChange).not.toHaveBeenCalled();
  });
});
