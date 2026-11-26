import { Card } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useT, type TFunction } from '@/lib/i18n';
import type { AppSettings } from '@/lib/ipc/contract';
import { useUpdateSettings } from './hooks';
import { SettingsRow } from './SettingsRow';

const REMINDERS = [0, 5, 10, 15, 30, 60, 1440];
const RETENTION = [7, 14, 30, 60, 90];

function reminderLabel(t: TFunction, minutes: number): string {
  if (minutes === 0) return t('notif.atTime');
  if (minutes === 60) return t('notif.hour');
  if (minutes === 1440) return t('notif.day');
  return t('notif.minutes', { n: minutes });
}

function NumberSelect({
  id,
  value,
  options,
  label,
  onChange,
}: {
  id: string;
  value: number;
  options: number[];
  label: (n: number) => string;
  onChange: (n: number) => void;
}) {
  // Giá trị hiện tại có thể nằm ngoài danh sách chuẩn (do core/phiên bản khác): vẫn hiện được.
  const all = options.includes(value) ? options : [...options, value].sort((a, b) => a - b);
  return (
    <Select value={String(value)} onValueChange={(v) => onChange(Number(v))}>
      <SelectTrigger id={id}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {all.map((n) => (
          <SelectItem key={n} value={String(n)}>
            {label(n)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function NotificationsTab({ settings }: { settings: AppSettings }) {
  const t = useT();
  const update = useUpdateSettings(t('settings.saveError'));
  return (
    <Card className="divide-y divide-border py-1">
      <SettingsRow id="set-notif" label={t('notif.enabled')}>
        <Switch
          id="set-notif"
          checked={settings.notificationsEnabled}
          onCheckedChange={(notificationsEnabled) => update.mutate({ notificationsEnabled })}
        />
      </SettingsRow>
      <SettingsRow id="set-reminder" label={t('notif.defaultReminder')}>
        <NumberSelect
          id="set-reminder"
          value={settings.defaultReminderMinutes}
          options={REMINDERS}
          label={(n) => reminderLabel(t, n)}
          onChange={(defaultReminderMinutes) => update.mutate({ defaultReminderMinutes })}
        />
      </SettingsRow>
      <SettingsRow id="set-trash" label={t('notif.trashRetention')}>
        <NumberSelect
          id="set-trash"
          value={settings.trashRetentionDays}
          options={RETENTION}
          label={(n) => t('notif.days', { n })}
          onChange={(trashRetentionDays) => update.mutate({ trashRetentionDays })}
        />
      </SettingsRow>
    </Card>
  );
}
