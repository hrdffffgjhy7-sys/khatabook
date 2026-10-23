import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  Archive,
  ArrowDownLeft,
  ArrowLeft,
  ArrowUpRight,
  CalendarDays,
  History,
  MapPin,
  Pencil,
  Phone,
  Printer,
  RotateCcw,
  StickyNote,
  Trash2,
  Undo2
} from 'lucide-react';
import { api, ApiError, newIdempotencyKey } from '../api.js';
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
  Money,
  PageHeader,
  SectionTitle,
  StatusBadge,
  Textarea,
  TransactionTypeBadge
} from '../components/UI.jsx';
import { SupplierFormModal } from '../components/SupplierFormModal.jsx';
import { TransactionFormModal } from '../components/TransactionFormModal.jsx';
import { Modal } from '../components/Modal.jsx';
import {
  formatCurrency,
  formatDate,
  formatDateTime,
  formatTime,
  monthStartPk,
  todayPk
} from '../lib/format.js';

export default function SupplierDetail() {
  const { id } = useParams();
  const { t, lang } = useI18n();
  const toast = useToast();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [supplierModal, setSupplierModal] = useState(false);
  const [txnModal, setTxnModal] = useState(null);
  const [correction, setCorrection] = useState(null);
  const [reverseTxn, setReverseTxn] = useState(null);
  const [reverseReason, setReverseReason] = useState('');
  const [reversing, setReversing] = useState(false);
  const [reverseError, setReverseError] = useState('');
  const [reverseKey, setReverseKey] = useState('');
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const result = await api(`/suppliers/${id}`);
      setData(result);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const openReverse = (txn) => {
    setReverseTxn(txn);
    setReverseReason('');
    setReverseError('');
    setReverseKey(newIdempotencyKey());
  };

  const submitReverse = async () => {
    if (reverseReason.trim().length < 3) {
      setReverseError(t('txn.reasonRequired'));
      return;
    }
    setReversing(true);
    setReverseError('');
    try {
      await api(`/transactions/${reverseTxn.id}/reverse`, {
        method: 'POST',
        body: { reason: reverseReason.trim(), idempotencyKey: reverseKey }
      });
      toast.success(t('txn.reversedOk'));
      setReverseTxn(null);
      await load();
    } catch (requestError) {
      setReverseError(requestError.message || t('error.generic'));
    } finally {
      setReversing(false);
    }
  };

  const toggleArchive = async () => {
    setArchiving(true);
    try {
      await api(`/suppliers/${data.supplier.id}/archive`, {
        method: 'PATCH',
        body: { archived: !data.supplier.is_archived }
      });
      toast.success(data.supplier.is_archived ? t('supplier.unarchivedOk') : t('supplier.archivedOk'));
      setArchiveOpen(false);
      await load();
    } catch (requestError) {
      toast.error(requestError.message || t('error.generic'));
    } finally {
      setArchiving(false);
    }
  };

  const openDelete = () => {
    setDeleteConfirm('');
    setDeleteError('');
    setDeleteOpen(true);
  };

  const deleteSupplier = async () => {
    setDeleting(true);
    setDeleteError('');
    try {
      await api(`/suppliers/${data.supplier.id}`, {
        method: 'DELETE',
        body: { confirmName: deleteConfirm.trim() }
      });
      toast.success(t('supplier.deletedOk'));
      navigate('/suppliers');
    } catch (requestError) {
      setDeleteError(requestError.message || t('error.generic'));
    } finally {
      setDeleting(false);
    }
  };

  const openStatement = () => {
    const params = new URLSearchParams({
      tab: 'statement',
      supplierId: id,
      from: monthStartPk(),
      to: todayPk()
    });
    navigate(`/reports?${params.toString()}`);
  };

  if (loading) return <LoadingBlock />;
  if (error) {
    return (
      <div>
        <Button variant="ghost" size="sm" onClick={() => navigate('/suppliers')} className="mb-4">
          <ArrowLeft className="h-4 w-4" />
          {t('supplier.backToSuppliers')}
        </Button>
        <ErrorState message={error} onRetry={load} />
      </div>
    );
  }
  if (!data) return null;

  const { supplier, transactions, summary } = data;
  const due = summary.balance_paise > 0;
  const advance = summary.balance_paise < 0;

  return (
    <div className="animate-fade-in">
      <button
        type="button"
        onClick={() => navigate('/suppliers')}
        className="mb-3 inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 transition hover:text-emerald-700"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        {t('supplier.backToSuppliers')}
      </button>

      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-2">
            {supplier.name}
            {supplier.is_test ? <Badge tone="amber">{t('common.test')}</Badge> : null}
            {supplier.is_archived ? <Badge tone="slate">{t('common.archived')}</Badge> : null}
          </span>
        }
        subtitle={t('supplier.accountSub')}
        actions={
          <>
            <Button variant="secondary" onClick={() => setSupplierModal(true)}>
              <Pencil className="h-4 w-4" />
              {t('common.edit')}
            </Button>
            <Button variant="secondary" onClick={openStatement}>
              <Printer className="h-4 w-4" />
              {t('supplier.statement')}
            </Button>
            <Button
              className="border-red-700 bg-red-700 hover:bg-red-800"
              onClick={() => setTxnModal('purchase')}
              disabled={supplier.is_archived}
            >
              <ArrowUpRight className="h-4 w-4" />
              {t('supplier.addPurchase')}
            </Button>
            <Button variant="success" onClick={() => setTxnModal('payment')} disabled={supplier.is_archived}>
              <ArrowDownLeft className="h-4 w-4" />
              {t('supplier.recordPayment')}
            </Button>
            <Button variant="dangerSoft" onClick={openDelete}>
              <Trash2 className="h-4 w-4" />
              {t('supplier.delete')}
            </Button>
          </>
        }
      />

      {supplier.is_archived ? (
        <div className="mb-5 flex flex-col gap-3 rounded-2xl border border-slate-200 bg-slate-100 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2.5 text-sm text-slate-600">
            <Archive className="h-4 w-4" />
            <span dir="auto">{t('supplier.archivedMsg')}</span>
          </div>
          <Button variant="secondary" size="sm" onClick={() => setArchiveOpen(true)}>
            <Undo2 className="h-3.5 w-3.5" />
            {t('supplier.unarchive')}
          </Button>
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="p-5 lg:col-span-2">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                {due ? t('supplier.currentBalance') : advance ? t('supplier.advancePaid') : t('common.balance')}
              </p>
              <p
                className={`mt-2 text-3xl font-bold tracking-tight tabular-nums ${
                  due ? 'text-red-600' : advance ? 'text-emerald-700' : 'text-slate-800'
                }`}
              >
                {formatCurrency(summary.balance_paise)}
              </p>
              {advance ? <Badge tone="green" className="mt-2">{t('common.advance')}</Badge> : null}
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-1">
              <div className="rounded-xl bg-red-50/60 px-3 py-2.5">
                <p className="text-[10px] font-medium uppercase tracking-wide text-red-600/70">{t('supplier.totalPurchases')}</p>
                <p className="mt-0.5 text-sm font-bold tabular-nums text-red-700">
                  {formatCurrency(summary.purchases, { decimals: false })}
                </p>
              </div>
              <div className="rounded-xl bg-emerald-50/70 px-3 py-2.5">
                <p className="text-[10px] font-medium uppercase tracking-wide text-emerald-700/70">{t('supplier.totalPayments')}</p>
                <p className="mt-0.5 text-sm font-bold tabular-nums text-emerald-700">
                  {formatCurrency(summary.payments, { decimals: false })}
                </p>
              </div>
            </div>
          </div>
          <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-slate-100 pt-4 text-xs text-slate-500">
            <span className="flex items-center gap-1.5">
              <History className="h-3.5 w-3.5" />
              {summary.transactionCount} {t('supplier.entries')}
            </span>
            <span className="flex items-center gap-1.5">
              <CalendarDays className="h-3.5 w-3.5" />
              {t('supplier.since')} {formatDate(supplier.created_at.slice(0, 10), lang)}
            </span>
            <Link to={`/audit?supplierId=${supplier.id}`} className="ml-auto font-semibold text-emerald-700 hover:text-emerald-800">
              {t('supplier.viewAudit')}
            </Link>
          </div>
        </Card>

        <Card className="p-5">
          <div className="flex items-start justify-between">
            <h2 className="text-sm font-semibold text-slate-900">{t('supplier.account')}</h2>
            {!supplier.is_archived ? (
              <button
                type="button"
                onClick={() => setArchiveOpen(true)}
                className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-red-600"
                title={t('supplier.archive')}
              >
                <Archive className="h-4 w-4" />
              </button>
            ) : null}
          </div>
          <div className="mt-4 space-y-3 text-sm">
            <div className="flex items-start gap-2.5">
              <Phone className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
              <div>
                <p className="text-[10px] uppercase tracking-wide text-slate-400">{t('common.phone')}</p>
                <p className="mt-0.5 text-slate-700" dir="ltr">
                  {supplier.phone || t('common.notAvailable')}
                </p>
              </div>
            </div>
            <div className="flex items-start gap-2.5">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
              <div>
                <p className="text-[10px] uppercase tracking-wide text-slate-400">{t('common.address')}</p>
                <p className="mt-0.5 text-slate-700" dir="auto">
                  {supplier.address || t('common.notAvailable')}
                </p>
              </div>
            </div>
            <div className="flex items-start gap-2.5">
              <StickyNote className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
              <div>
                <p className="text-[10px] uppercase tracking-wide text-slate-400">{t('common.notes')}</p>
                <p className="mt-0.5 whitespace-pre-wrap text-slate-700" dir="auto">
                  {supplier.notes || t('common.notAvailable')}
                </p>
              </div>
            </div>
          </div>
          {supplier.is_test ? (
            <p className="mt-4 rounded-lg bg-amber-50 px-2.5 py-2 text-[11px] leading-5 text-amber-800">
              {t('supplier.deleteTestHint')}
            </p>
          ) : null}
        </Card>
      </div>

      <Card className="mt-5 overflow-hidden">
        <div className="border-b border-slate-100 px-4 py-4 sm:px-5">
          <SectionTitle title={t('supplier.ledger')} subtitle={t('supplier.ledgerSub')} />
        </div>

        {transactions.length === 0 ? (
          <EmptyState
            icon={History}
            title={t('supplier.noLedger')}
            action={
              !supplier.is_archived ? (
                <Button onClick={() => setTxnModal('purchase')}>
                  <ArrowUpRight className="h-4 w-4" />
                  {t('supplier.addPurchase')}
                </Button>
              ) : null
            }
          />
        ) : (
          <>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[900px]">
                <thead>
                  <tr className="table-head">
                    <th className="px-4 py-3">{t('common.date')}</th>
                    <th className="px-4 py-3">{t('common.type')}</th>
                    <th className="px-4 py-3">{t('common.description')}</th>
                    <th className="px-4 py-3 text-right">{t('common.purchases')}</th>
                    <th className="px-4 py-3 text-right">{t('common.payments')}</th>
                    <th className="px-4 py-3 text-right">{t('common.balance')}</th>
                    <th className="px-4 py-3">{t('common.status')}</th>
                    <th className="px-4 py-3 text-right">{t('common.actions')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {transactions.map((txn) => {
                    const canChange = ['purchase', 'payment'].includes(txn.type) && txn.status === 'active';
                    return (
                      <tr key={txn.id} className={txn.status === 'reversed' ? 'bg-red-50/20' : 'hover:bg-slate-50/60'}>
                        <td className="whitespace-nowrap px-4 py-3 text-xs">
                          <p className="font-medium text-slate-700">{formatDate(txn.txn_date, lang)}</p>
                          <p className="mt-0.5 text-[10px] text-slate-400">{formatTime(txn.created_at, lang)}</p>
                        </td>
                        <td className="px-4 py-3">
                          <TransactionTypeBadge type={txn.type} />
                          {txn.reversal_of_id ? (
                            <p className="mt-1 text-[10px] text-slate-400">{t('supplier.reversalOf', { id: txn.reversal_of_id })}</p>
                          ) : null}
                          {txn.corrects_transaction_id ? (
                            <p className="mt-1 text-[10px] text-slate-400">{t('supplier.corrects', { id: txn.corrects_transaction_id })}</p>
                          ) : null}
                        </td>
                        <td className="max-w-[240px] px-4 py-3">
                          <p className="truncate text-xs text-slate-700" dir="auto">
                            {txn.description || t('common.notAvailable')}
                          </p>
                          {txn.reference_no ? (
                            <p className="mt-0.5 text-[10px] text-slate-400" dir="auto">
                              {t('supplier.ref')}: {txn.reference_no}
                            </p>
                          ) : null}
                          {txn.reversal_reason ? (
                            <p className="mt-0.5 text-[10px] text-red-500" dir="auto">
                              {t('common.reason')}: {txn.reversal_reason}
                            </p>
                          ) : null}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-right text-xs font-semibold tabular-nums text-red-600">
                          {txn.effect_paise > 0 ? formatCurrency(txn.amount_paise) : '—'}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-right text-xs font-semibold tabular-nums text-emerald-700">
                          {txn.effect_paise < 0 ? formatCurrency(txn.amount_paise) : '—'}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-right">
                          <Money paise={txn.balance_after_paise} colorize className="text-xs" />
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge status={txn.status} />
                        </td>
                        <td className="px-4 py-3">
                          {canChange ? (
                            <div className="flex items-center justify-end gap-1">
                              <button
                                type="button"
                                onClick={() => setCorrection(txn)}
                                className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-emerald-700"
                                title={t('supplier.correct')}
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => openReverse(txn)}
                                className="rounded-lg p-1.5 text-slate-400 transition hover:bg-red-50 hover:text-red-600"
                                title={t('supplier.reverse')}
                              >
                                <RotateCcw className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          ) : (
                            <span className="block text-right text-[10px] text-slate-300">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="divide-y divide-slate-100 md:hidden">
              {transactions.map((txn) => {
                const canChange = ['purchase', 'payment'].includes(txn.type) && txn.status === 'active';
                return (
                  <div key={txn.id} className={`p-4 ${txn.status === 'reversed' ? 'bg-red-50/20' : ''}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <TransactionTypeBadge type={txn.type} />
                        <p className="mt-2 break-words text-sm font-medium text-slate-800" dir="auto">
                          {txn.description || t('common.notAvailable')}
                        </p>
                        {txn.reference_no ? (
                          <p className="mt-0.5 text-[10px] text-slate-400" dir="auto">
                            {t('supplier.ref')}: {txn.reference_no}
                          </p>
                        ) : null}
                        <p className="mt-1 text-[10px] text-slate-400">
                          {formatDate(txn.txn_date, lang)} · {formatTime(txn.created_at, lang)}
                        </p>
                        {txn.reversal_reason ? (
                          <p className="mt-1 text-[10px] text-red-500" dir="auto">
                            {t('common.reason')}: {txn.reversal_reason}
                          </p>
                        ) : null}
                      </div>
                      <div className="shrink-0 text-right">
                        <p className={`text-sm font-bold tabular-nums ${txn.effect_paise >= 0 ? 'text-red-600' : 'text-emerald-700'}`}>
                          {txn.effect_paise >= 0 ? '+' : '−'} {formatCurrency(Math.abs(txn.effect_paise))}
                        </p>
                        <p className="mt-1 text-[10px] text-slate-400">{t('supplier.balanceAfter')}</p>
                        <Money paise={txn.balance_after_paise} colorize className="text-xs" />
                        <div className="mt-1.5">
                          <StatusBadge status={txn.status} />
                        </div>
                      </div>
                    </div>
                    {canChange ? (
                      <div className="mt-3 flex gap-2 border-t border-slate-100 pt-2.5">
                        <button
                          type="button"
                          onClick={() => setCorrection(txn)}
                          className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2.5 py-1.5 text-[11px] font-semibold text-slate-600"
                        >
                          <Pencil className="h-3 w-3" />
                          {t('supplier.correct')}
                        </button>
                        <button
                          type="button"
                          onClick={() => openReverse(txn)}
                          className="inline-flex items-center gap-1 rounded-lg bg-red-50 px-2.5 py-1.5 text-[11px] font-semibold text-red-600"
                        >
                          <RotateCcw className="h-3 w-3" />
                          {t('supplier.reverse')}
                        </button>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </Card>

      <SupplierFormModal
        open={supplierModal}
        onClose={() => setSupplierModal(false)}
        supplier={supplier}
        onSaved={load}
      />
      <TransactionFormModal
        open={Boolean(txnModal)}
        onClose={() => setTxnModal(null)}
        supplier={supplier}
        defaultType={txnModal || 'purchase'}
        onSaved={load}
      />
      <TransactionFormModal
        open={Boolean(correction)}
        onClose={() => setCorrection(null)}
        supplier={supplier}
        correction={correction}
        onSaved={load}
      />

      <Modal
        open={Boolean(reverseTxn)}
        onClose={() => setReverseTxn(null)}
        title={t('txn.reverseTitle')}
        subtitle={t('txn.reverseSub')}
        size="sm"
        footer={
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="secondary" onClick={() => setReverseTxn(null)} disabled={reversing}>
              {t('common.cancel')}
            </Button>
            <Button variant="danger" loading={reversing} onClick={submitReverse}>
              <RotateCcw className="h-4 w-4" />
              {t('txn.reverseConfirm')}
            </Button>
          </div>
        }
      >
        {reverseTxn ? (
          <div className="space-y-4">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5">
              <div className="flex flex-wrap items-center gap-2">
                <TransactionTypeBadge type={reverseTxn.type} />
                <span className="text-sm font-semibold text-slate-900">{formatCurrency(reverseTxn.amount_paise)}</span>
                <span className="text-xs text-slate-500">{formatDate(reverseTxn.txn_date, lang)}</span>
              </div>
              {reverseTxn.description ? (
                <p className="mt-1.5 text-xs text-slate-600" dir="auto">
                  {reverseTxn.description}
                </p>
              ) : null}
            </div>
            {reverseError ? (
              <div className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-700" dir="auto">
                {reverseError}
              </div>
            ) : null}
            <Field label={t('txn.reverseReason')} htmlFor="reverse-reason" required>
              <Textarea
                id="reverse-reason"
                value={reverseReason}
                onChange={(event) => setReverseReason(event.target.value)}
                placeholder={t('txn.reverseReasonPlaceholder')}
                dir="auto"
                maxLength={500}
                autoFocus
              />
            </Field>
          </div>
        ) : null}
      </Modal>

      <Modal
        open={archiveOpen}
        onClose={() => setArchiveOpen(false)}
        title={supplier.is_archived ? t('supplier.unarchive') : t('supplier.archive')}
        subtitle={supplier.is_archived ? undefined : t('supplier.archiveConfirm')}
        size="sm"
        footer={
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="secondary" onClick={() => setArchiveOpen(false)} disabled={archiving}>
              {t('common.cancel')}
            </Button>
            <Button variant={supplier.is_archived ? 'success' : 'dangerSoft'} loading={archiving} onClick={toggleArchive}>
              {supplier.is_archived ? <Undo2 className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
              {supplier.is_archived ? t('supplier.unarchive') : t('supplier.archive')}
            </Button>
          </div>
        }
      >
        <div className="flex items-start gap-3 rounded-xl bg-slate-50 p-3.5 text-sm leading-6 text-slate-600">
          {supplier.is_archived ? <Undo2 className="mt-0.5 h-4 w-4 shrink-0" /> : <Trash2 className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />}
          <p dir="auto">
            {supplier.is_archived
              ? t('app.footer')
              : t('supplier.archiveConfirm')}
          </p>
        </div>
      </Modal>

      <Modal
        open={deleteOpen}
        onClose={() => (deleting ? null : setDeleteOpen(false))}
        title={t('supplier.deleteTitle')}
        subtitle={t('supplier.deleteSub')}
        size="sm"
        footer={
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="secondary" onClick={() => setDeleteOpen(false)} disabled={deleting}>
              {t('common.cancel')}
            </Button>
            <Button
              variant="danger"
              loading={deleting}
              disabled={deleteConfirm.trim().toLocaleLowerCase() !== supplier.name.toLocaleLowerCase()}
              onClick={deleteSupplier}
            >
              <Trash2 className="h-4 w-4" />
              {t('supplier.deleteConfirm')}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-3.5 text-sm leading-6 text-red-700">
            <Trash2 className="mt-0.5 h-4 w-4 shrink-0" />
            <p dir="auto">
              {t('supplier.deleteWarning', {
                count: summary.transactionCount,
                balance: formatCurrency(Math.abs(summary.balance_paise))
              })}
            </p>
          </div>
          {deleteError ? (
            <div className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-700" dir="auto">
              {deleteError}
            </div>
          ) : null}
          <Field label={t('supplier.deleteConfirmLabel', { name: supplier.name })} htmlFor="delete-confirm-name" required>
            <Input
              id="delete-confirm-name"
              value={deleteConfirm}
              onChange={(event) => setDeleteConfirm(event.target.value)}
              placeholder={supplier.name}
              dir="auto"
              autoComplete="off"
              autoFocus
            />
          </Field>
        </div>
      </Modal>
    </div>
  );
}
