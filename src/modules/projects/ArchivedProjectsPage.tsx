import { Link } from 'react-router-dom';
import { Archive } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState, ErrorState } from '@/components/ui/empty-state';
import { LoadingBlock } from '@/components/ui/skeleton';
import { useT } from '@/lib/i18n';
import { errorMessage } from '@/lib/ipc/commands';
import { useProjects, useUnarchiveProject } from './hooks';
import { ProjectIcon } from './icons';

/** Danh sách Project đã lưu trữ, có nút Khôi phục (khôi phục cả các Task cùng mốc lưu trữ). */
export function ArchivedProjectsPage() {
  const t = useT();
  const { data, isLoading, error, refetch } = useProjects(true);
  const unarchive = useUnarchiveProject();

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
    body = <EmptyState icon={<Archive />} title={t('proj.archivedEmpty')} />;
  else
    body = (
      <ul className="divide-y divide-border rounded-lg border border-border">
        {data.map((p) => (
          <li key={p.id} className="flex items-center gap-3 px-3 py-2">
            <ProjectIcon icon={p.icon} color={p.color} />
            <Link to={`/projects/${p.id}`} className="min-w-0 flex-1 truncate hover:underline">
              {p.name}
            </Link>
            <Button
              variant="secondary"
              size="sm"
              aria-label={`${t('proj.unarchive')}: ${p.name}`}
              disabled={unarchive.isPending}
              onClick={() => unarchive.mutate(p.id)}
            >
              {t('proj.unarchive')}
            </Button>
          </li>
        ))}
      </ul>
    );

  return (
    <div className="h-full overflow-auto p-6">
      <div className="mx-auto max-w-3xl space-y-4">
        <h1 className="text-xl font-semibold">{t('proj.archivedTitle')}</h1>
        {body}
      </div>
    </div>
  );
}
