import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowDownLeft, ArrowUpRight, FilterX, ReceiptText, Search } from 'lucide-react';
import { api, queryString } from '../api.js';
import { useI18n } from '../context/I18nContext.jsx';
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  Field,
  Input,
  LoadingBlock,
  PageHeader,
  Pagination,
  SearchInput,
  Select,
  StatusBadge,
  TransactionTypeBadge
} from '../components/UI.jsx';
import { TransactionFormModal } from '../components/TransactionFormModal.jsx';
import { formatCurrency, formatDate, formatTime } from '../lib/format.js';

const initialFilters = { q: '', type: 'all', from: '', to: '' };

export default function Transactions() {
  const { t, lang } = useI18n();
  const [filters, setFilters] = useState(initialFilters);
  const [qInput, setQInput] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [txnModal, setTxnModal] = useState(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setFilters((existing) => (existing.q === qInput ? existing : { ...existing, q: qInput }));
      setPage(1);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [qInput]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const result = await api(`/transactions${queryString({ ...filters, page, limit: 25 })}`);
      setData(result);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }, [filters, page]);

  useEffect(() => {
    load();
  }, [load]);

  const update = (key) => (event) => {
    setFilters((current) => ({ ...current, [key]: event.target.value }));
    setPage(1);
  };

  const clearFilters = () => {
    setFilters(initialFilters);
    setQInput('');
    setPage(1);
  };

  const rows = data?.transactions || [];
  const hasFilters = filters.q || filters.type !== 'all' || filters.from || filters.to;

  return (
    <div className="animate-fade-in">
      <PageHeader
        title={t('txn.title')}
        subtitle={t('txn.subtitle')}
        actions={
          <>
            <Button
              className="border-red-700 bg-red-700 hover:bg-red-800"
              onClick={() => setTxnModal('purchase')}
            >
              <ArrowUpRight className="h-4 w-4" />
              {t('txn.addPurchase')}
            </Button>
            <Button variant="success" onClick={() => setTxnModal('payment')}>
              <ArrowDownLeft className="h-4 w-4" />
              {t('txn.addPayment')}
            </Button>
          </>
        }
      />

      <Card className="mb-5 p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
          <div className="sm:col-span-2 lg:col-span-2">
            <SearchInput
              value={qInput}
              onChange={setQInput}
              placeholder={t('txn.searchPlaceholder')}
            />
          </div>
          <Field label={t('common.type')} htmlFor="txn-filter-type">
            <Select id="txn-filter-type" value={filters.type} onChange={update('type')}>
              <option value="all">{t('txn.allTypes')}</option>
              <option value="purchase">{t('txn.type.purchase')}</option>
              <option value="payment">{t('txn.type.payment')}</option>
              <option value="purchase_reversal">{t('txn.type.purchase_reversal')}</option>
              <option value="payment_reversal">{t('txn.type.payment_reversal')}</option>
            </Select>
          </Field>
          <Field label={t('common.from')} htmlFor="txn-filter-from">
            <Input id="txn-filter-from" type="date" value={filters.from} onChange={update('from')} />
          </Field>
          <Field label={t('common.to')} htmlFor="txn-filter-to">
            <Input id="txn-filter-to" type="date" value={filters.to} onChange={update('to')} />
          </Field>
          <div className="flex items-end">
            <Button variant="secondary" className="w-full" onClick={clearFilters} disabled={!hasFilters}>
              <FilterX className="h-4 w-4" />
              {t('common.reset')}
            </Button>
          </div>
        </div>
      </Card>

      <div className="mb-5 grid grid-cols-2 gap-3 sm:max-w-lg">
        <Card className="p-3.5">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{t('txn.purchasesTotal')}</p>
          <p className="mt-1 text-base font-bold text-red-600 sm:text-lg">
            {formatCurrency(data?.totals?.purchases_paise || 0, { decimals: false })}
          </p>
        </Card>
        <Card className="p-3.5">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{t('txn.paymentsTotal')}</p>
          <p className="mt-1 text-base font-bold text-emerald-700 sm:text-lg">
            {formatCurrency(data?.totals?.payments_paise || 0, { decimals: false })}
          </p>
        </Card>
      </div>

      {loading ? (
        <LoadingBlock />
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : rows.length === 0 ? (
        <Card>
          <EmptyState
            icon={ReceiptText}
            title={t('txn.noTransactions')}
            action={
              hasFilters ? (
                <Button variant="secondary" onClick={clearFilters}>
                  <FilterX className="h-4 w-4" />
                  {t('common.reset')}
                </Button>
              ) : null
            }
          />
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[800px]">
              <thead>
                <tr className="table-head">
                  <th className="px-4 py-3">{t('common.date')}</th>
                  <th className="px-4 py-3">{t('common.supplier')}</th>
                  <th className="px-4 py-3">{t('common.type')}</th>
                  <th className="px-4 py-3">{t('common.description')}</th>
                  <th className="px-4 py-3 text-right">{t('common.amount')}</th>
                  <th className="px-4 py-3">{t('common.status')}</th>
                  <th className="px-4 py-3 text-right">{t('common.actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((txn) => (
                  <tr key={txn.id} className="hover:bg-slate-50/60">
                    <td className="whitespace-nowrap px-4 py-3 text-xs">
                      <p className="font-medium text-slate-700">{formatDate(txn.txn_date, lang)}</p>
                      <p className="mt-0.5 text-[10px] text-slate-400">{formatTime(txn.created_at, lang)}</p>
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        to={`/suppliers/${txn.supplier_id}`}
                        className="text-xs font-semibold text-slate-800 hover:text-emerald-700"
                        dir="auto"
                      >
                        {txn.supplier_name}
                      </Link>
                      {txn.supplier_phone ? (
                        <p className="mt-0.5 text-[10px] text-slate-400" dir="ltr">
                          {txn.supplier_phone}
                        </p>
                      ) : null}
                    </td>
                    <td className="px-4 py-3">
                      <TransactionTypeBadge type={txn.type} />
                    </td>
                    <td className="max-w-[250px] px-4 py-3">
                      <p className="truncate text-xs text-slate-600" dir="auto">
                        {txn.description || t('common.notAvailable')}
                      </p>
                      {txn.reference_no ? (
                        <p className="mt-0.5 text-[10px] text-slate-400" dir="auto">
                          {txn.reference_no}
                        </p>
                      ) : null}
                    </td>
                    <td
                      className={`whitespace-nowrap px-4 py-3 text-right text-xs font-bold tabular-nums ${
                        txn.effect_paise >= 0 ? 'text-red-600' : 'text-emerald-700'
                      }`}
                    >
                      {txn.effect_paise >= 0 ? '+' : '−'} {formatCurrency(Math.abs(txn.effect_paise))}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={txn.status} />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        to={`/suppliers/${txn.supplier_id}`}
                        className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-semibold text-emerald-700 hover:bg-emerald-50"
                      >
                        <Search className="h-3 w-3" />
                        {t('common.view')}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="divide-y divide-slate-100 md:hidden">
            {rows.map((txn) => (
              <Link key={txn.id} to={`/suppliers/${txn.supplier_id}`} className="block p-4 hover:bg-slate-50">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-sm font-semibold text-slate-900" dir="auto">
                        {txn.supplier_name}
                      </p>
                      <TransactionTypeBadge type={txn.type} />
                    </div>
                    <p className="mt-1 line-clamp-2 text-xs text-slate-500" dir="auto">
                      {txn.description || txn.reference_no || t('common.notAvailable')}
                    </p>
                    <p className="mt-1 text-[10px] text-slate-400">
                      {formatDate(txn.txn_date, lang)} · {formatTime(txn.created_at, lang)}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className={`text-sm font-bold tabular-nums ${txn.effect_paise >= 0 ? 'text-red-600' : 'text-emerald-700'}`}>
                      {txn.effect_paise >= 0 ? '+' : '−'} {formatCurrency(Math.abs(txn.effect_paise))}
                    </p>
                    <div className="mt-1">
                      <StatusBadge status={txn.status} />
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>

          <Pagination page={data.pagination.page} pages={data.pagination.pages} onChange={setPage} />
        </Card>
      )}

      <TransactionFormModal
        open={Boolean(txnModal)}
        onClose={() => setTxnModal(null)}
        defaultType={txnModal || 'purchase'}
        onSaved={load}
      />
    </div>
  );
}
