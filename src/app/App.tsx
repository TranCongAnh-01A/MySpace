import { BrowserRouter } from 'react-router-dom';
import { Providers } from './providers';
import { AppRoutes } from './router';
import { TitleBar } from './TitleBar';

export function App() {
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
