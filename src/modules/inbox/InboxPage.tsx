import { useEffect, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { errorMessage, inboxCreate, inboxList } from '../../lib/ipc/commands';
import { onEntityChanged } from '../../lib/ipc/events';

const QUERY_KEY = ['inbox'];

// UI thô; phiên C làm lại.
export function InboxPage() {
  const queryClient = useQueryClient();
  const [text, setText] = useState('');

  const { data, isLoading, error } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: () => inboxList(),
  });

  // Core phát entity-changed (kể cả từ cửa sổ Quick Capture) thì tải lại danh sách.
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let disposed = false;
    void onEntityChanged((e) => {
      if (e.entity === 'inbox') void queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    }).then((fn) => {
      if (disposed) fn();
      else unlisten = fn;
    });
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [queryClient]);

  const create = useMutation({
    mutationFn: inboxCreate,
    onSuccess: () => {
      setText('');
      void queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    },
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    create.mutate(text);
  }

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-3 text-xl font-semibold">Inbox</h1>
      <form onSubmit={submit} className="mb-4 flex gap-2">
        <input
          aria-label="Thêm vào Inbox"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Ghi nhanh một ý…"
          className="flex-1 rounded bg-white/10 px-3 py-2 outline-none focus:ring-1 focus:ring-violet-400"
        />
        <button type="submit" className="rounded bg-violet-500 px-4 py-2 hover:bg-violet-400">
          Thêm
        </button>
      </form>
      {create.error && (
        <p role="alert" className="mb-2 text-red-400">
          {errorMessage(create.error)}
        </p>
      )}
      {isLoading && <p>Đang tải…</p>}
      {error && (
        <p role="alert" className="text-red-400">
          {errorMessage(error)}
        </p>
      )}
      {data?.length === 0 && <p className="text-white/60">Inbox trống.</p>}
      <ul className="space-y-2">
        {data?.map((item) => (
          <li key={item.id} className="rounded bg-white/5 px-3 py-2 whitespace-pre-wrap">
            {item.content}
          </li>
        ))}
      </ul>
    </div>
  );
}
