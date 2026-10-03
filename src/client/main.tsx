import { StrictMode, Suspense, lazy } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/base.css';

// 子どもの画面と管理画面は別々に読み込む（見た目の指定が混ざらないように）
const ChildApp = lazy(() => import('./child/ChildApp').then((m) => ({ default: m.ChildApp })));
const AdminApp = lazy(() => import('./admin/AdminApp').then((m) => ({ default: m.AdminApp })));

const isAdmin = location.pathname.replace(/\/+$/, '').startsWith('/admin');
document.documentElement.classList.add(isAdmin ? 'mode-admin' : 'mode-child');

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Suspense fallback={null}>{isAdmin ? <AdminApp /> : <ChildApp />}</Suspense>
  </StrictMode>,
);
