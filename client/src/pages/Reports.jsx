import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  BarChart3,
  CalendarRange,
  Download,
  FileSpreadsheet,
  FileText,
  Printer,
  ReceiptText,
  TrendingUp,
  Wallet
} from 'lucide-react';
import { api, downloadFile, queryString } from '../api.js';
import { useI18n } from '../context/I18nContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Field,
  Input,
  LoadingBlock,
  PageHeader,
  Select,
  TransactionTypeBadge
} from '../components/UI.jsx';
import {
  formatCurrency,
  formatDate,
  formatDateTime,
  formatPeriod,
  monthStartPk,
  todayPk
} from '../lib/format.js';

const validTabs = ['outstanding', 'payments', 'history', 'statement'];

function ReportPrintHeader({ title, subtitle }) {
  return (
    <div className="hidden print:block mb-5 border-b-2 border-emerald-800 pb-3">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="text-lg font-bold text-emerald-900">Imran Arain Hisab Kitab</p>
          <p className="text-xs text-slate-500">{title}</p>
        </div>
        <div className="text-right text-[10px] text-slate-500">
          <p>{subtitle}</p>
          <p>{formatDateTime(new Date().toISOString())} · Asia/Karachi</p>
        </div>
      </div>
    </div>
  );
}

function SummaryStrip({ items }) {
  return (
    <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
      {items.map((item) => (
        <div key={item.label} className={`rounded-xl border px-3 py-2.5 ${item.className || 'border-slate-200 bg-white'}`}>
          <p className="text-[10px] font-semibold uppercase tracking-wide opacity-70">{item.label}</p>
          <p className={`mt-0.5 text-sm font-bold tabular-nums sm:text-base ${item.valueClassName || ''}`}>{item.value}</p>
        </div>
      ))}
    </div>
  );
}

