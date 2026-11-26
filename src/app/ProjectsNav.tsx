import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Archive, GripVertical, Plus } from 'lucide-react';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from '@/components/ui/menus';
import { useT } from '@/lib/i18n';
import type { Project } from '@/lib/ipc/contract';
import { cn } from '@/lib/utils';
import { useProjects, useReorderProject } from '@/modules/projects/hooks';
import { ProjectIcon } from '@/modules/projects/icons';
import { RenameProjectDialog, RetireProjectDialog } from '@/modules/projects/ProjectDialogs';
import { computeReorder } from '@/modules/projects/reorder';
import { useUiStore } from './ui-store';

type Actions = {
  onRename: (p: Project) => void;
  onArchive: (p: Project) => void;
  onDelete: (p: Project) => void;
};

function ProjectItem({
  project,
  collapsed,
  actions,
}: {
  project: Project;
  collapsed: boolean;
  actions: Actions;
}) {
  const t = useT();
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: project.id });
  const link = (
    <NavLink
      to={`/projects/${project.id}`}
      aria-label={collapsed ? project.name : undefined}
      title={collapsed ? project.name : undefined}
      className={({ isActive }) =>
        cn(
          'flex h-8 min-w-0 items-center gap-3 rounded-md px-2.5 text-text hover:bg-border/60',
          isActive && 'bg-border/80 font-medium',
          collapsed && 'justify-center px-0',
        )
      }
    >
      <ProjectIcon icon={project.icon} color={project.color} />
      {!collapsed && <span className="truncate">{project.name}</span>}
    </NavLink>
  );
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn('group flex min-w-0 items-center', isDragging && 'z-10 opacity-80')}
    >
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <div className="min-w-0 flex-1">{link}</div>
        </ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuItem onSelect={() => actions.onRename(project)}>
            {t('proj.rename')}
          </ContextMenuItem>
          <ContextMenuItem onSelect={() => actions.onArchive(project)}>
            {t('proj.archive')}
          </ContextMenuItem>
          <ContextMenuItem onSelect={() => actions.onDelete(project)}>
            {t('proj.delete')}
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
      {!collapsed && (
        <button
          type="button"
          ref={setActivatorNodeRef}
          aria-label={t('proj.drag', { name: project.name })}
          className="-ml-1 cursor-grab touch-none rounded p-0.5 text-muted opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="size-3.5" />
        </button>
      )}
    </li>
  );
}

/** Nhóm "Dự án" ở sidebar: danh sách kéo thả sắp xếp được (chuột và bàn phím), nút "+", link Đã lưu trữ. */
export function ProjectsNav({ collapsed }: { collapsed: boolean }) {
  const t = useT();
  const { data: projects = [] } = useProjects(false);
  const reorder = useReorderProject();
  const setCreateOpen = useUiStore((s) => s.setCreateProjectOpen);
  const [renaming, setRenaming] = useState<Project | null>(null);
  const [retiring, setRetiring] = useState<{ project: Project; kind: 'archive' | 'delete' } | null>(
    null,
  );
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function onDragEnd({ active, over }: DragEndEvent) {
    if (!over) return;
    const target = computeReorder(projects, String(active.id), String(over.id));
    if (!target) return;
    const { next, beforeId, afterId } = target;
    reorder.mutate({
      id: String(active.id),
      next,
      ...(beforeId ? { beforeId } : {}),
      ...(afterId ? { afterId } : {}),
    });
  }

  return (
    <div className="mt-3">
      <div className={cn('flex items-center px-2.5 pb-1', collapsed && 'justify-center px-0')}>
        {!collapsed && (
          <h2 className="flex-1 text-xs font-medium text-muted">{t('nav.projects')}</h2>
        )}
        <button
          type="button"
          aria-label={t('nav.newProject')}
          title={t('nav.newProject')}
          onClick={() => setCreateOpen(true)}
          className="rounded p-0.5 text-muted hover:bg-border/60 hover:text-text"
        >
          <Plus className="size-4" />
        </button>
      </div>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={onDragEnd}
        accessibility={{ screenReaderInstructions: { draggable: t('proj.dragHint') } }}
      >
        <SortableContext items={projects.map((p) => p.id)} strategy={verticalListSortingStrategy}>
          <ul className="space-y-0.5">
            {projects.map((p) => (
              <ProjectItem
                key={p.id}
                project={p}
                collapsed={collapsed}
                actions={{
                  onRename: setRenaming,
                  onArchive: (project) => setRetiring({ project, kind: 'archive' }),
                  onDelete: (project) => setRetiring({ project, kind: 'delete' }),
                }}
              />
            ))}
          </ul>
        </SortableContext>
      </DndContext>
      {!collapsed && projects.length === 0 && (
        <p className="px-2.5 py-1 text-xs text-muted">{t('proj.projectsEmpty')}</p>
      )}
      <NavLink
        to="/projects/archived"
        aria-label={collapsed ? t('nav.archivedProjects') : undefined}
        title={collapsed ? t('nav.archivedProjects') : undefined}
        className={({ isActive }) =>
          cn(
            'mt-0.5 flex h-8 items-center gap-3 rounded-md px-2.5 text-muted hover:bg-border/60 hover:text-text',
            isActive && 'bg-border/80 text-text',
            collapsed && 'justify-center px-0',
          )
        }
      >
        <Archive className="size-4" aria-hidden />
        {!collapsed && <span>{t('nav.archivedProjects')}</span>}
      </NavLink>

      <RenameProjectDialog project={renaming} onClose={() => setRenaming(null)} />
      <RetireProjectDialog
        key={retiring ? `${retiring.kind}-${retiring.project.id}` : 'none'}
        project={retiring?.project ?? null}
        kind={retiring?.kind ?? 'archive'}
        onClose={() => setRetiring(null)}
      />
    </div>
  );
}
