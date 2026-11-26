import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Command } from 'cmdk';
import {
  CalendarCheck,
  CheckSquare,
  Inbox,
  Plus,
  Settings,
  Trash2,
  type LucideIcon,
} from 'lucide-react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { foldText } from '@/lib/format/text';
import { useT, type TKey } from '@/lib/i18n';
import { search } from '@/lib/ipc/commands';
import { useProjects } from '@/modules/projects/hooks';
import { ProjectIcon } from '@/modules/projects/icons';
import { useUiStore } from '../ui-store';

const itemCls =
  'flex cursor-default items-center gap-2 rounded px-2 py-2 text-sm text-text data-[selected=true]:bg-border/70 [&_svg]:size-4 [&_svg]:text-muted';

type Cmd = { id: string; label: TKey; icon: LucideIcon; run: () => void };

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = window.setTimeout(() => setV(value), ms);
    return () => window.clearTimeout(id);
  }, [value, ms]);
  return v;
}

function PaletteBody({ onClose }: { onClose: () => void }) {
  const t = useT();
  const navigate = useNavigate();
  const setCreateTaskOpen = useUiStore((s) => s.setCreateTaskOpen);
  const setQuickAddOpen = useUiStore((s) => s.setQuickAddOpen);
  const setCreateProjectOpen = useUiStore((s) => s.setCreateProjectOpen);
  const { data: projects = [] } = useProjects(false);
  const [query, setQuery] = useState('');
  const debounced = useDebounced(query.trim(), 150);
  const { data: hits = [] } = useQuery({
    queryKey: ['search', debounced, ['Task', 'Project', 'Inbox']],
    queryFn: () => search(debounced, ['Task', 'Project', 'Inbox'], 20),
    enabled: debounced.length > 0,
  });

  const go = (to: string) => () => void navigate(to);
  const goto: Cmd[] = [
    { id: 'today', label: 'nav.today', icon: CalendarCheck, run: go('/today') },
    { id: 'inbox', label: 'nav.inbox', icon: Inbox, run: go('/inbox') },
    { id: 'tasks', label: 'nav.tasks', icon: CheckSquare, run: go('/tasks') },
    { id: 'trash', label: 'nav.trash', icon: Trash2, run: go('/trash') },
    { id: 'settings', label: 'nav.settings', icon: Settings, run: go('/settings') },
  ];
  const create: Cmd[] = [
    { id: 'new-task', label: 'palette.newTask', icon: Plus, run: () => setCreateTaskOpen(true) },
    {
      id: 'new-project',
      label: 'palette.newProject',
      icon: Plus,
      run: () => setCreateProjectOpen(true),
    },
    {
      id: 'new-inbox',
      label: 'palette.captureInbox',
      icon: Plus,
      run: () => setQuickAddOpen(true),
    },
  ];
  const q = foldText(query);
  const visible = (list: Cmd[]) => list.filter((c) => !q || foldText(t(c.label)).includes(q));
  const run = (fn: () => void) => () => {
    onClose();
    fn();
  };

  const taskHits = hits.filter((h) => h.kind === 'Task');
  const inboxHits = hits.filter((h) => h.kind === 'Inbox');
  const projectHits = hits.filter((h) => h.kind === 'Project');
  const gotoProjects = projects.filter((p) => q && foldText(p.name).includes(q)).slice(0, 5);
  const groupCls =
    '[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:text-muted';

  return (
    <Command shouldFilter={false} label={t('palette.title')} loop>
      <Command.Input
        autoFocus
        value={query}
        onValueChange={setQuery}
        placeholder={t('palette.placeholder')}
        className="h-12 w-full border-b border-border bg-transparent px-4 text-sm text-text outline-none placeholder:text-muted"
      />
      <Command.List className="max-h-80 overflow-auto p-2">
        <Command.Empty className="px-3 py-6 text-center text-muted">
          {t('palette.empty')}
        </Command.Empty>
        {taskHits.length > 0 && (
          <Command.Group
            heading={t('palette.tasks')}
            className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:text-muted"
          >
            {taskHits.map((h) => (
              <Command.Item
                key={`t-${h.id}`}
                value={`task-${h.id}`}
                onSelect={run(() => void navigate(`/tasks/${h.id}`))}
                className={itemCls}
              >
                <CheckSquare aria-hidden />
                <span className="truncate">{h.title}</span>
              </Command.Item>
            ))}
          </Command.Group>
        )}
        {projectHits.length > 0 && (
          <Command.Group heading={t('palette.projects')} className={groupCls}>
            {projectHits.map((h) => (
              <Command.Item
                key={`p-${h.id}`}
                value={`project-${h.id}`}
                onSelect={run(() => void navigate(`/projects/${h.id}`))}
                className={itemCls}
              >
                <ProjectIcon
                  icon={projects.find((p) => p.id === h.id)?.icon}
                  color={projects.find((p) => p.id === h.id)?.color}
                />
                <span className="truncate">{h.title}</span>
              </Command.Item>
            ))}
          </Command.Group>
        )}
        {gotoProjects.length > 0 && (
          <Command.Group heading={t('palette.gotoProject')} className={groupCls}>
            {gotoProjects.map((p) => (
              <Command.Item
                key={`gp-${p.id}`}
                value={`goproject-${p.id}`}
                onSelect={run(() => void navigate(`/projects/${p.id}`))}
                className={itemCls}
              >
                <ProjectIcon icon={p.icon} color={p.color} />
                <span className="truncate">{p.name}</span>
              </Command.Item>
            ))}
          </Command.Group>
        )}
        {inboxHits.length > 0 && (
          <Command.Group
            heading={t('palette.inbox')}
            className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:text-muted"
          >
            {inboxHits.map((h) => (
              <Command.Item
                key={`i-${h.id}`}
                value={`inbox-${h.id}`}
                onSelect={run(() => void navigate(`/inbox?item=${h.id}`))}
                className={itemCls}
              >
                <Inbox aria-hidden />
                <span className="truncate">{h.title}</span>
              </Command.Item>
            ))}
          </Command.Group>
        )}
        {visible(goto).length > 0 && (
          <Command.Group
            heading={t('palette.goto')}
            className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:text-muted"
          >
            {visible(goto).map((c) => (
              <Command.Item
                key={c.id}
                value={`go-${c.id}`}
                onSelect={run(c.run)}
                className={itemCls}
              >
                <c.icon aria-hidden />
                {t(c.label)}
              </Command.Item>
            ))}
          </Command.Group>
        )}
        {visible(create).length > 0 && (
          <Command.Group
            heading={t('palette.create')}
            className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:text-muted"
          >
            {visible(create).map((c) => (
              <Command.Item
                key={c.id}
                value={`new-${c.id}`}
                onSelect={run(c.run)}
                className={itemCls}
              >
                <c.icon aria-hidden />
                {t(c.label)}
              </Command.Item>
            ))}
          </Command.Group>
        )}
      </Command.List>
    </Command>
  );
}

/** Command Palette (`Ctrl+K`): tìm Task/Dự án/Inbox qua `search`, kèm nhóm "Đi tới" và "Tạo". */
export function CommandPalette() {
  const t = useT();
  const open = useUiStore((s) => s.paletteOpen);
  const setOpen = useUiStore((s) => s.setPaletteOpen);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="top-[20%] max-w-xl translate-y-0 p-0">
        <DialogTitle className="sr-only">{t('palette.title')}</DialogTitle>
        <PaletteBody onClose={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}
