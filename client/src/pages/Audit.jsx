import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { History, Search, ShieldCheck, X } from 'lucide-react';
import { api, queryString } from '../api.js';
import { useI18n } from '../context/I18nContext.jsx';
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
  Pagination
} from '../components/UI.jsx';
import { formatDateTime } from '../lib/format.js';

function actionTone(action) {
  if (action.includes('reversed') || action.includes('removed')) return 'red';
  if (action.includes('corrected') || action.includes('restored')) return 'amber';
  if (action.includes('created')) return 'green';
  if (action.includes('login') || action.includes('password')) return 'blue';
  return 'slate';
}

export default function Audit() {
  const { t, lang } = useI18n();
  const [searchParams, setSearchParams] = useSearchParams();
  const supplierFilter = searchParams.get('supplierId') || '';
  const [actionInput, setActionInput] = useState('');
  const [action, setAction] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setAction(actionInput);
      setPage(1);
    }, 350);
    return () => window.clearTimeout(timer);
  }, [actionInput]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const result = await api(
        `/audit${queryString({ supplierId: supplierFilter, action, from, to, page, limit: 30 })}`
      );
      setData(result);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }, [supplierFilter, action, from, to, page]);

  useEffect(() => {
    load();
  }, [load]);

  const clearSupplier = () => {
    const params = new URLSearchParams(searchParams);
    params.delete('supplierId');
    setSearchParams(params, { replace: true });
    setPage(1);
  };

  const logs = data?.logs || [];

  return (
    <div className="animate-fade-in">
      <PageHeader
        title={t('audit.title')}
        subtitle={t('audit.subtitle')}
        actions={
          <Button variant="secondary" onClick={load}>
            {t('common.refresh')}
          </Button>
        }
      />

      <Card className="mb-5 p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label={t('audit.action')} htmlFor="audit-action">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                id="audit-action"
                value={actionInput}
                onChange={(event) => setActionInput(event.target.value)}
                placeholder="transaction.corrected"
                className="pl-10"
                dir="ltr"
              />
            </div>
          </Field>
          <Field label={t('common.from')} htmlFor="audit-from">
            <Input id="audit-from" type="date" value={from} onChange={(event) => { setFrom(event.target.value); setPage(1); }} />
          </Field>
          <Field label={t('common.to')} htmlFor="audit-to">
            <Input id="audit-to" type="date" value={to} onChange={(event) => { setTo(event.target.value); setPage(1); }} />
          </Field>
          <div className="flex items-end">
            {supplierFilter ? (
              <button
                type="button"
                onClick={clearSupplier}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-xs font-semibold text-emerald-800"
              >
                {t('audit.supplierFilter')}: {supplierFilter}
                <X className="h-3.5 w-3.5" />
              </button>
            ) : (
              <div className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs text-slate-400">
                <ShieldCheck className="h-3.5 w-3.5" />
                {t('audit.allActions')}
              </div>
            )}
          </div>
        </div>
      </Card>

      {loading ? (
        <LoadingBlock />
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : logs.length === 0 ? (
        <Card>
          <EmptyState icon={History} title={t('audit.noLogs')} />
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[900px]">
              <thead>
                <tr className="table-head">
                  <th className="px-4 py-3">{t('audit.timestamp')}</th>
                  <th className="px-4 py-3">{t('audit.action')}</th>
                  <th className="px-4 py-3">{t('audit.entity')}</th>
                  <th className="px-4 py-3">{t('common.supplier')}</th>
                  <th className="px-4 py-3">{t('audit.user')}</th>
                  <th className="px-4 py-3">{t('audit.details')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {logs.map((log) => (
                  <tr key={log.id} className="align-top hover:bg-slate-50/60">
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-600">
                      {formatDateTime(log.created_at, lang)}
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={actionTone(log.action)}>{log.action.replace(/[._]/g, ' ')}</Badge>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600">
                      {log.entity_type}
                      {log.entity_id ? <span className="text-slate-400"> #{log.entity_id}</span> : null}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600" dir="auto">
                      {log.supplier_name || '—'}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600">
                      {log.performed_by_name || t('audit.system')}
                    </td>
                    <td className="max-w-[320px] px-4 py-3">
                      {log.reason ? (
                        <p className="mb-1 text-xs text-red-600" dir="auto">{log.reason}</p>
                      ) : null}
                      {log.details ? (
                        <details className="group">
                          <summary className="cursor-pointer text-[11px] font-semibold text-emerald-700">
                            {t('audit.details')}
                          </summary>
                          <pre className="mt-1 max-h-40 overflow-auto rounded-lg bg-slate-900 p-2 text-[10px] leading-5 text-emerald-100">
                            {JSON.stringify(log.details, null, 2)}
                          </pre>
                        </details>
                      ) : (
                        <span className="text-[10px] text-slate-300">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="divide-y divide-slate-100 md:hidden">
            {logs.map((log) => (
              <div key={log.id} className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <Badge tone={actionTone(log.action)}>{log.action.replace(/[._]/g, ' ')}</Badge>
                  <p className="shrink-0 text-[10px] text-slate-400">{formatDateTime(log.created_at, lang)}</p>
                </div>
                <p className="mt-2 text-xs text-slate-600" dir="auto">
                  {log.entity_type} {log.entity_id ? `#${log.entity_id}` : ''} · {log.performed_by_name || t('audit.system')}
                </p>
                {log.supplier_name ? (
                  <p className="mt-1 text-xs font-medium text-slate-700" dir="auto">{log.supplier_name}</p>
                ) : null}
                {log.reason ? (
                  <p className="mt-1 text-xs text-red-600" dir="auto">{log.reason}</p>
                ) : null}
                {log.details ? (
                  <details className="mt-2">
                    <summary className="cursor-pointer text-[11px] font-semibold text-emerald-700">{t('audit.details')}</summary>
                    <pre className="mt-1 max-h-40 overflow-auto rounded-lg bg-slate-900 p-2 text-[10px] leading-5 text-emerald-100">
                      {JSON.stringify(log.details, null, 2)}
                    </pre>
                  </details>
                ) : null}
              </div>
            ))}
          </div>

          <Pagination page={data.pagination.page} pages={data.pagination.pages} onChange={setPage} />
        </Card>
      )}
    </div>
  );
}
