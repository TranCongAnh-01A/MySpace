import { useEffect } from 'react';
import { BrowserRouter } from 'react-router-dom';
import { appQuit } from '../lib/ipc/commands';
import { Providers } from './providers';
import { AppRoutes } from './router';
import { TitleBar } from './TitleBar';

export function App() {
  // Ctrl+Q thoát hẳn (đóng cửa sổ chỉ ẩn xuống khay).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key.toLowerCase() === 'q') {
        e.preventDefault();
        void appQuit();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <Providers>
      <BrowserRouter>
        <div className="flex h-full flex-col">
          <TitleBar />
          <main className="min-h-0 flex-1 overflow-auto p-4">
            <AppRoutes />
          </main>
        </div>
      </BrowserRouter>
    </Providers>
  );
}
