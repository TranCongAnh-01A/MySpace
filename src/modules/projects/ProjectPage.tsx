import { useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { FolderKanban } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { EmptyState, ErrorState } from '@/components/ui/empty-state';
import { LoadingBlock } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useT, type TKey } from '@/lib/i18n';
import { errorCode, errorMessage } from '@/lib/ipc/commands';
import type { Project } from '@/lib/ipc/contract';
import { TaskDetailPanel } from '@/modules/tasks/TaskDetailPanel';
import { TasksWorkspace } from '@/modules/tasks/TasksPage';
import { useAreas } from '@/modules/tasks/hooks';
import { useProjectOverview, useUpdateProject } from './hooks';
import { ProjectIcon } from './icons';
import { ProjectOverviewTab } from './ProjectOverviewTab';
import { ProjectSettingsTab } from './ProjectSettingsTab';

export const PROJECT_TABS = ['overview', 'tasks', 'board', 'settings'] as const;
export type ProjectTab = (typeof PROJECT_TABS)[number];
const isTab = (v: string | undefined): v is ProjectTab => PROJECT_TABS.some((x) => x === v);

/** Tên dự án sửa tại chỗ: bấm vào để sửa, Enter lưu, Esc huỷ. */
function EditableName({ project }: { project: Project }) {
  const t = useT();
  const update = useUpdateProject(project);
  const [draft, setDraft] = useState<string | null>(null);
  if (draft === null)
    return (
      <h1 className="min-w-0 text-xl font-semibold">
        <button
          type="button"
          title={t('proj.rename')}
          onClick={() => setDraft(project.name)}
          className="max-w-full truncate rounded px-1 text-left hover:bg-border/60"
        >
          {project.name}
        </button>
      </h1>
    );
  const commit = () => {
    const name = draft.trim();
    setDraft(null);
    if (name && name !== project.name) update.mutate({ name });
  };
  return (
    <input
      autoFocus
      aria-label={t('proj.nameLabel')}
      value={draft}
      maxLength={100}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit();
        if (e.key === 'Escape') setDraft(null);
      }}
      className="h-9 min-w-0 flex-1 rounded-md border border-border bg-bg px-2 text-xl font-semibold"
    />
  );
}

function Header({ project }: { project: Project }) {
  const t = useT();
  const { data: areas = [] } = useAreas();
  const area = areas.find((a) => a.id === project.areaId);
  return (
    <div className="flex flex-wrap items-center gap-3">
      <ProjectIcon icon={project.icon} color={project.color} className="size-6" />
      <EditableName key={project.version} project={project} />
      <Badge>{t(`proj.status.${project.status}` as TKey)}</Badge>
      {area && (
        <span className="inline-flex items-center gap-1.5 text-sm text-muted">
          <span
            aria-hidden
            className="size-2.5 rounded-full"
            style={{ background: area.color ?? 'transparent' }}
          />
          {area.name}
        </span>
      )}
    </div>
  );
}

export function ProjectPage() {
  const t = useT();
  const navigate = useNavigate();
  const { id, tab: tabParam } = useParams();
  const [sp, setSp] = useSearchParams();
  const tab: ProjectTab = isTab(tabParam) ? tabParam : 'overview';
  const { data, isLoading, error, refetch } = useProjectOverview(id);
  const openTask = sp.get('task') ?? undefined;
  const setTask = (taskId: string | undefined) => {
    const next = new URLSearchParams(sp);
    if (taskId) next.set('task', taskId);
    else next.delete('task');
    setSp(next, { replace: true });
  };

  if (isLoading)
    return (
      <div className="p-6">
        <LoadingBlock label={t('common.loading')} rows={5} />
      </div>
    );
  if (errorCode(error) === 'NOT_FOUND')
    return (
      <div className="p-6">
        <EmptyState
          icon={<FolderKanban />}
          title={t('proj.notFound')}
          hint={t('proj.notFoundHint')}
          action={
            <Link className="text-primary underline" to="/today">
              {t('nav.today')}
            </Link>
          }
        />
      </div>
    );
  if (error || !data)
    return (
      <div className="p-6">
        <ErrorState
          title={t('common.loadError')}
          message={errorMessage(error)}
          retryLabel={t('common.retry')}
          onRetry={() => void refetch()}
        />
      </div>
    );

  const { project } = data;
  const tabs = PROJECT_TABS.map((v) => ({ value: v, label: t(`proj.tab.${v}` as TKey) }));
  const go = (v: string) => void navigate(`/projects/${project.id}/${v}`);

  return (
    <div className="flex h-full min-w-0">
      <div className="flex min-w-0 flex-1 flex-col gap-4 overflow-auto p-6">
        <Header project={project} />
        <Tabs value={tab} onValueChange={go} className="flex min-h-0 flex-1 flex-col">
          <TabsList aria-label={t('proj.tabs')}>
            {tabs.map((x) => (
              <TabsTrigger key={x.value} value={x.value}>
                {x.label}
              </TabsTrigger>
            ))}
          </TabsList>
          <TabsContent value="overview">
            <ProjectOverviewTab overview={data} onOpenTask={(tid) => setTask(tid)} />
          </TabsContent>
          <TabsContent value="tasks" className="flex min-h-0 flex-1 flex-col">
            <TasksWorkspace
              projectId={project.id}
              forcedView="list"
              openId={openTask}
              onOpen={setTask}
              onClose={() => setTask(undefined)}
              heading={<h2 className="text-lg font-semibold">{t('proj.tab.tasks')}</h2>}
            />
          </TabsContent>
          <TabsContent value="board" className="flex min-h-0 flex-1 flex-col">
            <TasksWorkspace
              projectId={project.id}
              forcedView="board"
              openId={openTask}
              onOpen={setTask}
              onClose={() => setTask(undefined)}
              heading={<h2 className="text-lg font-semibold">{t('proj.tab.board')}</h2>}
            />
          </TabsContent>
          <TabsContent value="settings">
            <ProjectSettingsTab project={project} />
          </TabsContent>
        </Tabs>
      </div>
      {openTask && tab === 'overview' && (
        <TaskDetailPanel key={openTask} id={openTask} onClose={() => setTask(undefined)} />
      )}
    </div>
  );
}
