import { Navigate, Route, Routes } from 'react-router-dom';
import { BookOpenText } from 'lucide-react';
import { useAuth } from './context/AuthContext.jsx';
import { useI18n } from './context/I18nContext.jsx';
import Layout from './components/Layout.jsx';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Suppliers from './pages/Suppliers.jsx';
import SupplierDetail from './pages/SupplierDetail.jsx';
import Transactions from './pages/Transactions.jsx';
import Reports from './pages/Reports.jsx';
import Backups from './pages/Backups.jsx';
import Audit from './pages/Audit.jsx';
import Settings from './pages/Settings.jsx';

function Splash() {
  const { t } = useI18n();
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-5 bg-emerald-950 px-6">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-500/15 ring-1 ring-emerald-300/20">
        <BookOpenText className="h-9 w-9 text-emerald-300" />
      </div>
      <div className="text-center">
        <p className="text-lg font-bold text-white" dir="auto">
          {t('app.name')}
        </p>
        <p className="mt-1 text-xs text-emerald-200/60" dir="auto">
          {t('common.loading')}
        </p>
      </div>
      <div className="h-1 w-40 overflow-hidden rounded-full bg-white/10">
        <div className="h-full w-1/2 animate-pulse rounded-full bg-emerald-400" />
      </div>
    </div>
  );
}

export default function App() {
  const { user, loading } = useAuth();

  if (loading) return <Splash />;
  if (!user) return <Login />;

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="suppliers" element={<Suppliers />} />
        <Route path="suppliers/:id" element={<SupplierDetail />} />
        <Route path="transactions" element={<Transactions />} />
        <Route path="reports" element={<Reports />} />
        <Route path="backups" element={<Backups />} />
        <Route path="audit" element={<Audit />} />
        <Route path="settings" element={<Settings />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
