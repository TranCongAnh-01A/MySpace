import { Fragment, useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { InboxIcon, MoreHorizontal } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { EmptyState, ErrorState } from '@/components/ui/empty-state';
import { Input, Textarea } from '@/components/ui/input';
import { Kbd } from '@/components/ui/kbd';
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
import { LoadingBlock } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { formatDateTime } from '@/lib/format/date';
import { useT } from '@/lib/i18n';
import {
  errorCode,
  errorMessage,
  inboxConvertToNote,
  inboxConvertToTask,
  inboxDelete,
  inboxList,
  inboxUpdate,
  trashRestore,
} from '@/lib/ipc/commands';
import type { InboxItem } from '@/lib/ipc/bindings/InboxItem';
import type { InboxStatus } from '@/lib/ipc/bindings/InboxStatus';
import type { TaskCreate } from '@/lib/ipc/contract';
import { useSettings } from '@/modules/settings/hooks';
import { CreateTaskDialog } from '@/modules/tasks/CreateTaskDialog';
import { useCreateInbox } from './hooks';
import { cn } from '@/lib/utils';

const URL_RE = /(https?:\/\/[^\s]+)/g;

/** Nội dung có URL được tô màu (chưa mở được trình duyệt ngoài ở v0.2; có "Sao chép liên kết"). */
function Linkified({ text }: { text: string }) {
  return (
    <p className="break-words whitespace-pre-wrap">
      {text.split(URL_RE).map((part, i) =>
        /^https?:\/\//.test(part) ? (
          <span key={i} className="text-primary underline">
            {part}
          </span>
        ) : (
          <Fragment key={i}>{part}</Fragment>
        ),
      )}
    </p>
  );
}

function InboxRow({
  item,
  highlighted,
  onConvert,
  onConvertNote,
}: {
  item: InboxItem;
  highlighted: boolean;
  onConvert: (item: InboxItem) => void;
  onConvertNote: (item: InboxItem) => void;
}) {
  const t = useT();
  const qc = useQueryClient();
  const { data: settings } = useSettings();
  const ref = useRef<HTMLLIElement>(null);
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(item.content);
  const processed = item.status === 'Processed';
  const link = item.content.match(URL_RE)?.[0];

  useEffect(() => {
    if (highlighted) ref.current?.scrollIntoView({ block: 'center' });
  }, [highlighted]);

  const refresh = () => void qc.invalidateQueries({ queryKey: ['inbox'] });
  const update = useMutation({
    mutationFn: (content: string) => inboxUpdate(item.id, content),
    onSuccess: () => setEditing(false),
    onError: (e) => toast.error(t('common.error'), { description: errorMessage(e) }),
    onSettled: refresh,
  });
  const remove = useMutation({
    mutationFn: () => inboxDelete(item.id),
    onSuccess: () =>
      toast(t('inbox.deleted'), {
        duration: 5000,
        action: {
          label: t('tasks.undo'),
          onClick: () => void trashRestore('Inbox', item.id).then(refresh),
        },
      }),
    onError: (e) => toast.error(t('common.error'), { description: errorMessage(e) }),
    onSettled: () => {
      refresh();
      void qc.invalidateQueries({ queryKey: ['trash'] });
    },
  });

  const startEdit = () => {
    if (processed) return;
    setText(item.content);
    setEditing(true);
  };
  const copyLink = () => {
    if (!link) return;
    void navigator.clipboard.writeText(link).then(() => toast.success(t('inbox.linkCopied')));
  };

  const menuItems = (Item: typeof DropdownMenuItem | typeof ContextMenuItem) => (
    <>
      {!processed && <Item onSelect={() => onConvert(item)}>{t('inbox.convert')}</Item>}
      {!processed && <Item onSelect={() => onConvertNote(item)}>{t('inbox.convertNote')}</Item>}
      {!processed && <Item onSelect={startEdit}>{t('inbox.edit')}</Item>}
      {link && <Item onSelect={copyLink}>{t('inbox.copyLink')}</Item>}
      <Item onSelect={() => remove.mutate()}>{t('inbox.deleteItem')}</Item>
    </>
  );

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <li
          ref={ref}
          id={`inbox-${item.id}`}
          className={cn(
            'flex items-start gap-3 rounded-md border bg-surface px-3 py-2',
            highlighted ? 'border-primary' : 'border-border',
          )}
        >
          <div className="min-w-0 flex-1">
            {editing ? (
              <form
                onSubmit={(e: FormEvent) => {
                  e.preventDefault();
                  update.mutate(text);
                }}
              >
                <Textarea
                  autoFocus
                  aria-label={t('inbox.editLabel')}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') {
                      e.stopPropagation();
                      setEditing(false);
                    } else if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      update.mutate(text);
                    }
                  }}
                  aria-invalid={update.isError}
                />
                {update.isError && (
                  <p role="alert" className="mt-1 text-danger">
                    {errorMessage(update.error)}
                  </p>
                )}
                <div className="mt-2 flex gap-2">
                  <Button type="submit" size="sm" disabled={update.isPending}>
                    {t('common.save')}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() => setEditing(false)}
                  >
                    {t('common.cancel')}
                  </Button>
                </div>
              </form>
            ) : (
              <div onDoubleClick={startEdit}>
                <Linkified text={item.content} />
              </div>
            )}
            <p className="mt-0.5 text-xs text-muted tabular-nums">
              {formatDateTime(
                item.createdAt,
                settings?.dateFormat ?? 'DD/MM/YYYY',
                settings?.timezone,
              )}
            </p>
          </div>
          {processed && item.convertedNoteId ? (
            <Button asChild variant="secondary" size="sm">
              <Link to={`/notes/${item.convertedNoteId}`}>{t('inbox.openNote')}</Link>
            </Button>
          ) : processed && item.convertedTaskId ? (
            <Button asChild variant="secondary" size="sm">
              <Link to={`/tasks/${item.convertedTaskId}`}>{t('inbox.openTask')}</Link>
            </Button>
          ) : (
            !editing && (
              <Button variant="secondary" size="sm" onClick={() => onConvert(item)}>
                {t('inbox.convert')}
              </Button>
            )
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label={t('inbox.itemMenu')}>
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">{menuItems(DropdownMenuItem)}</DropdownMenuContent>
          </DropdownMenu>
        </li>
      </ContextMenuTrigger>
      <ContextMenuContent>{menuItems(ContextMenuItem)}</ContextMenuContent>
    </ContextMenu>
  );
}

