import { render, screen } from '@testing-library/react';
import { InboxPage } from './InboxPage';

describe('InboxPage', () => {
  it('hiển thị tiêu đề', () => {
    render(<InboxPage />);
    expect(screen.getByRole('heading', { name: 'Inbox' })).toBeInTheDocument();
  });
});
