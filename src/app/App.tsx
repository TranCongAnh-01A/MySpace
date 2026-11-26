import { BrowserRouter } from 'react-router-dom';
import { Toaster } from '@/components/ui/sonner';
import { useTheme } from '@/lib/theme/theme';
import { useSettings } from '@/modules/settings/hooks';
import { useT } from '@/lib/i18n';
import { CommandPalette } from './command-palette/CommandPalette';
import { GlobalCreateTask } from './GlobalCreateTask';
import { Providers } from './providers';
import { QuickAddDialog } from './QuickAddDialog';
import { AppRoutes } from './router';
import { useAppShortcuts } from './shortcuts';
import { Sidebar } from './Sidebar';
import { TitleBar } from './TitleBar';
import { useEntityChangedInvalidation } from './useEntityChangedInvalidation';

function Shell() {
  useEntityChangedInvalidation();
  useAppShortcuts();
  const { data } = useSettings();
  useTheme(data?.theme);
  const t = useT(); // đồng thời cache ngôn ngữ + <html lang>
  return (
    <div className="flex h-full flex-col">
      <a
        href="#main"
        className="sr-only z-50 rounded-md bg-primary px-3 py-2 text-primary-fg focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        {t('nav.skip')}
      </a>
      <TitleBar />
      <div className="flex min-h-0 flex-1">
        <Sidebar />
        <main id="main" tabIndex={-1} className="min-w-0 flex-1 overflow-hidden outline-none">
          <AppRoutes />
        </main>
      </div>
      <QuickAddDialog />
      <GlobalCreateTask />
      <CommandPalette />
      <Toaster />
    </div>
  );
}

export function App() {
  return (
    <Providers>
      <BrowserRouter>
        <Shell />
      </BrowserRouter>
    </Providers>
  );
}
