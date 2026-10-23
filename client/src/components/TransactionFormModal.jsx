import { useEffect, useMemo, useState } from 'react';
import { ArrowDownLeft, ArrowUpRight, Info, RotateCcw } from 'lucide-react';
import { api, ApiError, newIdempotencyKey } from '../api.js';
import { useI18n } from '../context/I18nContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { Button, Field, Input, Select, Textarea, TransactionTypeBadge } from './UI.jsx';
import { Modal } from './Modal.jsx';
import { formatCurrency, parseClientAmount, todayPk } from '../lib/format.js';

const blank = {
  supplierId: '',
  type: 'purchase',
  amount: '',
  date: todayPk(),
  description: '',
  referenceNo: '',
  reason: ''
};

export function TransactionFormModal({
  open,
  onClose,
  supplier = null,
  defaultType = 'purchase',
  correction = null,
  onSaved
}) {
  const { t, lang } = useI18n();
  const toast = useToast();
  const [form, setForm] = useState(blank);
  const [suppliers, setSuppliers] = useState([]);
  const [loadingSuppliers, setLoadingSuppliers] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [idempotencyKey, setIdempotencyKey] = useState('');
  const isCorrection = Boolean(correction);

  useEffect(() => {
    if (!open) return;
    setError('');
    setSaving(false);
    setIdempotencyKey(newIdempotencyKey());
    setForm({
      ...blank,
      supplierId: supplier?.id ? String(supplier.id) : '',
      type: correction?.type || defaultType,
      amount: correction ? String(correction.amount ?? correction.amount_paise / 100) : '',
      date: correction?.txn_date || todayPk(),
      description: correction?.description || '',
      referenceNo: correction?.reference_no || '',
      reason: ''
    });
    if (!supplier && !isCorrection) {
      setLoadingSuppliers(true);
      api('/suppliers')
        .then((data) => setSuppliers(data.suppliers || []))
        .catch(() => setSuppliers([]))
        .finally(() => setLoadingSuppliers(false));
    }
  }, [open, supplier, defaultType, correction, isCorrection]);

  const update = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));

  const selectedSupplier = useMemo(() => {
    if (supplier) return supplier;
    return suppliers.find((item) => String(item.id) === String(form.supplierId)) || null;
  }, [supplier, suppliers, form.supplierId]);

  const title = isCorrection
    ? t('txn.correctTitle')
    : form.type === 'payment'
      ? t('txn.addPayment')
      : t('txn.addPurchase');
  const subtitle = isCorrection
    ? t('txn.correctSub')
    : form.type === 'payment'
      ? t('txn.addSubPayment')
      : t('txn.addSubPurchase');

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    const supplierId = supplier?.id || Number(form.supplierId);
    if (!supplierId) {
      setError(t('txn.supplierRequired'));
      return;
    }
    const amountPaise = parseClientAmount(form.amount);
    if (!amountPaise) {
      setError(t('txn.amountInvalid'));
      return;
    }
    if (!form.date) {
      setError(t('txn.dateRequired'));
      return;
    }
    if (isCorrection && form.reason.trim().length < 3) {
      setError(t('txn.reasonRequired'));
      return;
    }

    setSaving(true);
    try {
      const payload = {
        type: form.type,
        amount: Number(form.amount),
        date: form.date,
        description: form.description.trim(),
        referenceNo: form.referenceNo.trim(),
        idempotencyKey
      };
      let data;
      if (isCorrection) {
        data = await api(`/transactions/${correction.id}/correct`, {
          method: 'POST',
          body: { ...payload, reason: form.reason.trim() }
        });
      } else {
        data = await api('/transactions', {
          method: 'POST',
          body: { ...payload, supplierId }
        });
      }
      if (data.duplicate) toast.info(t('txn.duplicate'));
      else if (isCorrection) toast.success(t('txn.correctedOk'));
      else if (form.type === 'payment') toast.success(t('txn.savedPayment'));
      else toast.success(t('txn.savedPurchase'));
      onSaved?.(data.transaction);
      onClose?.();
    } catch (requestError) {
      if (requestError instanceof ApiError) {
        const detail = Array.isArray(requestError.details) ? requestError.details[0]?.message : '';
        setError(detail || requestError.message);
      } else {
        setError(t('error.generic'));
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      subtitle={subtitle}
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            {t('common.cancel')}
          </Button>
          <Button
            type="submit"
            form="transaction-form"
            loading={saving}
            variant={form.type === 'payment' ? 'success' : 'primary'}
          >
            {saving
              ? t('common.saving')
              : isCorrection
                ? t('txn.correctSave')
                : form.type === 'payment'
                  ? t('txn.savePayment')
                  : t('txn.savePurchase')}
          </Button>
        </div>
      }
    >
      <form id="transaction-form" onSubmit={submit} className="space-y-4">
        {error ? (
          <div className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-700" dir="auto">
            {error}
          </div>
        ) : null}

        {isCorrection ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3.5">
            <div className="flex items-start gap-2.5">
              <RotateCcw className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
              <div className="min-w-0 text-sm">
                <p className="font-semibold text-amber-900">{t('txn.originalEntry')}</p>
                <p className="mt-1 flex flex-wrap items-center gap-2 text-amber-800">
                  <TransactionTypeBadge type={correction.type} />
                  <span className="font-semibold">{formatCurrency(correction.amount_paise, { decimals: false })}</span>
                  <span>{correction.txn_date}</span>
                </p>
                {correction.description ? (
                  <p className="mt-1 break-words text-xs text-amber-800" dir="auto">
                    {correction.description}
                  </p>
                ) : null}
              </div>
            </div>
          </div>
        ) : null}

        {!supplier && !isCorrection ? (
          <Field label={t('txn.supplier')} htmlFor="txn-supplier" required>
            <Select
              id="txn-supplier"
              value={form.supplierId}
              onChange={update('supplierId')}
              disabled={loadingSuppliers}
              required
            >
              <option value="">{loadingSuppliers ? t('common.loading') : t('txn.selectSupplier')}</option>
              {suppliers.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name} — {formatCurrency(item.balance_paise, { decimals: false })}
                </option>
              ))}
            </Select>
          </Field>
        ) : (
          <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-3">
            <div className="min-w-0">
              <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{t('txn.supplier')}</p>
              <p className="truncate text-sm font-semibold text-slate-900" dir="auto">
                {selectedSupplier?.name || correction?.supplier_name || '—'}
              </p>
            </div>
            {selectedSupplier ? (
              <div className="text-right">
                <p className="text-[11px] text-slate-500">{t('common.balance')}</p>
                <p className="text-sm font-bold text-slate-900">{formatCurrency(selectedSupplier.balance_paise)}</p>
              </div>
            ) : null}
          </div>
        )}

        <div>
          <span className="label-base">{t('common.type')}</span>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setForm((current) => ({ ...current, type: 'purchase' }))}
              className={`flex items-center gap-2 rounded-xl border px-3 py-3 text-left transition ${
                form.type === 'purchase'
                  ? 'border-red-300 bg-red-50 text-red-800 ring-2 ring-red-100'
                  : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
              }`}
            >
              <ArrowUpRight className="h-4 w-4 shrink-0" />
              <span className="text-xs font-semibold leading-tight" dir="auto">
                {t('txn.type.purchase')}
              </span>
            </button>
            <button
              type="button"
              onClick={() => setForm((current) => ({ ...current, type: 'payment' }))}
              className={`flex items-center gap-2 rounded-xl border px-3 py-3 text-left transition ${
                form.type === 'payment'
                  ? 'border-emerald-300 bg-emerald-50 text-emerald-800 ring-2 ring-emerald-100'
                  : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
              }`}
            >
              <ArrowDownLeft className="h-4 w-4 shrink-0" />
              <span className="text-xs font-semibold leading-tight" dir="auto">
                {t('txn.type.payment')}
              </span>
            </button>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('txn.amount')} htmlFor="txn-amount" required>
            <div className="relative">
              <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-semibold text-slate-400">
                Rs.
              </span>
              <Input
                id="txn-amount"
                type="number"
                min="0.01"
                step="0.01"
                inputMode="decimal"
                value={form.amount}
                onChange={update('amount')}
                placeholder={t('txn.amountPlaceholder')}
                className="pl-11 text-lg font-semibold tabular-nums"
                autoFocus
                required
              />
            </div>
          </Field>
          <Field label={t('txn.date')} htmlFor="txn-date" required>
            <Input id="txn-date" type="date" value={form.date} onChange={update('date')} required />
          </Field>
        </div>

        <Field label={t('txn.description')} htmlFor="txn-description">
          <Input
            id="txn-description"
            value={form.description}
            onChange={update('description')}
            placeholder={t('txn.descriptionPlaceholder')}
            dir="auto"
            maxLength={1000}
          />
        </Field>

        <Field label={t('txn.reference')} htmlFor="txn-reference">
          <Input
            id="txn-reference"
            value={form.referenceNo}
            onChange={update('referenceNo')}
            placeholder={t('txn.referencePlaceholder')}
            dir="auto"
            maxLength={100}
          />
        </Field>

        {isCorrection ? (
          <Field label={t('txn.correctReason')} htmlFor="txn-reason" required>
            <Textarea
              id="txn-reason"
              value={form.reason}
              onChange={update('reason')}
              placeholder={t('txn.correctReasonPlaceholder')}
              dir="auto"
              maxLength={500}
              required
            />
          </Field>
        ) : null}

        <div className="flex items-start gap-2 rounded-xl bg-slate-50 px-3.5 py-3 text-xs leading-5 text-slate-500">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
          <span dir="auto">{t('txn.adjustsBalance')}</span>
        </div>
      </form>
    </Modal>
  );
}
