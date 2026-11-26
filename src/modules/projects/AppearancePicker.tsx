import { Check } from 'lucide-react';
import { useT } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { AREA_COLORS } from '@/modules/settings/areaColors';
import { PROJECT_ICON_NAMES, PROJECT_ICONS } from './icons';

/** Chọn màu (8 màu token) và icon (16 icon lucide). Bấm lại mục đang chọn thì bỏ chọn. */
export function AppearancePicker({
  color,
  icon,
  onColor,
  onIcon,
}: {
  color: string | undefined;
  icon: string | undefined;
  onColor: (v: string | undefined) => void;
  onIcon: (v: string | undefined) => void;
}) {
  const t = useT();
  return (
    <div className="space-y-3">
      <fieldset className="space-y-1.5">
        <legend className="text-sm font-medium">{t('proj.color')}</legend>
        <div className="flex flex-wrap gap-2">
          {AREA_COLORS.map((c) => {
            const on = color?.toLowerCase() === c.hex.toLowerCase();
            return (
              <button
                key={c.hex}
                type="button"
                aria-pressed={on}
                aria-label={t(c.name)}
                title={t(c.name)}
                onClick={() => onColor(on ? undefined : c.hex)}
                className={cn(
                  'flex size-7 items-center justify-center rounded-full border-2',
                  on ? 'border-text' : 'border-transparent',
                )}
                style={{ background: c.hex }}
              >
                {on && <Check className="size-4 text-bg" aria-hidden />}
              </button>
            );
          })}
        </div>
      </fieldset>
      <fieldset className="space-y-1.5">
        <legend className="text-sm font-medium">{t('proj.icon')}</legend>
        <div className="flex flex-wrap gap-1.5">
          {PROJECT_ICON_NAMES.map((name) => {
            const Icon = PROJECT_ICONS[name];
            const on = icon === name;
            if (!Icon) return null;
            return (
              <button
                key={name}
                type="button"
                aria-pressed={on}
                aria-label={t('proj.icon.pick', { name })}
                title={name}
                onClick={() => onIcon(on ? undefined : name)}
                className={cn(
                  'flex size-8 items-center justify-center rounded-md border',
                  on
                    ? 'border-primary bg-primary/15 text-text'
                    : 'border-border text-muted hover:bg-border/60',
                )}
              >
                <Icon className="size-4" aria-hidden />
              </button>
            );
          })}
        </div>
      </fieldset>
    </div>
  );
}
