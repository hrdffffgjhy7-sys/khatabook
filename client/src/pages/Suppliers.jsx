import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowDownLeft, ArrowRight, ArrowUpRight, Phone, Plus, Store, Users, Wallet } from 'lucide-react';
import { api } from '../api.js';
import { useI18n } from '../context/I18nContext.jsx';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  LoadingBlock,
  Money,
  PageHeader,
  SearchInput
} from '../components/UI.jsx';
import { SupplierFormModal } from '../components/SupplierFormModal.jsx';
import { TransactionFormModal } from '../components/TransactionFormModal.jsx';
import { formatCurrency, formatDate } from '../lib/format.js';

export default function Suppliers() {
  const { t, lang } = useI18n();
  const [query, setQuery] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [supplierModal, setSupplierModal] = useState(false);
  const [txnModal, setTxnModal] = useState(null);

  const load = useCallback(
    async (searchTerm = query) => {
      setLoading(true);
      setError('');
      try {
        const result = await api(`/suppliers${searchTerm ? `?q=${encodeURIComponent(searchTerm)}` : ''}`);
        setData(result);
      } catch (requestError) {
        setError(requestError.message);
      } finally {
        setLoading(false);
      }
    },
    [query]
  );

  useEffect(() => {
    const timer = window.setTimeout(() => load(query), query ? 250 : 0);
    return () => window.clearTimeout(timer);
  }, [query, load]);

  const suppliers = useMemo(() => data?.suppliers || [], [data]);

  return (
    <div className="animate-fade-in">
      <PageHeader
        title={t('supplier.title')}
        subtitle={t('supplier.subtitle')}
        actions={
          <>
            <Button variant="secondary" onClick={() => load(query)}>
              {t('common.refresh')}
            </Button>
            <Button onClick={() => setSupplierModal(true)}>
              <Plus className="h-4 w-4" />
              {t('supplier.add')}
            </Button>
          </>
        }
      />

      <div className="mb-5 grid grid-cols-3 gap-3">
        <Card className="p-3.5 sm:p-4">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 sm:text-xs">{t('common.outstanding')}</p>
          <p className="mt-1 text-base font-bold text-red-600 sm:text-xl">
            {formatCurrency(data?.totalOutstanding || 0, { decimals: false })}
          </p>
        </Card>
        <Card className="p-3.5 sm:p-4">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 sm:text-xs">{t('common.advance')}</p>
          <p className="mt-1 text-base font-bold text-emerald-700 sm:text-xl">
            {formatCurrency(data?.totalAdvance || 0, { decimals: false })}
          </p>
        </Card>
        <Card className="p-3.5 sm:p-4">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 sm:text-xs">{t('dashboard.suppliers')}</p>
          <p className="mt-1 text-base font-bold text-slate-900 sm:text-xl">{data?.count ?? 0}</p>
        </Card>
      </div>

      <Card className="mb-5 p-3 sm:p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <SearchInput
            value={query}
            onChange={setQuery}
            placeholder={t('supplier.searchPlaceholder')}
            className="flex-1"
          />
          <p className="shrink-0 text-xs text-slate-500">{t('supplier.count', { count: data?.count ?? 0 })}</p>
        </div>
      </Card>

      {loading ? (
        <LoadingBlock />
      ) : error ? (
        <ErrorState message={error} onRetry={() => load(query)} />
      ) : suppliers.length === 0 ? (
        <Card>
          <EmptyState
            icon={Users}
            title={t('supplier.noSuppliers')}
            description={t('supplier.noSuppliersSub')}
            action={
              <Button onClick={() => setSupplierModal(true)}>
                <Plus className="h-4 w-4" />
                {t('supplier.add')}
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {suppliers.map((supplier) => {
            const due = supplier.balance_paise > 0;
            const advance = supplier.balance_paise < 0;
            return (
              <Card key={supplier.id} className="flex flex-col overflow-hidden transition hover:shadow-md">
                <div className="flex-1 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100">
                        <Store className="h-5 w-5" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <h2 className="truncate text-sm font-bold text-slate-900" dir="auto">
                            {supplier.name}
                          </h2>
                          {supplier.is_test ? <Badge tone="amber">{t('common.test')}</Badge> : null}
                        </div>
                        <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-slate-500">
                          <Phone className="h-3 w-3 shrink-0" />
                          <span dir="ltr">{supplier.phone || t('common.notAvailable')}</span>
                        </p>
                      </div>
                    </div>
                    <Link
                      to={`/suppliers/${supplier.id}`}
                      className="rounded-lg p-1.5 text-slate-300 transition hover:bg-slate-100 hover:text-emerald-700"
                      aria-label={t('supplier.openAccount')}
                    >
                      <ArrowRight className="h-4 w-4" />
                    </Link>
                  </div>

                  <div className="mt-4 rounded-xl bg-slate-50 p-3.5">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                      {due ? t('supplier.balanceDue') : advance ? t('supplier.advancePaid') : t('common.balance')}
                    </p>
                    <p
                      className={`mt-0.5 text-2xl font-bold tabular-nums tracking-tight ${
                        due ? 'text-red-600' : advance ? 'text-emerald-700' : 'text-slate-700'
                      }`}
                    >
                      {formatCurrency(supplier.balance_paise)}
                    </p>
                    {advance ? <Badge tone="green" className="mt-1.5">{t('common.advance')}</Badge> : null}
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                    <div className="rounded-lg border border-slate-100 px-2.5 py-2">
                      <p className="text-[10px] text-slate-500">{t('common.purchases')}</p>
                      <p className="mt-0.5 font-semibold tabular-nums text-slate-700">
                        {formatCurrency(supplier.purchases_paise, { decimals: false })}
                      </p>
                    </div>
                    <div className="rounded-lg border border-slate-100 px-2.5 py-2">
                      <p className="text-[10px] text-slate-500">{t('common.payments')}</p>
                      <p className="mt-0.5 font-semibold tabular-nums text-emerald-700">
                        {formatCurrency(supplier.payments_paise, { decimals: false })}
                      </p>
                    </div>
                  </div>

                  <p className="mt-3 text-[10px] text-slate-400">
                    {t('supplier.lastTxn')}: {supplier.last_transaction_date ? formatDate(supplier.last_transaction_date, lang) : t('supplier.noTxn')}
                  </p>
                </div>

                <div className="flex items-center gap-2 border-t border-slate-100 bg-slate-50/60 px-3 py-2.5">
                  <Button size="sm" variant="success" className="flex-1" onClick={() => setTxnModal({ supplier, type: 'payment' })}>
                    <ArrowDownLeft className="h-3.5 w-3.5" />
                    {t('supplier.payment')}
                  </Button>
                  <Button size="sm" variant="secondary" className="flex-1" onClick={() => setTxnModal({ supplier, type: 'purchase' })}>
                    <ArrowUpRight className="h-3.5 w-3.5" />
                    {t('supplier.purchase')}
                  </Button>
                  <Link
                    to={`/suppliers/${supplier.id}`}
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 transition hover:text-emerald-700"
                    title={t('supplier.openAccount')}
                  >
                    <Wallet className="h-4 w-4" />
                  </Link>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <SupplierFormModal
        open={supplierModal}
        onClose={() => setSupplierModal(false)}
        onSaved={() => load(query)}
      />
      <TransactionFormModal
        open={Boolean(txnModal)}
        onClose={() => setTxnModal(null)}
        supplier={txnModal?.supplier || null}
        defaultType={txnModal?.type || 'purchase'}
        onSaved={() => load(query)}
      />
    </div>
  );
}
