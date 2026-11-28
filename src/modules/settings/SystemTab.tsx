import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Card } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { appInfo, errorMessage, shortcutRegister } from '@/lib/ipc/commands';
import type { AppSettings } from '@/lib/ipc/contract';
import { useT } from '@/lib/i18n';
import { realDeps } from '@/modules/updates/deps';
import { useUpdateStore } from '@/modules/updates/store';
import { SETTINGS_KEY, useUpdateSettings } from './hooks';
import { SettingsRow } from './SettingsRow';
import { ShortcutRecorder } from './ShortcutRecorder';

function VersionRow() {
  const t = useT();
  const info = useQuery({ queryKey: ['appinfo'], queryFn: appInfo, staleTime: Infinity });
  const { status, update, error, errorStage, check } = useUpdateStore();
  const checking = status === 'checking';
  const checkFailed = status === 'error' && errorStage === 'check';
  const show = () => useUpdateStore.setState({ dismissed: false });
  return (
    <SettingsRow id="set-version" label={t('system.version')} hint={info.data?.version ?? '…'}>
      <div className="flex flex-col items-end gap-1">
        <div className="flex items-center gap-2">
          {status === 'available' ? (
            <Button size="sm" onClick={show}>
              {t('system.updateViewButton')}
            </Button>
          ) : null}
          <Button
            id="set-version"
            variant="secondary"
            size="sm"
            disabled={checking || status === 'installing'}
            onClick={() => void check(realDeps)}
          >
            {checking
              ? t('system.checking')
              : checkFailed
                ? t('common.retry')
                : t('system.checkUpdate')}
          </Button>
        </div>
        <p role="status" aria-live="polite" className="text-xs text-muted">
          {status === 'none' ? t('system.upToDate') : null}
          {status === 'available' && update
            ? t('system.updateAvailable', { version: update.version })
            : null}
        </p>
        {checkFailed ? (
          <p role="alert" className="text-xs text-danger">
            {t('system.updateError', { reason: error ?? '' })}
          </p>
        ) : null}
      </div>
    </SettingsRow>
  );
}

export function SystemTab({ settings }: { settings: AppSettings }) {
  const t = useT();
  const qc = useQueryClient();
  const update = useUpdateSettings(t('settings.saveError'));
  // Lỗi (CONFLICT…) hiện ngay dưới ô và phím cũ được giữ nguyên (không đụng cache).
  const register = useMutation({
    mutationFn: (accelerator: string) => shortcutRegister(accelerator),
    onSuccess: (data) => qc.setQueryData(SETTINGS_KEY, data),
  });

  return (
    <Card className="divide-y divide-border py-1">
      <VersionRow />
      <SettingsRow id="set-shortcut" label={t('system.shortcut')} hint={t('system.shortcutHint')}>
        <ShortcutRecorder
          id="set-shortcut"
          value={settings.quickCaptureShortcut}
          pending={register.isPending}
          error={register.isError ? errorMessage(register.error) : null}
          describedBy="set-shortcut-hint"
          onRecord={(accelerator) => register.mutate(accelerator)}
        />
      </SettingsRow>
      <SettingsRow id="set-startup" label={t('system.launchAtStartup')}>
        <Switch
          id="set-startup"
          checked={settings.launchAtStartup}
          onCheckedChange={(launchAtStartup) =>
            update.mutate(
              launchAtStartup ? { launchAtStartup } : { launchAtStartup, startHidden: false },
            )
          }
        />
      </SettingsRow>
      <SettingsRow
        id="set-hidden"
        label={t('system.startHidden')}
        hint={settings.launchAtStartup ? undefined : t('system.startHiddenHint')}
      >
        <Switch
          id="set-hidden"
          aria-describedby={settings.launchAtStartup ? undefined : 'set-hidden-hint'}
          checked={settings.startHidden}
          disabled={!settings.launchAtStartup}
          onCheckedChange={(startHidden) => update.mutate({ startHidden })}
        />
      </SettingsRow>
      <SettingsRow id="set-tray" label={t('system.closeToTray')}>
        <Switch
          id="set-tray"
          checked={settings.closeToTray}
          onCheckedChange={(closeToTray) => update.mutate({ closeToTray })}
        />
      </SettingsRow>
    </Card>
  );
}