export default function Reports() {
  const { t, lang } = useI18n();
  const toast = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialTab = validTabs.includes(searchParams.get('tab')) ? searchParams.get('tab') : 'outstanding';
  const [tab, setTab] = useState(initialTab);
  const [from, setFrom] = useState(searchParams.get('from') || monthStartPk());
  const [to, setTo] = useState(searchParams.get('to') || todayPk());
  const [asOf, setAsOf] = useState(todayPk());
  const [groupBy, setGroupBy] = useState('day');
  const [historyType, setHistoryType] = useState('all');
  const [supplierId, setSupplierId] = useState(searchParams.get('supplierId') || '');
  const [suppliers, setSuppliers] = useState([]);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [exporting, setExporting] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    api('/suppliers?includeArchived=true')
      .then((result) => setSuppliers(result.suppliers || []))
      .catch(() => setSuppliers([]));
  }, []);

  useEffect(() => {
    if (tab === 'statement' && !supplierId && suppliers.length) {
      setSupplierId(String(suppliers[0].id));
    }
  }, [tab, supplierId, suppliers]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (tab === 'statement' && !supplierId) {
        setData(null);
        setLoading(false);
        return;
      }
      setLoading(true);
      setError('');
      try {
        let result;
        if (tab === 'outstanding') {
          result = await api(`/reports/outstanding${queryString({ asOf })}`);
        } else if (tab === 'payments') {
          result = await api(`/reports/payments${queryString({ from, to, groupBy })}`);
        } else if (tab === 'history') {
          result = await api(`/reports/history${queryString({ from, to, type: historyType === 'all' ? '' : historyType })}`);
        } else {
          result = await api(`/reports/statement/${supplierId}${queryString({ from, to })}`);
        }
        if (!cancelled) setData(result);
      } catch (requestError) {
        if (!cancelled) setError(requestError.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [tab, from, to, asOf, groupBy, historyType, supplierId, refreshKey]);

  const selectedSupplier = useMemo(
    () => suppliers.find((supplier) => String(supplier.id) === String(supplierId)),
    [suppliers, supplierId]
  );

  const historyTotals = useMemo(() => {
    if (tab !== 'history' || !data?.rows) return null;
    return data.rows.reduce(
      (totals, row) => {
        if (row.type === 'purchase') totals.purchases += row.amount_paise;
        if (row.type === 'purchase_reversal') totals.purchases -= row.amount_paise;
        if (row.type === 'payment') totals.payments += row.amount_paise;
        if (row.type === 'payment_reversal') totals.payments -= row.amount_paise;
        return totals;
      },
      { purchases: 0, payments: 0 }
    );
  }, [tab, data]);

  const changeTab = (nextTab) => {
    setTab(nextTab);
    const params = new URLSearchParams(searchParams);
    params.set('tab', nextTab);
    if (supplierId) params.set('supplierId', supplierId);
    setSearchParams(params, { replace: true });
  };

  const selectSupplier = (value) => {
    setSupplierId(value);
    const params = new URLSearchParams(searchParams);
    params.set('tab', 'statement');
    if (value) params.set('supplierId', value);
    setSearchParams(params, { replace: true });
  };

  const exportReport = async (format) => {
    let path;
    if (tab === 'outstanding') {
      path = `/reports/export${queryString({ report: 'outstanding', format, asOf })}`;
    } else if (tab === 'payments') {
      path = `/reports/export${queryString({ report: 'payments', format, from, to, groupBy })}`;
    } else if (tab === 'history') {
      path = `/reports/export${queryString({ report: 'history', format, from, to, type: historyType === 'all' ? '' : historyType })}`;
    } else {
      if (!supplierId) return;
      path = `/reports/export${queryString({ report: 'statement', format, supplierId, from, to })}`;
    }
    setExporting(true);
    try {
      await downloadFile(path, `hisab-${tab}.${format}`);
      toast.success(t('report.downloadStarted'));
    } catch (requestError) {
      toast.error(requestError.message || t('error.generic'));
    } finally {
      setExporting(false);
    }
  };

  const tabs = [
    { key: 'outstanding', icon: Wallet },
    { key: 'payments', icon: BarChart3 },
    { key: 'history', icon: ReceiptText },
    { key: 'statement', icon: FileText }
  ];

  const reportTitle = {
    outstanding: t('report.supplierWise'),
    payments: t('report.paymentReport'),
    history: t('report.historyTitle'),
    statement: t('report.statementTitle')
  }[tab];
  const rangeText =
    tab === 'outstanding'
      ? `${t('report.asOf')}: ${formatDate(asOf, lang)}`
      : `${formatDate(from, lang)} — ${formatDate(to, lang)}`;

  const renderFilters = () => {
    if (tab === 'outstanding') {
      return (
        <Field label={t('report.asOf')} htmlFor="report-asof" className="sm:max-w-[220px]">
          <Input id="report-asof" type="date" value={asOf} onChange={(event) => setAsOf(event.target.value)} />
        </Field>
      );
    }
    return (
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {tab === 'statement' ? (
          <Field label={t('txn.supplier')} htmlFor="report-supplier" className="sm:col-span-2">
            <Select id="report-supplier" value={supplierId} onChange={(event) => selectSupplier(event.target.value)}>
              <option value="">{t('txn.selectSupplier')}</option>
              {suppliers.map((supplier) => (
                <option key={supplier.id} value={supplier.id}>
                  {supplier.name}
                </option>
              ))}
            </Select>
          </Field>
        ) : null}
        <Field label={t('common.from')} htmlFor="report-from">
          <Input id="report-from" type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
        </Field>
        <Field label={t('common.to')} htmlFor="report-to">
          <Input id="report-to" type="date" value={to} onChange={(event) => setTo(event.target.value)} />
        </Field>
        {tab === 'payments' ? (
          <Field label={t('report.groupBy')} htmlFor="report-group">
            <Select id="report-group" value={groupBy} onChange={(event) => setGroupBy(event.target.value)}>
              <option value="day">{t('report.day')}</option>
              <option value="month">{t('report.month')}</option>
              <option value="year">{t('report.year')}</option>
            </Select>
          </Field>
        ) : null}
        {tab === 'history' ? (
          <Field label={t('common.type')} htmlFor="report-type">
            <Select id="report-type" value={historyType} onChange={(event) => setHistoryType(event.target.value)}>
              <option value="all">{t('txn.allTypes')}</option>
              <option value="purchase">{t('txn.type.purchase')}</option>
              <option value="payment">{t('txn.type.payment')}</option>
              <option value="purchase_reversal">{t('txn.type.purchase_reversal')}</option>
              <option value="payment_reversal">{t('txn.type.payment_reversal')}</option>
            </Select>
          </Field>
        ) : null}
      </div>
    );
  };

  const renderReport = () => {
    if (loading) return <LoadingBlock />;
    if (error) return <ErrorState message={error} onRetry={() => setRefreshKey((key) => key + 1)} />;
    if (!data) {
      return (
        <EmptyState
          icon={FileText}
          title={t('report.selectSupplier')}
          description={t('report.statementSub')}
        />
      );
    }

    if (tab === 'outstanding') {
      return (
        <>
          <SummaryStrip
            items={[
              { label: t('report.totalOutstanding'), value: formatCurrency(data.totals.outstanding_paise, { decimals: false }), className: 'border-red-200 bg-red-50', valueClassName: 'text-red-700' },
              { label: t('report.totalAdvance'), value: formatCurrency(data.totals.advance_paise, { decimals: false }), className: 'border-emerald-200 bg-emerald-50', valueClassName: 'text-emerald-700' },
              { label: t('report.totalPurchases'), value: formatCurrency(data.totals.purchases_paise, { decimals: false }), className: 'border-amber-200 bg-amber-50', valueClassName: 'text-amber-800' },
              { label: t('report.totalPayments'), value: formatCurrency(data.totals.payments_paise, { decimals: false }), className: 'border-sky-200 bg-sky-50', valueClassName: 'text-sky-800' }
            ]}
          />
          <div className="overflow-x-auto">
            <table className="print-table w-full min-w-[650px]">
              <thead>
                <tr className="table-head">
                  <th className="px-4 py-3">{t('common.supplier')}</th>
                  <th className="px-4 py-3">{t('common.phone')}</th>
                  <th className="px-4 py-3 text-right">{t('common.purchases')}</th>
                  <th className="px-4 py-3 text-right">{t('common.payments')}</th>
                  <th className="px-4 py-3 text-right">{t('common.outstanding')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.rows.map((row) => (
                  <tr key={row.id} className="hover:bg-slate-50/60">
                    <td className="px-4 py-3">
                      <Link to={`/suppliers/${row.id}`} className="text-xs font-semibold text-slate-800 hover:text-emerald-700" dir="auto">
                        {row.name}
                      </Link>
                      {row.is_archived ? <Badge tone="slate" className="ml-2">{t('common.archived')}</Badge> : null}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500" dir="ltr">{row.phone || '—'}</td>
                    <td className="px-4 py-3 text-right text-xs tabular-nums text-slate-600">{formatCurrency(row.purchases_paise)}</td>
                    <td className="px-4 py-3 text-right text-xs tabular-nums text-emerald-700">{formatCurrency(row.payments_paise)}</td>
                    <td className={`px-4 py-3 text-right text-xs font-bold tabular-nums ${row.balance_paise > 0 ? 'text-red-600' : row.balance_paise < 0 ? 'text-emerald-700' : 'text-slate-500'}`}>
                      {formatCurrency(row.balance_paise)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-slate-50 font-semibold">
                  <td className="px-4 py-3 text-xs" colSpan={2}>{t('common.total')}</td>
                  <td className="px-4 py-3 text-right text-xs tabular-nums">{formatCurrency(data.totals.purchases_paise)}</td>
                  <td className="px-4 py-3 text-right text-xs tabular-nums text-emerald-700">{formatCurrency(data.totals.payments_paise)}</td>
                  <td className="px-4 py-3 text-right text-xs tabular-nums text-red-600">{formatCurrency(data.totals.outstanding_paise)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
          {!data.rows.length ? <EmptyState icon={Wallet} title={t('report.noRows')} /> : null}
        </>
      );
    }

    if (tab === 'payments') {
      return (
        <>
          <SummaryStrip
            items={[
              { label: t('report.totalPurchases'), value: formatCurrency(data.totals.purchases_paise, { decimals: false }), className: 'border-red-200 bg-red-50', valueClassName: 'text-red-700' },
              { label: t('report.totalPayments'), value: formatCurrency(data.totals.payments_paise, { decimals: false }), className: 'border-emerald-200 bg-emerald-50', valueClassName: 'text-emerald-700' }
            ]}
          />
          <div className="overflow-x-auto">
            <table className="print-table w-full min-w-[550px]">
              <thead>
                <tr className="table-head">
                  <th className="px-4 py-3">{t('report.period')}</th>
                  <th className="px-4 py-3 text-right">{t('common.purchases')}</th>
                  <th className="px-4 py-3 text-right">{t('common.payments')}</th>
                  <th className="px-4 py-3 text-right">{t('report.entries')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.rows.map((row) => (
                  <tr key={row.period} className="hover:bg-slate-50/60">
                    <td className="px-4 py-3 text-xs font-medium text-slate-700">{formatPeriod(row.period, groupBy, lang)}</td>
                    <td className="px-4 py-3 text-right text-xs tabular-nums text-slate-600">{formatCurrency(row.purchases_paise)}</td>
                    <td className="px-4 py-3 text-right text-xs font-semibold tabular-nums text-emerald-700">{formatCurrency(row.payments_paise)}</td>
                    <td className="px-4 py-3 text-right text-xs text-slate-500">{row.transaction_count}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-slate-50 font-semibold">
                  <td className="px-4 py-3 text-xs">{t('common.total')}</td>
                  <td className="px-4 py-3 text-right text-xs tabular-nums">{formatCurrency(data.totals.purchases_paise)}</td>
                  <td className="px-4 py-3 text-right text-xs tabular-nums text-emerald-700">{formatCurrency(data.totals.payments_paise)}</td>
                  <td className="px-4 py-3" />
                </tr>
              </tfoot>
            </table>
          </div>
          {!data.rows.length ? <EmptyState icon={BarChart3} title={t('report.noRows')} /> : null}
        </>
      );
    }

    if (tab === 'history') {
      return (
        <>
          {historyTotals ? (
            <SummaryStrip
              items={[
                { label: t('report.totalPurchases'), value: formatCurrency(historyTotals.purchases, { decimals: false }), className: 'border-red-200 bg-red-50', valueClassName: 'text-red-700' },
                { label: t('report.totalPayments'), value: formatCurrency(historyTotals.payments, { decimals: false }), className: 'border-emerald-200 bg-emerald-50', valueClassName: 'text-emerald-700' }
              ]}
            />
          ) : null}
          <div className="overflow-x-auto">
            <table className="print-table w-full min-w-[760px]">
              <thead>
                <tr className="table-head">
                  <th className="px-4 py-3">{t('common.date')}</th>
                  <th className="px-4 py-3">{t('common.supplier')}</th>
                  <th className="px-4 py-3">{t('common.type')}</th>
                  <th className="px-4 py-3">{t('common.description')}</th>
                  <th className="px-4 py-3 text-right">{t('common.purchases')}</th>
                  <th className="px-4 py-3 text-right">{t('common.payments')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.rows.map((row) => (
                  <tr key={row.id} className="hover:bg-slate-50/60">
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-600">{formatDate(row.txn_date, lang)}</td>
                    <td className="px-4 py-3 text-xs font-medium text-slate-700" dir="auto">{row.supplier_name}</td>
                    <td className="px-4 py-3"><TransactionTypeBadge type={row.type} /></td>
                    <td className="max-w-[250px] px-4 py-3">
                      <p className="truncate text-xs text-slate-600" dir="auto">{row.description || row.reference_no || '—'}</p>
                    </td>
                    <td className="px-4 py-3 text-right text-xs tabular-nums text-red-600">
                      {row.effect_paise > 0 ? formatCurrency(row.amount_paise) : '—'}
                    </td>
                    <td className="px-4 py-3 text-right text-xs tabular-nums text-emerald-700">
                      {row.effect_paise < 0 ? formatCurrency(row.amount_paise) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!data.rows.length ? <EmptyState icon={ReceiptText} title={t('report.noRows')} /> : null}
        </>
      );
    }

    const statement = data;
    return (
      <>
        <div className="mb-4 flex flex-col gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-bold text-slate-900" dir="auto">{statement.supplier.name}</p>
            <p className="mt-0.5 text-xs text-slate-500" dir="ltr">{statement.supplier.phone || '—'}</p>
          </div>
          <div className="flex gap-4 text-right">
            <div>
              <p className="text-[10px] uppercase tracking-wide text-slate-500">{t('report.openingBalance')}</p>
              <p className="text-sm font-semibold tabular-nums text-slate-700">{formatCurrency(statement.opening_paise)}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wide text-slate-500">{t('report.closingBalance')}</p>
              <p className={`text-sm font-bold tabular-nums ${statement.closing_paise > 0 ? 'text-red-600' : statement.closing_paise < 0 ? 'text-emerald-700' : 'text-slate-700'}`}>
                {formatCurrency(statement.closing_paise)}
              </p>
            </div>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="print-table w-full min-w-[760px]">
            <thead>
              <tr className="table-head">
                <th className="px-4 py-3">{t('common.date')}</th>
                <th className="px-4 py-3">{t('common.type')}</th>
                <th className="px-4 py-3">{t('common.description')}</th>
                <th className="px-4 py-3">{t('common.referenceShort')}</th>
                <th className="px-4 py-3 text-right">{t('common.purchases')}</th>
                <th className="px-4 py-3 text-right">{t('common.payments')}</th>
                <th className="px-4 py-3 text-right">{t('common.balance')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {statement.rows.map((row) => (
                <tr key={row.id} className={row.status === 'reversed' ? 'bg-red-50/20' : 'hover:bg-slate-50/60'}>
                  <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-600">{formatDate(row.txn_date, lang)}</td>
                  <td className="px-4 py-3"><TransactionTypeBadge type={row.type} /></td>
                  <td className="max-w-[260px] px-4 py-3">
                    <p className="truncate text-xs text-slate-600" dir="auto">{row.description || '—'}</p>
                    {row.status === 'reversed' ? <p className="text-[10px] text-red-500">{t('common.reversed')}</p> : null}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500" dir="auto">{row.reference_no || '—'}</td>
                  <td className="px-4 py-3 text-right text-xs tabular-nums text-red-600">{row.effect_paise > 0 ? formatCurrency(row.amount_paise) : '—'}</td>
                  <td className="px-4 py-3 text-right text-xs tabular-nums text-emerald-700">{row.effect_paise < 0 ? formatCurrency(row.amount_paise) : '—'}</td>
                  <td className={`px-4 py-3 text-right text-xs font-semibold tabular-nums ${row.balance_after_paise > 0 ? 'text-red-600' : row.balance_after_paise < 0 ? 'text-emerald-700' : 'text-slate-600'}`}>
                    {formatCurrency(row.balance_after_paise)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-slate-50 font-semibold">
                <td className="px-4 py-3 text-xs" colSpan={6}>{t('report.closingBalance')}</td>
                <td className={`px-4 py-3 text-right text-xs tabular-nums ${statement.closing_paise > 0 ? 'text-red-600' : 'text-emerald-700'}`}>
                  {formatCurrency(statement.closing_paise)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
        {!statement.rows.length ? <EmptyState icon={FileText} title={t('report.noRows')} /> : null}
      </>
    );
  };

  const canExport = !loading && !error && data && (tab !== 'statement' || supplierId);

  return (
    <div className="animate-fade-in">
      <div className="no-print">
        <PageHeader
          title={t('report.title')}
          subtitle={t('report.subtitle')}
          actions={
            <>
              <Button variant="secondary" onClick={() => window.print()} disabled={!data}>
                <Printer className="h-4 w-4" />
                {t('common.print')}
              </Button>
              <Button variant="secondary" loading={exporting} onClick={() => exportReport('csv')} disabled={!canExport}>
                <FileSpreadsheet className="h-4 w-4" />
                {t('common.exportCsv')}
              </Button>
              <Button loading={exporting} onClick={() => exportReport('pdf')} disabled={!canExport}>
                <Download className="h-4 w-4" />
                {t('common.exportPdf')}
              </Button>
            </>
          }
        />

        <div className="mb-4 flex gap-1 overflow-x-auto rounded-xl border border-slate-200 bg-white p-1">
          {tabs.map(({ key, icon: Icon }) => (
            <button
              key={key}
              type="button"
              onClick={() => changeTab(key)}
              className={`flex flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-lg px-3 py-2.5 text-xs font-semibold transition ${
                tab === key ? 'bg-emerald-700 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              <Icon className="h-4 w-4" />
              {t(`report.${key}`)}
            </button>
          ))}
        </div>

        <Card className="mb-4 p-4">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">
            <CalendarRange className="h-4 w-4" />
            {t('report.filters')}
          </div>
          <div className="mt-3">{renderFilters()}</div>
        </Card>
      </div>

      <div className="print-area">
        <ReportPrintHeader title={reportTitle} subtitle={rangeText} />
        <Card className="print-card overflow-hidden">
          <div className="no-print border-b border-slate-100 px-4 py-4 sm:px-5">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h2 className="text-base font-bold text-slate-900" dir="auto">{reportTitle}</h2>
                <p className="mt-0.5 text-xs text-slate-500">{rangeText}</p>
              </div>
              <div className="flex items-center gap-2">
                <Badge tone="green">{t('report.printReady')}</Badge>
                <span className="hidden text-[10px] text-slate-400 sm:inline">
                  {t('report.generated', { date: formatDateTime(new Date().toISOString(), lang) })}
                </span>
              </div>
            </div>
          </div>
          <div className="p-4 sm:p-5">{renderReport()}</div>
        </Card>
      </div>
    </div>
  );
}
