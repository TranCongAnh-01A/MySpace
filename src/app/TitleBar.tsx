import { Minus, Plus, Search, Square, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Kbd } from '@/components/ui/kbd';
import { useT } from '@/lib/i18n';
import { appWindow } from '@/lib/tauri';
import { cn } from '@/lib/utils';
import { useUiStore } from './ui-store';

const winBtn = 'inline-flex h-full w-11 items-center justify-center text-text hover:bg-border/70';

export function TitleBar() {
  const t = useT();
  const setQuickAddOpen = useUiStore((s) => s.setQuickAddOpen);
  const setPaletteOpen = useUiStore((s) => s.setPaletteOpen);
  return (
    <header className="flex h-10 shrink-0 items-center border-b border-border bg-sidebar select-none">
      <div
        data-tauri-drag-region
        translate="no"
        className="flex h-full w-48 items-center px-3 font-semibold"
      >
        {t('app.name')}
      </div>
      <div data-tauri-drag-region className="flex h-full flex-1 items-center justify-center">
        <button
          type="button"
          aria-label={t('titlebar.search')}
          onClick={() => setPaletteOpen(true)}
          className="flex h-7 w-80 max-w-full items-center gap-2 rounded-md border border-border bg-bg px-2 text-muted hover:text-text"
        >
          <Search className="size-4" />
          <span className="flex-1 text-left">{t('titlebar.search')}</span>
          <Kbd>Ctrl+K</Kbd>
        </button>
      </div>
      <Button size="sm" className="mr-3 h-7" onClick={() => setQuickAddOpen(true)}>
        <Plus />
        {t('titlebar.quickAdd')}
      </Button>
      <div className="flex h-full">
        <button
          type="button"
          aria-label={t('titlebar.minimize')}
          className={winBtn}
          onClick={() => void appWindow.minimize()}
        >
          <Minus className="size-4" />
        </button>
        <button
          type="button"
          aria-label={t('titlebar.maximize')}
          className={winBtn}
          onClick={() => void appWindow.toggleMaximize()}
        >
          <Square className="size-3.5" />
        </button>
        <button
          type="button"
          aria-label={t('titlebar.closeWindow')}
          className={cn(winBtn, 'hover:bg-[#c42b1c] hover:text-white')}
          onClick={() => void appWindow.close()}
        >
          <X className="size-4" />
        </button>
      </div>
    </header>
  );
}
