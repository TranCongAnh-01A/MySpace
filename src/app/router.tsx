import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { LoadingBlock } from '@/components/ui/skeleton';
import { useT } from '@/lib/i18n';
import { InboxPage } from '@/modules/inbox/InboxPage';
import { ArchivedProjectsPage } from '@/modules/projects/ArchivedProjectsPage';
import { ProjectPage } from '@/modules/projects/ProjectPage';
import { SettingsPage } from '@/modules/settings/SettingsPage';
import { TasksPage } from '@/modules/tasks/TasksPage';
import { TodayPage } from '@/modules/today/TodayPage';
import { TrashPage } from '@/modules/trash/TrashPage';

// Calendar kéo theo FullCalendar, Notes kéo theo Tiptap + lowlight (nặng): tải khi mở lần đầu.
const CalendarPage = lazy(() =>
  import('@/modules/calendar/CalendarPage').then((m) => ({ default: m.CalendarPage })),
);
const NotesPage = lazy(() =>
  import('@/modules/notes/NotesPage').then((m) => ({ default: m.NotesPage })),
);

export function AppRoutes() {
  const t = useT();
  return (
    <Routes>
      <Route path="/today/:id?" element={<TodayPage />} />
      <Route path="/projects/archived" element={<ArchivedProjectsPage />} />
      <Route path="/projects/:id/:tab?" element={<ProjectPage />} />
      <Route path="/inbox" element={<InboxPage />} />
      <Route
        path="/calendar"
        element={
          <Suspense fallback={<LoadingBlock label={t('common.loading')} rows={6} />}>
            <CalendarPage />
          </Suspense>
        }
      />
      <Route
        path="/notes/:id?"
        element={
          <Suspense fallback={<LoadingBlock label={t('common.loading')} rows={6} />}>
            <NotesPage />
          </Suspense>
        }
      />
      <Route path="/tasks/:id?" element={<TasksPage />} />
      <Route path="/trash" element={<TrashPage />} />
      <Route path="/settings/:tab?" element={<SettingsPage />} />
      <Route path="*" element={<Navigate to="/today" replace />} />
    </Routes>
  );
}
