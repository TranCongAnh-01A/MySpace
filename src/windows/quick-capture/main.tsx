import { createRoot } from 'react-dom/client';
import { QuickCapture } from './QuickCapture';
import '../../styles.css';

const root = document.getElementById('root');
if (!root) throw new Error('Không tìm thấy #root');
createRoot(root).render(<QuickCapture />);
