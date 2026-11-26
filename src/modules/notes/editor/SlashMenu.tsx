import { forwardRef, useEffect, useImperativeHandle, useState } from 'react';
import { ReactRenderer } from '@tiptap/react';
import { Extension, type Editor } from '@tiptap/core';
import Suggestion, { type SuggestionKeyDownProps, type SuggestionProps } from '@tiptap/suggestion';
import { PluginKey } from '@tiptap/pm/state';
import type { TFunction } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { SLASH_ITEMS, filterSlashItems, type SlashItem } from './slashItems';

type ListProps = SuggestionProps<SlashItem, SlashItem> & { t: TFunction; listId: string };
type ListHandle = { onKeyDown: (p: SuggestionKeyDownProps) => boolean };

const optionId = (listId: string, i: number) => `${listId}-opt-${i}`;

const SlashList = forwardRef<ListHandle, ListProps>(function SlashList(props, ref) {
  const { items, command, t, listId, editor } = props;
  const [active, setActive] = useState(0);
  const [prevItems, setPrevItems] = useState(items);
  if (prevItems !== items) {
    setPrevItems(items);
    setActive(0);
  }
  const current = Math.min(active, Math.max(0, items.length - 1));

  useEffect(() => {
    editor.view.dom.setAttribute('aria-controls', listId);
    if (items.length > 0)
      editor.view.dom.setAttribute('aria-activedescendant', optionId(listId, current));
    return () => {
      editor.view.dom.removeAttribute('aria-controls');
      editor.view.dom.removeAttribute('aria-activedescendant');
    };
  }, [editor, listId, current, items.length]);

  useImperativeHandle(ref, () => ({
    onKeyDown: ({ event }) => {
      if (items.length === 0) return false;
      if (event.key === 'ArrowDown') {
        setActive((current + 1) % items.length);
        return true;
      }
      if (event.key === 'ArrowUp') {
        setActive((current - 1 + items.length) % items.length);
        return true;
      }
      if (event.key === 'Enter' || event.key === 'Tab') {
        const item = items[current];
        if (item) command(item);
        return true;
      }
      return false;
    },
  }));

  return (
    <div
      id={listId}
      role="listbox"
      aria-label={t('notes.slash.aria')}
      className="z-50 max-h-72 w-60 overflow-auto rounded-md border border-border bg-surface p-1 text-sm text-text shadow-md"
    >
      {items.length === 0 ? (
        <p className="px-2 py-1.5 text-muted">{t('notes.slash.empty')}</p>
      ) : (
        items.map((item, i) => (
          <div
            key={item.id}
            id={optionId(listId, i)}
            role="option"
            aria-selected={i === current}
            onMouseEnter={() => setActive(i)}
            onMouseDown={(e) => {
              e.preventDefault();
              command(item);
            }}
            className={cn('cursor-default rounded px-2 py-1.5', i === current && 'bg-border/70')}
          >
            {t(item.label)}
          </div>
        ))
      )}
    </div>
  );
});

let counter = 0;

/** Gõ `/` ở đầu dòng hoặc sau khoảng trắng để mở menu chèn khối. */
export function createSlashExtension(t: TFunction) {
  return Extension.create({
    name: 'slashCommand',
    addProseMirrorPlugins() {
      return [
        Suggestion<SlashItem, SlashItem>({
          editor: this.editor as Editor,
          pluginKey: new PluginKey('slashCommand'),
          char: '/',
          allowedPrefixes: [' '],
          items: ({ query }) => filterSlashItems(SLASH_ITEMS, query, t),
          command: ({ editor, range, props }) => props.run(editor, range),
          render: () => {
            let renderer: ReactRenderer<ListHandle, ListProps> | undefined;
            const close = () => {
              renderer?.destroy();
              renderer?.element.remove();
              renderer = undefined;
            };
            const place = (p: SuggestionProps<SlashItem, SlashItem>) => {
              const rect = p.clientRect?.();
              const el = renderer?.element;
              if (!rect || !el) return;
              el.style.position = 'fixed';
              el.style.left = `${Math.min(rect.left, window.innerWidth - 250)}px`;
              el.style.top = `${rect.bottom + 6}px`;
              el.style.zIndex = '60';
            };
            return {
              onStart: (p) => {
                counter += 1;
                renderer = new ReactRenderer(SlashList, {
                  props: { ...p, t, listId: `slash-${counter}` },
                  editor: p.editor,
                });
                document.body.appendChild(renderer.element);
                place(p);
              },
              onUpdate: (p) => {
                renderer?.updateProps({ ...p, t });
                place(p);
              },
              onKeyDown: (p) => {
                if (p.event.key === 'Escape') {
                  close();
                  return true;
                }
                return renderer?.ref?.onKeyDown(p) ?? false;
              },
              onExit: close,
            };
          },
        }),
      ];
    },
  });
}
