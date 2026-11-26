import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Providers } from '@/app/providers';
import { ShortcutRecorder } from './ShortcutRecorder';

function setup(props: Partial<React.ComponentProps<typeof ShortcutRecorder>> = {}) {
  const onRecord = vi.fn();
  render(
    <Providers>
      <ShortcutRecorder id="sc" value="Ctrl+Shift+Space" onRecord={onRecord} {...props} />
    </Providers>,
  );
  return { onRecord, button: screen.getByRole('button', { name: /^Đổi phím/ }) };
}

describe('ShortcutRecorder', () => {
  it('ghi tổ hợp phím và báo accelerator theo chuẩn Tauri', async () => {
    const { onRecord, button } = setup();
    expect(screen.getByText('Ctrl+Shift+Space')).toBeInTheDocument();
    await userEvent.click(button);
    expect(screen.getByText(/Đang chờ phím/)).toBeInTheDocument();
    await userEvent.keyboard('{Control>}{Alt>}k{/Alt}{/Control}');
    expect(onRecord).toHaveBeenCalledWith('Ctrl+Alt+K');
    expect(screen.getByText('Ctrl+Shift+Space')).toBeInTheDocument();
  });

  it('Esc huỷ, không gọi onRecord', async () => {
    const { onRecord, button } = setup();
    await userEvent.click(button);
    await userEvent.keyboard('{Escape}');
    expect(onRecord).not.toHaveBeenCalled();
    expect(screen.queryByText(/Đang chờ phím/)).not.toBeInTheDocument();
  });

  it('phím không kèm Ctrl/Alt/Shift bị từ chối kèm lời nhắc', async () => {
    const { onRecord, button } = setup();
    await userEvent.click(button);
    await userEvent.keyboard('a');
    expect(onRecord).not.toHaveBeenCalled();
    expect(await screen.findByRole('alert')).toHaveTextContent('Cần kèm Ctrl');
  });

  it('hiện lỗi CONFLICT từ cha', () => {
    setup({ error: 'Tổ hợp phím này đã bị ứng dụng khác chiếm' });
    expect(screen.getByRole('alert')).toHaveTextContent('đã bị ứng dụng khác chiếm');
  });
});
