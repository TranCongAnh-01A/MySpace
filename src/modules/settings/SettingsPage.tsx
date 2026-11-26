import type { ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ErrorState } from '@/components/ui/empty-state';
import { LoadingBlock } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { errorMessage } from '@/lib/ipc/commands';
import type { AppSettings } from '@/lib/ipc/contract';
import { useT, type TKey } from '@/lib/i18n';
import { AreasTab } from './AreasTab';
import { DataTab } from './DataTab';
import { GeneralTab } from './GeneralTab';
import { useSettings } from './hooks';
import { NotificationsTab } from './NotificationsTab';
import { SystemTab } from './SystemTab';

const TABS = ['general', 'system', 'notifications', 'areas', 'data'] as const;
type TabId = (typeof TABS)[number];
const isTab = (v: string | undefined): v is TabId => TABS.some((t) => t === v);

/** Loading / error state chung cho các tab đọc từ settings. */
function WithSettings({ children }: { children: (s: AppSettings) => ReactNode }) {
  const t = useT();
  const { data, isLoading, error, refetch } = useSettings();
  if (isLoading) return <LoadingBlock label={t('common.loading')} rows={5} />;
  if (error || !data) {
    return (
      <ErrorState
        title={t('common.loadError')}
        message={errorMessage(error)}
        retryLabel={t('common.retry')}
        onRetry={() => void refetch()}
      />
    );
  }
  return <>{children(data)}</>;
}

export function SettingsPage() {
  const t = useT();
  const navigate = useNavigate();
  const { tab } = useParams();
  const current: TabId = isTab(tab) ? tab : 'general';

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="mb-4 text-xl font-semibold">{t('settings.title')}</h1>
      <Tabs value={current} onValueChange={(v) => void navigate(`/settings/${v}`)}>
        <TabsList aria-label={t('settings.tabs')}>
          {TABS.map((id) => (
            <TabsTrigger key={id} value={id}>
              {t(`settings.tab.${id}` as TKey)}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="general">
          <WithSettings>{(s) => <GeneralTab settings={s} />}</WithSettings>
        </TabsContent>
        <TabsContent value="system">
          <WithSettings>{(s) => <SystemTab settings={s} />}</WithSettings>
        </TabsContent>
        <TabsContent value="notifications">
          <WithSettings>{(s) => <NotificationsTab settings={s} />}</WithSettings>
        </TabsContent>
        <TabsContent value="areas">
          <AreasTab />
        </TabsContent>
        <TabsContent value="data">
          <DataTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
