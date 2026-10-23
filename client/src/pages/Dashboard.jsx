import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  Banknote,
  CalendarClock,
  DatabaseBackup,
  Plus,
  ShieldAlert,
  ShoppingCart,
  TrendingUp,
  Users
} from 'lucide-react';
import { api } from '../api.js';
import { useI18n } from '../context/I18nContext.jsx';
import { Button, Card, ErrorState, LoadingBlock, Money, PageHeader, SectionTitle, StatCard, TransactionTypeBadge, Badge } from '../components/UI.jsx';
import { SupplierFormModal } from '../components/SupplierFormModal.jsx';
import { TransactionFormModal } from '../components/TransactionFormModal.jsx';
import { daysSince, formatCurrency, formatDate, formatDateTime, formatMonth } from '../lib/format.js';

export default function Dashboard() {
  const { t, lang } = useI18n();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [supplierModal, setSupplierModal] = useState(false);
  const [txnModal, setTxnModal] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const result = await api('/dashboard');
      setData(result);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const trendMax = useMemo(() => {
    if (!data?.trend) return 0;
    return Math.max(1, ...data.trend.flatMap((month) => [month.purchases_paise, month.payments_paise]));
  }, [data]);

  const topMax = useMemo(() => {
    if (!data?.topSuppliers?.length) return 1;
    return Math.max(1, ...data.topSuppliers.map((supplier) => supplier.balance_paise));
  }, [data]);

  if (loading) return <LoadingBlock />;
  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!data) return null;

  const lastBackupDays = data.summary.lastBackup ? daysSince(data.summary.lastBackup.createdAt) : null;
  const backupHealthy = lastBackupDays !== null && lastBackupDays <= 7;

  return (
    <div className="animate-fade-in">
      <PageHeader
        title={t('dashboard.title')}
        subtitle={t('dashboard.subtitle')}
        actions={
          <>
            <Button variant="secondary" onClick={() => setSupplierModal(true)}>
              <Plus className="h-4 w-4" />
              {t('dashboard.addSupplier')}
            </Button>
            <Button className="bg-red-700 border-red-700 hover:bg-red-800" onClick={() => setTxnModal('purchase')}>
              <ArrowUpRight className="h-4 w-4" />
              {t('dashboard.recordPurchase')}
            </Button>
            <Button variant="success" onClick={() => setTxnModal('payment')}>
              <ArrowDownLeft className="h-4 w-4" />
              {t('dashboard.recordPayment')}
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatCard
          label={t('dashboard.outstanding')}
          value={formatCurrency(data.summary.outstanding_paise, { decimals: false })}
          hint={data.summary.advance_paise > 0 ? t('dashboard.advanceNote', { amount: formatCurrency(data.summary.advance_paise) }) : undefined}
          icon={TrendingUp}
          tone="red"
        />
        <StatCard
          label={t('dashboard.purchases')}
          value={formatCurrency(data.summary.purchases_paise, { decimals: false })}
          icon={ShoppingCart}
          tone="amber"
        />
        <StatCard
          label={t('dashboard.payments')}
          value={formatCurrency(data.summary.payments_paise, { decimals: false })}
          icon={Banknote}
          tone="green"
        />
        <StatCard
          label={t('dashboard.suppliers')}
          value={data.summary.supplierCount}
          hint={`${data.summary.transactionCount} ${t('dashboard.transactions')}`}
          icon={Users}
          tone="blue"
          onClick={() => navigate('/suppliers')}
        />
      </div>

      {!backupHealthy ? (
        <div className="mt-4 flex flex-col gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <span className="rounded-lg bg-amber-100 p-1.5 text-amber-700">
              <ShieldAlert className="h-4 w-4" />
            </span>
            <div>
              <p className="text-sm font-semibold text-amber-900">
                {lastBackupDays === null
                  ? t('dashboard.noBackup')
                  : t('dashboard.backupOld', { days: lastBackupDays })}
              </p>
              <p className="mt-0.5 text-xs text-amber-700" dir="auto">
                {t('backup.localNote')}
              </p>
            </div>
          </div>
          <Link
            to="/backups"
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-amber-900 px-3 py-2 text-xs font-semibold text-white transition hover:bg-amber-950"
          >
            <DatabaseBackup className="h-3.5 w-3.5" />
            {t('dashboard.goToBackups')}
          </Link>
        </div>
      ) : null}

      <div className="mt-6 grid gap-5 xl:grid-cols-3">
        <Card className="overflow-hidden xl:col-span-2">
          <div className="px-4 pt-4 sm:px-5 sm:pt-5">
            <SectionTitle
              title={t('dashboard.recent')}
              subtitle={t('dashboard.recentSub')}
              action={
                <Link
                  to="/transactions"
                  className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 hover:text-emerald-800"
                >
                  {t('dashboard.viewAll')}
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              }
            />
          </div>
          {data.recentTransactions.length ? (
            <div className="mt-4 divide-y divide-slate-100">
              {data.recentTransactions.map((txn) => (
                <Link
                  key={txn.id}
                  to={`/suppliers/${txn.supplier_id}`}
                  className="flex items-center gap-3 px-4 py-3.5 transition hover:bg-slate-50 sm:px-5"
                >
                  <span
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
                      txn.effect_paise >= 0 ? 'bg-red-50 text-red-600' : 'bg-emerald-50 text-emerald-700'
                    }`}
                  >
                    {txn.effect_paise >= 0 ? <ArrowUpRight className="h-4 w-4" /> : <ArrowDownLeft className="h-4 w-4" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <p className="truncate text-sm font-semibold text-slate-900" dir="auto">
                        {txn.supplier_name}
                      </p>
                      <TransactionTypeBadge type={txn.type} />
                    </div>
                    <p className="mt-0.5 truncate text-xs text-slate-500" dir="auto">
                      {txn.description || txn.reference_no || formatDateTime(txn.created_at, lang)}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className={`text-sm font-bold tabular-nums ${txn.effect_paise >= 0 ? 'text-red-600' : 'text-emerald-700'}`}>
                      {txn.effect_paise >= 0 ? '+' : '−'} {formatCurrency(Math.abs(txn.effect_paise))}
                    </p>
                    <p className="mt-0.5 text-[10px] text-slate-400">{formatDate(txn.txn_date, lang)}</p>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <p className="px-5 py-10 text-center text-sm text-slate-500">{t('dashboard.noRecent')}</p>
          )}
        </Card>

        <Card className="p-4 sm:p-5">
          <SectionTitle title={t('dashboard.quickActions')} />
          <div className="mt-4 space-y-2.5">
            <button
              type="button"
              onClick={() => setSupplierModal(true)}
              className="flex w-full items-center gap-3 rounded-xl border border-slate-200 px-3.5 py-3 text-left transition hover:border-emerald-200 hover:bg-emerald-50/50"
            >
              <span className="rounded-lg bg-slate-100 p-2 text-slate-600">
                <Plus className="h-4 w-4" />
              </span>
              <span className="flex-1 text-sm font-semibold text-slate-800">{t('dashboard.addSupplier')}</span>
              <ArrowRight className="h-4 w-4 text-slate-300" />
            </button>
            <button
              type="button"
              onClick={() => setTxnModal('purchase')}
              className="flex w-full items-center gap-3 rounded-xl border border-slate-200 px-3.5 py-3 text-left transition hover:border-red-200 hover:bg-red-50/50"
            >
              <span className="rounded-lg bg-red-50 p-2 text-red-600">
                <ArrowUpRight className="h-4 w-4" />
              </span>
              <span className="flex-1 text-sm font-semibold text-slate-800">{t('dashboard.recordPurchase')}</span>
              <ArrowRight className="h-4 w-4 text-slate-300" />
            </button>
            <button
              type="button"
              onClick={() => setTxnModal('payment')}
              className="flex w-full items-center gap-3 rounded-xl border border-slate-200 px-3.5 py-3 text-left transition hover:border-emerald-200 hover:bg-emerald-50/50"
            >
              <span className="rounded-lg bg-emerald-50 p-2 text-emerald-700">
                <ArrowDownLeft className="h-4 w-4" />
              </span>
              <span className="flex-1 text-sm font-semibold text-slate-800">{t('dashboard.recordPayment')}</span>
              <ArrowRight className="h-4 w-4 text-slate-300" />
            </button>
          </div>

          <div className="mt-5 rounded-xl bg-slate-50 p-3.5">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-semibold text-slate-600">{t('dashboard.backup')}</p>
              <Badge tone={backupHealthy ? 'green' : 'amber'}>
                {backupHealthy ? t('backup.statusOk') : t('backup.statusWarn')}
              </Badge>
            </div>
            <p className="mt-2 text-xs leading-5 text-slate-500" dir="auto">
              {data.summary.lastBackup
                ? `${formatDateTime(data.summary.lastBackup.createdAt, lang)} · ${t(`backup.trigger.${data.summary.lastBackup.trigger}`)}`
                : t('dashboard.noBackup')}
            </p>
            <Link
              to="/backups"
              className="mt-2.5 inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 hover:text-emerald-800"
            >
              <DatabaseBackup className="h-3.5 w-3.5" />
              {t('dashboard.goToBackups')}
            </Link>
          </div>
        </Card>

        <Card className="overflow-hidden xl:col-span-2">
          <div className="border-b border-slate-100 px-4 py-4 sm:px-5">
            <SectionTitle
              title={t('dashboard.trend')}
              action={
                <div className="flex items-center gap-3 text-[10px] text-slate-500">
                  <span className="flex items-center gap-1">
                    <span className="h-2 w-2 rounded-full bg-red-400" />
                    {t('common.purchases')}
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="h-2 w-2 rounded-full bg-emerald-500" />
                    {t('common.payments')}
                  </span>
                </div>
              }
            />
          </div>
          <div className="px-4 py-5 sm:px-5">
            <div className="flex h-44 items-end gap-2 sm:gap-4">
              {data.trend.map((month) => {
                const purchaseHeight = Math.max(2, (month.purchases_paise / trendMax) * 100);
                const paymentHeight = Math.max(2, (month.payments_paise / trendMax) * 100);
                return (
                  <div key={month.month} className="flex h-full min-w-0 flex-1 flex-col justify-end">
                    <div className="flex flex-1 items-end justify-center gap-1">
                      <div
                        className="w-2.5 rounded-t-sm bg-red-400/80 transition-all sm:w-3.5"
                        style={{ height: `${purchaseHeight}%` }}
                        title={`${t('common.purchases')}: ${formatCurrency(month.purchases_paise)}`}
                      />
                      <div
                        className="w-2.5 rounded-t-sm bg-emerald-500/85 transition-all sm:w-3.5"
                        style={{ height: `${paymentHeight}%` }}
                        title={`${t('common.payments')}: ${formatCurrency(month.payments_paise)}`}
                      />
                    </div>
                    <p className="mt-2 truncate text-center text-[10px] text-slate-500">
                      {formatMonth(month.month, lang).replace(/\s+\d{4}/, '')}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        </Card>

        <Card className="overflow-hidden">
          <div className="border-b border-slate-100 px-4 py-4">
            <SectionTitle title={t('dashboard.topSuppliers')} />
          </div>
          {data.topSuppliers.length ? (
            <div className="divide-y divide-slate-100">
              {data.topSuppliers.map((supplier, index) => (
                <Link
                  key={supplier.id}
                  to={`/suppliers/${supplier.id}`}
                  className="block px-4 py-3.5 transition hover:bg-slate-50"
                >
                  <div className="flex items-center gap-3">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[11px] font-bold text-slate-500">
                      {index + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate text-sm font-semibold text-slate-800" dir="auto">
                          {supplier.name}
                        </p>
                        <Money paise={supplier.balance_paise} colorize className="text-xs" />
                      </div>
                      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-red-400 to-red-500"
                          style={{ width: `${Math.max(4, (supplier.balance_paise / topMax) * 100)}%` }}
                        />
                      </div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <p className="px-4 py-10 text-center text-sm text-slate-500">{t('dashboard.noTop')}</p>
          )}
          <div className="border-t border-slate-100 bg-slate-50/60 px-4 py-3">
            <Link to="/reports" className="flex items-center justify-between text-xs font-semibold text-emerald-700">
              {t('report.title')}
              <CalendarClock className="h-4 w-4" />
            </Link>
          </div>
        </Card>
      </div>

      <SupplierFormModal
        open={supplierModal}
        onClose={() => setSupplierModal(false)}
        onSaved={load}
      />
      <TransactionFormModal
        open={Boolean(txnModal)}
        onClose={() => setTxnModal(null)}
        defaultType={txnModal || 'purchase'}
        onSaved={load}
      />
    </div>
  );
}
