import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Card } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { errorMessage, shortcutRegister } from '@/lib/ipc/commands';
import type { AppSettings } from '@/lib/ipc/contract';
import { useT } from '@/lib/i18n';
import { SETTINGS_KEY, useUpdateSettings } from './hooks';
import { SettingsRow } from './SettingsRow';
import { ShortcutRecorder } from './ShortcutRecorder';

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
