import { useEffect, useState } from 'react';
import { api, ApiError } from '../api.js';
import { useI18n } from '../context/I18nContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { Button, Field, Input, Textarea } from './UI.jsx';
import { Modal } from './Modal.jsx';

const emptyForm = { name: '', phone: '', address: '', notes: '', openingBalance: '' };

export function SupplierFormModal({ open, onClose, supplier = null, onSaved }) {
  const { t } = useI18n();
  const toast = useToast();
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const editing = Boolean(supplier);

  useEffect(() => {
    if (!open) return;
    setError('');
    setSaving(false);
    setForm(
      supplier
        ? {
            name: supplier.name || '',
            phone: supplier.phone || '',
            address: supplier.address || '',
            notes: supplier.notes || '',
            openingBalance: ''
          }
        : emptyForm
    );
  }, [open, supplier]);

  const update = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    if (!form.name.trim()) {
      setError(t('supplier.namePlaceholder'));
      return;
    }
    if (!editing && form.openingBalance) {
      const raw = String(form.openingBalance).trim();
      if (!/^\d{1,12}(\.\d{1,2})?$/.test(raw) || Number(raw) < 0) {
        setError(t('txn.amountInvalid'));
        return;
      }
    }
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        phone: form.phone.trim(),
        address: form.address.trim(),
        notes: form.notes.trim()
      };
      if (!editing) payload.openingBalance = form.openingBalance || 0;
      const data = await api(editing ? `/suppliers/${supplier.id}` : '/suppliers', {
        method: editing ? 'PATCH' : 'POST',
        body: payload
      });
      toast.success(editing ? t('supplier.updated') : t('supplier.saved'));
      onSaved?.(data.supplier);
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
      title={editing ? t('supplier.editTitle') : t('supplier.addTitle')}
      subtitle={editing ? t('supplier.editSub') : t('supplier.addSub')}
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" form="supplier-form" loading={saving}>
            {saving ? t('common.saving') : t('common.save')}
          </Button>
        </div>
      }
    >
      <form id="supplier-form" onSubmit={submit} className="space-y-4">
        {error ? (
          <div className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-700" dir="auto">
            {error}
          </div>
        ) : null}
        <Field label={t('common.name')} htmlFor="supplier-name" required>
          <Input
            id="supplier-name"
            value={form.name}
            onChange={update('name')}
            placeholder={t('supplier.namePlaceholder')}
            autoFocus
            dir="auto"
            maxLength={120}
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('common.phone')} htmlFor="supplier-phone">
            <Input
              id="supplier-phone"
              value={form.phone}
              onChange={update('phone')}
              placeholder={t('supplier.phonePlaceholder')}
              dir="auto"
              maxLength={40}
              inputMode="tel"
            />
          </Field>
          <Field label={t('common.address')} htmlFor="supplier-address">
            <Input
              id="supplier-address"
              value={form.address}
              onChange={update('address')}
              placeholder={t('supplier.addressPlaceholder')}
              dir="auto"
              maxLength={500}
            />
          </Field>
        </div>
        {!editing ? (
          <Field
            label={t('supplier.openingBalance')}
            htmlFor="supplier-opening"
            hint={t('supplier.openingHint')}
          >
            <Input
              id="supplier-opening"
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              value={form.openingBalance}
              onChange={update('openingBalance')}
              placeholder="0.00"
            />
          </Field>
        ) : null}
        <Field label={t('common.notes')} htmlFor="supplier-notes">
          <Textarea
            id="supplier-notes"
            value={form.notes}
            onChange={update('notes')}
            placeholder={t('supplier.notesPlaceholder')}
            dir="auto"
            maxLength={2000}
          />
        </Field>
      </form>
    </Modal>
  );
}
