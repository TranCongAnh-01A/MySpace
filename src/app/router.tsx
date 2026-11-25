import { Navigate, Route, Routes } from 'react-router-dom';
import { InboxPage } from '../modules/inbox/InboxPage';

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/inbox" element={<InboxPage />} />
      <Route path="*" element={<Navigate to="/inbox" replace />} />
    </Routes>
  );
}
