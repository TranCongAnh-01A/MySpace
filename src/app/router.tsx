import { Navigate, Route, Routes } from 'react-router-dom';
import { InboxPage } from '@/modules/inbox/InboxPage';
import { SettingsPage } from '@/modules/settings/SettingsPage';

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/inbox" element={<InboxPage />} />
      <Route path="/settings/:tab?" element={<SettingsPage />} />
      <Route path="*" element={<Navigate to="/inbox" replace />} />
    </Routes>
  );
}
