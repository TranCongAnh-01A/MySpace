import { useMemo } from 'react';
import { Card } from '@/components/ui/card';
import { Combobox } from '@/components/ui/combobox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useT, type TKey } from '@/lib/i18n';
import type { AppSettings, DateFormat, Language, Theme, WeekStart } from '@/lib/ipc/contract';
import { useUpdateSettings } from './hooks';
import { SettingsRow } from './SettingsRow';

const THEMES: Theme[] = ['System', 'Dark', 'Light'];
const LANGUAGES: Language[] = ['vi', 'en'];
const DATE_FORMATS: DateFormat[] = ['DD/MM/YYYY', 'YYYY-MM-DD', 'MM/DD/YYYY'];
const WEEK_STARTS: WeekStart[] = ['Mon', 'Sun'];

function timeZones(current: string): string[] {
  let list: string[] = [];
  try {
    list = Intl.supportedValuesOf('timeZone');
  } catch {
    /* môi trường cũ: chỉ còn múi giờ hiện tại */
  }
  return list.includes(current) ? list : [current, ...list];
}

function EnumSelect<T extends string>({
  id,
  value,
  options,
  label,
  onChange,
}: {
  id: string;
  value: T;
  options: readonly T[];
  label: (v: T) => string;
  onChange: (v: T) => void;
}) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as T)}>
      <SelectTrigger id={id}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o} value={o}>
            {label(o)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function GeneralTab({ settings }: { settings: AppSettings }) {
  const t = useT();
  const update = useUpdateSettings(t('settings.saveError'));
  const zones = useMemo(() => timeZones(settings.timezone), [settings.timezone]);

  return (
    <Card className="divide-y divide-border py-1">
      <SettingsRow id="set-theme" label={t('general.theme')}>
        <EnumSelect
          id="set-theme"
          value={settings.theme}
          options={THEMES}
          label={(v) => t(`general.theme.${v}` as TKey)}
          onChange={(theme) => update.mutate({ theme })}
        />
      </SettingsRow>
      <SettingsRow id="set-language" label={t('general.language')}>
        <EnumSelect
          id="set-language"
          value={settings.language}
          options={LANGUAGES}
          label={(v) => t(`general.language.${v}` as TKey)}
          onChange={(language) => update.mutate({ language })}
        />
      </SettingsRow>
      <SettingsRow id="set-timezone" label={t('general.timezone')}>
        <Combobox
          id="set-timezone"
          value={settings.timezone}
          options={zones}
          searchPlaceholder={t('general.timezoneSearch')}
          emptyText={t('general.timezoneEmpty')}
          onChange={(timezone) => update.mutate({ timezone })}
        />
      </SettingsRow>
      <SettingsRow id="set-dateformat" label={t('general.dateFormat')}>
        <EnumSelect
          id="set-dateformat"
          value={settings.dateFormat}
          options={DATE_FORMATS}
          label={(v) => v}
          onChange={(dateFormat) => update.mutate({ dateFormat })}
        />
      </SettingsRow>
      <SettingsRow id="set-weekstart" label={t('general.weekStart')}>
        <EnumSelect
          id="set-weekstart"
          value={settings.weekStart}
          options={WEEK_STARTS}
          label={(v) => t(`general.weekStart.${v}` as TKey)}
          onChange={(weekStart) => update.mutate({ weekStart })}
        />
      </SettingsRow>
    </Card>
  );
}
