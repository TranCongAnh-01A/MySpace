import { useState, type FormEvent } from 'react';
import { InboxIcon, MoreHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState, ErrorState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/menus';
import { Kbd } from '@/components/ui/kbd';
import { LoadingBlock } from '@/components/ui/skeleton';
import { formatDateTime } from '@/lib/format/date';
import { useT } from '@/lib/i18n';
import { errorMessage } from '@/lib/ipc/commands';
import type { InboxItem } from '@/lib/ipc/bindings/InboxItem';
import { useSettings } from '@/modules/settings/hooks';
import { useCreateInbox, useInboxOpen } from './hooks';

function InboxRow({ item }: { item: InboxItem }) {
  const t = useT();
  const { data: settings } = useSettings();
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <li className="flex items-start gap-3 rounded-md border border-border bg-surface px-3 py-2">
          <div className="min-w-0 flex-1">
            <p className="break-words whitespace-pre-wrap">{item.content}</p>
            <p className="mt-0.5 text-xs text-muted">
              {formatDateTime(
                item.createdAt,
                settings?.dateFormat ?? 'DD/MM/YYYY',
                settings?.timezone,
              )}
            </p>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label={t('inbox.itemMenu')}>
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem disabled>
                {t('inbox.deleteItem')}
                <span className="text-xs">{t('common.comingSoon')}</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </li>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem disabled>
          {t('inbox.deleteItem')}
          <span className="text-xs">{t('common.comingSoon')}</span>
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

export function InboxPage() {
  const t = useT();
  const [text, setText] = useState('');
  const { data: settings } = useSettings();
  const { data, isLoading, error, refetch } = useInboxOpen();
  const create = useCreateInbox(() => setText(''));

  function submit(e: FormEvent) {
    e.preventDefault();
    create.mutate(text);
  }

  // Chèn <Kbd> vào giữa câu gợi ý đã dịch.
  const [hintBefore = '', hintAfter = ''] = t('inbox.emptyHint', { shortcut: '@@' }).split('@@');
  let body;
  if (isLoading) body = <LoadingBlock label={t('common.loading')} />;
  else if (error)
    body = (
      <ErrorState
        title={t('common.loadError')}
        message={errorMessage(error)}
        retryLabel={t('common.retry')}
        onRetry={() => void refetch()}
      />
    );
  else if (!data || data.length === 0)
    body = (
      <EmptyState
        icon={<InboxIcon />}
        title={t('inbox.empty')}
        hint={
          <>
            {hintBefore}
            <Kbd>{settings?.quickCaptureShortcut ?? 'Ctrl+Shift+Space'}</Kbd>
            {hintAfter}
          </>
        }
      />
    );
  else
    body = (
      <ul className="space-y-2">
        {data.map((item) => (
          <InboxRow key={item.id} item={item} />
        ))}
      </ul>
    );

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-4 text-xl font-semibold">{t('inbox.title')}</h1>
      <form onSubmit={submit} className="mb-4 flex gap-2">
        <Input
          aria-label={t('inbox.addLabel')}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={t('inbox.addPlaceholder')}
          aria-invalid={create.isError}
          className="flex-1"
        />
        <Button type="submit" disabled={create.isPending}>
          {t('common.add')}
        </Button>
      </form>
      {create.error && (
        <p role="alert" className="mb-3 text-danger">
          {errorMessage(create.error)}
        </p>
      )}
      {body}
    </div>
  );
}