export function InboxPage() {
  const t = useT();
  const qc = useQueryClient();
  const [text, setText] = useState('');
  const [status, setStatus] = useState<InboxStatus>('Open');
  const [convertItem, setConvertItem] = useState<InboxItem | null>(null);
  const [sp] = useSearchParams();
  const highlightId = sp.get('item');
  const { data: settings } = useSettings();
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['inbox', status],
    queryFn: () => inboxList(status),
  });
  const create = useCreateInbox(() => setText(''));
  const navigate = useNavigate();
  const convertNote = useMutation({
    mutationFn: (id: string) => inboxConvertToNote(id, {}),
    onSuccess: (note) => void navigate(`/notes/${note.id}`),
    onError: (e) => {
      if (errorCode(e) === 'CONFLICT') toast.error(t('inbox.alreadyProcessed'));
      else toast.error(t('common.error'), { description: errorMessage(e) });
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ['inbox'] });
      void qc.invalidateQueries({ queryKey: ['notes'] });
    },
  });

  const convert = useMutation({
    mutationFn: (v: { id: string; input: TaskCreate }) => inboxConvertToTask(v.id, v.input),
    onSuccess: () => {
      setConvertItem(null);
      toast.success(t('tasks.createdToast'));
    },
    onError: (e) => {
      if (errorCode(e) === 'CONFLICT') {
        toast.error(t('inbox.alreadyProcessed'));
        setConvertItem(null);
      }
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ['inbox'] });
      void qc.invalidateQueries({ queryKey: ['tasks'] });
    },
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    create.mutate(text);
  }

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
    body =
      status === 'Open' ? (
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
      ) : (
        <EmptyState icon={<InboxIcon />} title={t('inbox.emptyProcessed')} />
      );
  else
    body = (
      <ul className="space-y-2">
        {data.map((item) => (
          <InboxRow
            key={item.id}
            item={item}
            highlighted={item.id === highlightId}
            onConvert={setConvertItem}
            onConvertNote={(i) => convertNote.mutate(i.id)}
          />
        ))}
      </ul>
    );

  return (
    <div className="h-full overflow-auto p-6">
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
        <Tabs value={status} onValueChange={(v) => setStatus(v as InboxStatus)} className="mb-4">
          <TabsList aria-label={t('inbox.tabs')}>
            <TabsTrigger value="Open">{t('inbox.tab.open')}</TabsTrigger>
            <TabsTrigger value="Processed">{t('inbox.tab.processed')}</TabsTrigger>
          </TabsList>
        </Tabs>
        {body}
      </div>
      <CreateTaskDialog
        open={!!convertItem}
        onOpenChange={(o) => !o && setConvertItem(null)}
        initialTitle={(convertItem?.content.split('\n')[0] ?? '').slice(0, 500)}
        title={t('create.fromInbox')}
        description={t('create.fromInboxDesc')}
        submitLabel={t('create.submit')}
        pending={convert.isPending}
        error={convert.isError && errorCode(convert.error) !== 'CONFLICT' ? convert.error : null}
        onSubmit={(input) => convertItem && convert.mutate({ id: convertItem.id, input })}
      />
    </div>
  );
}
