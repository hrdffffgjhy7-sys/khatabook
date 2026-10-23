import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  Database,
  Download,
  HardDrive,
  RefreshCw,
  ShieldCheck,
  Upload,
  Usb
} from 'lucide-react';
import { api, downloadFile } from '../api.js';
import { useI18n } from '../context/I18nContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import {
  Badge,
  Button,
  Card,
  Checkbox,
  EmptyState,
  ErrorState,
  Field,
  Input,
  LoadingBlock,
  PageHeader,
  SectionTitle
} from '../components/UI.jsx';
import { daysSince, formatDateTime, formatFileSize } from '../lib/format.js';

export default function Backups() {
  const { t, lang } = useI18n();
  const toast = useToast();
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [downloading, setDownloading] = useState(false);
  const [file, setFile] = useState(null);
  const [validating, setValidating] = useState(false);
  const [validation, setValidation] = useState(null);
  const [validationError, setValidationError] = useState('');
  const [acknowledge, setAcknowledge] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [restoring, setRestoring] = useState(false);
  const [restoreError, setRestoreError] = useState('');
  const [restoreSuccess, setRestoreSuccess] = useState(false);
  const [fileInputKey, setFileInputKey] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const result = await api('/backups/status');
      setStatus(result);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const lastBackupDays = status?.lastBackup ? daysSince(status.lastBackup.created_at) : null;
  const healthy = lastBackupDays !== null && lastBackupDays <= 2;

  const createBackup = async () => {
    setDownloading(true);
    try {
      await downloadFile('/backups/download', `hisab-backup-${Date.now()}.sqlite`);
      toast.success(t('backup.downloaded'));
      await load();
    } catch (requestError) {
      toast.error(requestError.message || t('error.generic'));
    } finally {
      setDownloading(false);
    }
  };

  const downloadExisting = async (row) => {
    try {
      await downloadFile(`/backups/files/${row.id}/download`, row.filename);
    } catch (requestError) {
      toast.error(requestError.message || t('error.generic'));
    }
  };

  const onFileChange = (event) => {
    const selected = event.target.files?.[0] || null;
    setFile(selected);
    setValidation(null);
    setValidationError('');
    setAcknowledge(false);
    setConfirmText('');
    setRestoreError('');
  };

  const validateFile = async () => {
    if (!file) {
      setValidationError(t('backup.chooseFile'));
      return;
    }
    setValidating(true);
    setValidation(null);
    setValidationError('');
    try {
      const formData = new FormData();
      formData.append('backup', file);
      const result = await api('/backups/validate', { method: 'POST', body: formData });
      setValidation(result);
    } catch (requestError) {
      setValidationError(requestError.message || t('backup.restoreFailed'));
    } finally {
      setValidating(false);
    }
  };

  const restore = async () => {
    if (!file || !validation || !acknowledge || confirmText !== 'RESTORE') {
      setRestoreError(t('backup.restoreConfirmRequired'));
      return;
    }
    setRestoring(true);
    setRestoreError('');
    try {
      const formData = new FormData();
      formData.append('backup', file);
      formData.append('confirmation', confirmText);
      formData.append('acknowledgeOverwrite', 'true');
      await api('/backups/restore', { method: 'POST', body: formData });
      setRestoreSuccess(true);
      toast.success(t('backup.restoreSuccess'));
      window.setTimeout(() => window.location.assign('/'), 1800);
    } catch (requestError) {
      setRestoreError(requestError.message || t('backup.restoreFailed'));
      setRestoring(false);
    }
  };

  const historyRows = useMemo(() => status?.history || [], [status]);

  if (loading) return <LoadingBlock />;
  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!status) return null;

  return (
    <div className="animate-fade-in">
      <PageHeader
        title={t('backup.title')}
        subtitle={t('backup.subtitle')}
        actions={
          <>
            <Button variant="secondary" onClick={load}>
              <RefreshCw className="h-4 w-4" />
              {t('backup.refresh')}
            </Button>
            <Button onClick={createBackup} loading={downloading}>
              <Download className="h-4 w-4" />
              {downloading ? t('backup.downloading') : t('backup.download')}
            </Button>
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t('backup.lastBackup')}</p>
            <span className={`rounded-lg p-2 ${healthy ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
              <CheckCircle2 className="h-4 w-4" />
            </span>
          </div>
          <p className="mt-2 text-sm font-bold text-slate-900">
            {status.lastBackup ? formatDateTime(status.lastBackup.created_at, lang) : t('backup.never')}
          </p>
          <p className="mt-1 text-[11px] text-slate-500">
            {status.lastBackup ? t(`backup.trigger.${status.lastBackup.trigger_type}`) : t('dashboard.noBackup')}
          </p>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t('backup.autoBackup')}</p>
            <span className="rounded-lg bg-sky-50 p-2 text-sky-700">
              <CalendarClock className="h-4 w-4" />
            </span>
          </div>
          <div className="mt-2 flex items-center gap-2">
            <p className="text-sm font-bold text-slate-900">
              {status.automatic.enabled ? t('backup.enabled') : t('backup.disabled')}
            </p>
            <Badge tone={status.automatic.enabled ? 'green' : 'slate'}>
              {status.automatic.dailyAt} {status.automatic.timezone}
            </Badge>
          </div>
          <p className="mt-1 text-[11px] text-slate-500">
            {t('backup.nextRun')}: {status.automatic.nextRun ? formatDateTime(status.automatic.nextRun, lang) : '—'}
          </p>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t('backup.databaseSize')}</p>
            <span className="rounded-lg bg-slate-100 p-2 text-slate-600">
              <Database className="h-4 w-4" />
            </span>
          </div>
          <p className="mt-2 text-sm font-bold text-slate-900">{formatFileSize(status.storage.databaseSizeBytes)}</p>
          <p className="mt-1 truncate text-[11px] text-slate-500" title={status.storage.databasePath}>
            {status.storage.databasePath}
          </p>
        </Card>

        <Card className={`p-4 ${healthy ? 'border-emerald-200 bg-emerald-50/50' : 'border-amber-200 bg-amber-50/50'}`}>
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t('backup.status')}</p>
            <span className={`rounded-lg p-2 ${healthy ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
              <ShieldCheck className="h-4 w-4" />
            </span>
          </div>
          <p className={`mt-2 text-sm font-bold ${healthy ? 'text-emerald-800' : 'text-amber-800'}`}>
            {healthy ? t('backup.statusOk') : t('backup.statusWarn')}
          </p>
          <p className="mt-1 text-[11px] text-slate-600">
            {t('backup.retention')}: {t('backup.days', { days: status.automatic.retentionDays })}
          </p>
        </Card>
      </div>

      <Card className="mt-4 border-amber-200 bg-amber-50/60 p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <span className="rounded-xl bg-amber-100 p-2 text-amber-700">
            <Usb className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-sm font-bold text-amber-900">{t('backup.localTitle')}</h2>
            <p className="mt-1 max-w-4xl text-xs leading-6 text-amber-800" dir="auto">
              {t('backup.localNote')}
            </p>
            <p className="mt-2 break-all rounded-lg bg-white/60 px-2.5 py-1.5 font-mono text-[10px] text-amber-900">
              {status.storage.serverBackupDirectory}
            </p>
          </div>
        </div>
      </Card>

      {status.lastFailure ? (
        <div className="mt-4 flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
          <div>
            <p className="text-xs font-semibold text-red-800">{t('backup.lastFailure')}</p>
            <p className="mt-0.5 text-xs text-red-700">
              {formatDateTime(status.lastFailure.created_at, lang)} · {status.lastFailure.note || status.lastFailure.filename}
            </p>
          </div>
        </div>
      ) : null}

      <div className="mt-5 grid gap-5 xl:grid-cols-2">
        <Card className="overflow-hidden">
          <div className="border-b border-slate-100 px-4 py-4 sm:px-5">
            <SectionTitle title={t('backup.history')} subtitle={t('backup.historySub')} />
          </div>
          {historyRows.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[600px]">
                <thead>
                  <tr className="table-head">
                    <th className="px-4 py-3">{t('common.date')}</th>
                    <th className="px-4 py-3">{t('backup.trigger')}</th>
                    <th className="px-4 py-3">{t('backup.size')}</th>
                    <th className="px-4 py-3">{t('backup.status')}</th>
                    <th className="px-4 py-3 text-right">{t('common.download')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {historyRows.map((row) => (
                    <tr key={row.id} className="hover:bg-slate-50/60">
                      <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-600">
                        {formatDateTime(row.created_at, lang)}
                      </td>
                      <td className="px-4 py-3">
                        <Badge tone={row.trigger_type === 'auto' ? 'blue' : row.trigger_type === 'pre-restore' ? 'amber' : 'slate'}>
                          {t(`backup.trigger.${row.trigger_type}`)}
                        </Badge>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-600">{formatFileSize(row.size_bytes)}</td>
                      <td className="px-4 py-3">
                        <Badge tone={row.status === 'success' ? 'green' : 'red'}>
                          {row.status === 'success' ? t('backup.success') : t('backup.failed')}
                        </Badge>
                        {row.status === 'success' && !row.available ? (
                          <p className="mt-1 text-[10px] text-red-500">{t('backup.fileMissing')}</p>
                        ) : null}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {row.status === 'success' && row.available ? (
                          <button
                            type="button"
                            onClick={() => downloadExisting(row)}
                            className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-[11px] font-semibold text-emerald-700 hover:bg-emerald-50"
                          >
                            <Download className="h-3.5 w-3.5" />
                            {t('backup.downloadFile')}
                          </button>
                        ) : (
                          <span className="text-[10px] text-slate-300">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState icon={HardDrive} title={t('backup.noHistory')} />
          )}
        </Card>

        <Card className="p-4 sm:p-5">
          <SectionTitle title={t('backup.restoreTitle')} subtitle={t('backup.restoreSub')} />

          <div className="mt-5 rounded-xl border border-red-200 bg-red-50/60 p-3.5">
            <div className="flex items-start gap-2.5">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
              <p className="text-xs leading-5 text-red-800" dir="auto">{t('backup.warningText')}</p>
            </div>
          </div>

          {restoreSuccess ? (
            <div className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-800">
              {t('backup.restoreSuccess')}
            </div>
          ) : (
            <>
              <div className="mt-5">
                <label className="label-base" htmlFor="backup-file">{t('backup.chooseFile')}</label>
                <input
                  key={fileInputKey}
                  id="backup-file"
                  type="file"
                  accept=".sqlite,.sqlite3,.db,.backup"
                  onChange={onFileChange}
                  className="block w-full cursor-pointer rounded-xl border border-slate-300 bg-white text-xs text-slate-500 file:mr-3 file:cursor-pointer file:border-0 file:bg-slate-100 file:px-3 file:py-2.5 file:text-xs file:font-semibold file:text-slate-700 hover:file:bg-slate-200"
                />
                {file ? (
                  <p className="mt-1.5 text-[11px] text-slate-500">
                    {file.name} · {formatFileSize(file.size)}
                  </p>
                ) : null}
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                <Button variant="secondary" onClick={validateFile} loading={validating} disabled={!file}>
                  <Upload className="h-4 w-4" />
                  {validating ? t('backup.validating') : t('backup.validate')}
                </Button>
                {validation ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setFile(null);
                      setValidation(null);
                      setFileInputKey((key) => key + 1);
                      setConfirmText('');
                      setAcknowledge(false);
                    }}
                  >
                    {t('common.reset')}
                  </Button>
                ) : null}
              </div>

              {validationError ? (
                <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs text-red-700" dir="auto">
                  {validationError}
                </div>
              ) : null}

              {validation ? (
                <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3.5">
                  <div className="flex items-center gap-2 text-sm font-semibold text-emerald-800">
                    <CheckCircle2 className="h-4 w-4" />
                    {t('backup.valid')}
                  </div>
                  <p className="mt-1 text-xs text-emerald-700">
                    {t('backup.validationResult', {
                      suppliers: validation.suppliers,
                      transactions: validation.transactions,
                      users: validation.users
                    })}
                  </p>
                  <p className="mt-0.5 text-[11px] text-emerald-600">{t('backup.integrityOk')}</p>
                </div>
              ) : null}

              {validation ? (
                <div className="mt-4 space-y-3 border-t border-slate-200 pt-4">
                  <Checkbox
                    checked={acknowledge}
                    onChange={(event) => setAcknowledge(event.target.checked)}
                    label={t('backup.acknowledge')}
                  />
                  <Field label={t('backup.confirmLabel')} htmlFor="restore-confirmation">
                    <Input
                      id="restore-confirmation"
                      value={confirmText}
                      onChange={(event) => setConfirmText(event.target.value)}
                      placeholder="RESTORE"
                      autoComplete="off"
                      dir="ltr"
                    />
                  </Field>
                  {restoreError ? (
                    <div className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs text-red-700" dir="auto">
                      {restoreError}
                    </div>
                  ) : null}
                  <Button
                    variant="danger"
                    className="w-full"
                    loading={restoring}
                    disabled={!acknowledge || confirmText !== 'RESTORE'}
                    onClick={restore}
                  >
                    <Upload className="h-4 w-4" />
                    {restoring ? t('backup.restoring') : t('backup.restore')}
                  </Button>
                </div>
              ) : null}
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
