import { Navigate, Route, Routes } from 'react-router-dom';
import { InboxPage } from '@/modules/inbox/InboxPage';
import { SettingsPage } from '@/modules/settings/SettingsPage';
import { TasksPage } from '@/modules/tasks/TasksPage';
import { TrashPage } from '@/modules/trash/TrashPage';

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/inbox" element={<InboxPage />} />
      <Route path="/tasks/:id?" element={<TasksPage />} />
      <Route path="/trash" element={<TrashPage />} />
      <Route path="/settings/:tab?" element={<SettingsPage />} />
      <Route path="*" element={<Navigate to="/inbox" replace />} />
    </Routes>
  );
}
