import type { ReactNode } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { CheckSquare, Inbox, PanelLeftClose, PanelLeftOpen, Settings, Trash2 } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useT } from '@/lib/i18n';
import { useInboxOpen } from '@/modules/inbox/hooks';
import { useAreas } from '@/modules/tasks/hooks';
import { cn } from '@/lib/utils';
import { useUiStore } from './ui-store';

function NavItem({
  to,
  icon,
  label,
  badge,
  collapsed,
}: {
  to: string;
  icon: ReactNode;
  label: string;
  badge?: number | undefined;
  collapsed: boolean;
}) {
  const link = (
    <NavLink
      to={to}
      aria-label={collapsed && badge ? `${label} (${badge})` : label}
      className={({ isActive }) =>
        cn(
          'flex h-9 items-center gap-3 rounded-md px-2.5 text-text hover:bg-border/60',
          isActive && 'bg-border/80 font-medium',
          collapsed && 'justify-center px-0',
        )
      }
    >
      <span className="relative shrink-0 [&_svg]:size-[18px]">
        {icon}
        {collapsed && badge ? (
          <span aria-hidden className="absolute -top-0.5 -right-1 size-2 rounded-full bg-primary" />
        ) : null}
      </span>
      {!collapsed && (
        <>
          <span className="flex-1 truncate">{label}</span>
          {badge ? (
            <span className="rounded-full bg-primary px-1.5 text-xs font-medium text-primary-fg">
              {badge}
            </span>
          ) : null}
        </>
      )}
    </NavLink>
  );
  if (!collapsed) return link;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{link}</TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  );
}

// v0.1 chỉ hiện Inbox và Settings (spec 4.2: không tạo menu chết).
export function Sidebar() {
  const t = useT();
  const collapsed = useUiStore((s) => s.sidebarCollapsed);
  const toggle = useUiStore((s) => s.toggleSidebar);
  const { data } = useInboxOpen();
  const { data: areas = [] } = useAreas();
  const toggleLabel = collapsed ? t('nav.expand') : t('nav.collapse');

  return (
    <aside
      className={cn(
        'flex shrink-0 flex-col gap-1 border-r border-border bg-sidebar p-2 transition-[width] duration-150',
        collapsed ? 'w-14' : 'w-48',
      )}
    >
      <nav aria-label={t('nav.main')} className="flex flex-1 flex-col gap-1">
        <NavItem
          to="/inbox"
          icon={<Inbox />}
          label={t('nav.inbox')}
          badge={data?.length || undefined}
          collapsed={collapsed}
        />
        <NavItem to="/tasks" icon={<CheckSquare />} label={t('nav.tasks')} collapsed={collapsed} />
        {areas.length > 0 && (
          <div className="mt-3">
            {!collapsed && (
              <h2 className="px-2.5 pb-1 text-xs font-medium text-muted">{t('nav.areas')}</h2>
            )}
            <ul className="space-y-0.5">
              {areas.map((a) => (
                <li key={a.id}>
                  <Link
                    to={`/tasks?area=${a.id}`}
                    aria-label={collapsed ? a.name : undefined}
                    title={collapsed ? a.name : undefined}
                    className={cn(
                      'flex h-8 items-center gap-3 rounded-md px-2.5 text-text hover:bg-border/60',
                      collapsed && 'justify-center px-0',
                    )}
                  >
                    <span
                      aria-hidden
                      className="size-3 shrink-0 rounded-full border border-border"
                      style={{ background: a.color ?? 'transparent' }}
                    />
                    {!collapsed && <span className="truncate">{a.name}</span>}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
        <div className="mt-auto space-y-1">
          <NavItem to="/trash" icon={<Trash2 />} label={t('nav.trash')} collapsed={collapsed} />
          <NavItem
            to="/settings"
            icon={<Settings />}
            label={t('nav.settings')}
            collapsed={collapsed}
          />
        </div>
      </nav>
      <button
        type="button"
        aria-label={toggleLabel}
        aria-expanded={!collapsed}
        onClick={toggle}
        className={cn(
          'flex h-9 items-center gap-3 rounded-md px-2.5 text-muted hover:bg-border/60 hover:text-text',
          collapsed && 'justify-center px-0',
        )}
      >
        {collapsed ? (
          <PanelLeftOpen className="size-[18px]" />
        ) : (
          <PanelLeftClose className="size-[18px]" />
        )}
        {!collapsed && <span>{toggleLabel}</span>}
      </button>
    </aside>
  );
}
