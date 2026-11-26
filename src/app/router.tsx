import { Navigate, Route, Routes } from 'react-router-dom';
import { InboxPage } from '@/modules/inbox/InboxPage';
import { ArchivedProjectsPage } from '@/modules/projects/ArchivedProjectsPage';
import { ProjectPage } from '@/modules/projects/ProjectPage';
import { SettingsPage } from '@/modules/settings/SettingsPage';
import { TasksPage } from '@/modules/tasks/TasksPage';
import { TodayPage } from '@/modules/today/TodayPage';
import { TrashPage } from '@/modules/trash/TrashPage';

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/today/:id?" element={<TodayPage />} />
      <Route path="/projects/archived" element={<ArchivedProjectsPage />} />
      <Route path="/projects/:id/:tab?" element={<ProjectPage />} />
      <Route path="/inbox" element={<InboxPage />} />
      <Route path="/tasks/:id?" element={<TasksPage />} />
      <Route path="/trash" element={<TrashPage />} />
      <Route path="/settings/:tab?" element={<SettingsPage />} />
      <Route path="*" element={<Navigate to="/today" replace />} />
    </Routes>
  );
}
