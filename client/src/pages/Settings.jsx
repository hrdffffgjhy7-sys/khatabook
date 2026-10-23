import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  Building2,
  Database,
  HardDrive,
  KeyRound,
  Languages,
  ShieldCheck,
  Trash2
} from 'lucide-react';
import { api } from '../api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useI18n } from '../context/I18nContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { Modal } from '../components/Modal.jsx';
import {
  Badge,
  Button,
  Card,
  Field,
  Input,
  LoadingBlock,
  PageHeader,
  SectionTitle
} from '../components/UI.jsx';
import { formatFileSize } from '../lib/format.js';

export default function Settings() {
  const { t, lang, setLang } = useI18n();
  const { user, logout } = useAuth();
  const toast = useToast();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [shop, setShop] = useState({ shopName: '', shopPhone: '', shopAddress: '' });
  const [savingShop, setSavingShop] = useState(false);
  const [shopError, setShopError] = useState('');
  const [passwords, setPasswords] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  const [removeOpen, setRemoveOpen] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [removing, setRemoving] = useState(false);
  const [removeError, setRemoveError] = useState('');

  const load = async () => {
    setLoading(true);
    setLoadError('');
    try {
      const result = await api('/settings');
      setData(result);
      setShop({
        shopName: result.settings.shop_name || '',
        shopPhone: result.settings.shop_phone || '',
        shopAddress: result.settings.shop_address || ''
      });
    } catch (requestError) {
      setLoadError(requestError.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const saveShop = async (event) => {
    event.preventDefault();
    if (!shop.shopName.trim()) {
      setShopError(t('common.required'));
      return;
    }
    setSavingShop(true);
    setShopError('');
    try {
      const result = await api('/settings', { method: 'PATCH', body: shop });
      setData((current) => (current ? { ...current, settings: result.settings } : current));
      toast.success(t('settings.saved'));
    } catch (requestError) {
      setShopError(requestError.message || t('settings.savedError'));
    } finally {
      setSavingShop(false);
    }
  };

  const changePassword = async (event) => {
    event.preventDefault();
    if (passwords.newPassword.length < 8) {
      setPasswordError(t('auth.passwordShort'));
      return;
    }
    if (passwords.newPassword !== passwords.confirmPassword) {
      setPasswordError(t('auth.passwordMismatch'));
      return;
    }
    setSavingPassword(true);
    setPasswordError('');
    try {
      await api('/auth/change-password', {
        method: 'POST',
        body: {
          currentPassword: passwords.currentPassword,
          newPassword: passwords.newPassword
        }
      });
      setPasswords({ currentPassword: '', newPassword: '', confirmPassword: '' });
      toast.success(t('settings.passwordChanged'));
    } catch (requestError) {
      setPasswordError(requestError.message);
    } finally {
      setSavingPassword(false);
    }
  };

  const removeTestData = async () => {
    if (confirmText !== 'DELETE TEST DATA') {
      setRemoveError(t('settings.confirmPhrase'));
      return;
    }
    setRemoving(true);
    setRemoveError('');
    try {
      await api('/settings/test-data', { method: 'DELETE', body: { confirmation: confirmText } });
      toast.success(t('settings.testRemoved'));
      setRemoveOpen(false);
      setConfirmText('');
      await load();
    } catch (requestError) {
      setRemoveError(requestError.message);
    } finally {
      setRemoving(false);
    }
  };

  if (loading) return <LoadingBlock />;
  if (loadError) {
    return (
      <div className="animate-fade-in">
        <PageHeader title={t('settings.title')} subtitle={t('settings.subtitle')} />
        <Card className="border-red-200 p-5">
          <p className="text-sm text-red-700" dir="auto">{loadError || t('settings.loadError')}</p>
          <Button variant="secondary" className="mt-4" onClick={load}>{t('common.refresh')}</Button>
        </Card>
      </div>
    );
  }

  const testData = data.system.testData;
  const hasTestData = testData.suppliers > 0 || testData.transactions > 0;

  return (
    <div className="animate-fade-in">
      <PageHeader title={t('settings.title')} subtitle={t('settings.subtitle')} />

      <div className="grid gap-5 xl:grid-cols-3">
        <div className="space-y-5 xl:col-span-2">
          <Card className="p-4 sm:p-6">
            <SectionTitle title={t('settings.shopDetails')} subtitle={t('settings.aboutText')} />
            <form onSubmit={saveShop} className="mt-5 space-y-4">
              <Field label={t('settings.shopName')} htmlFor="shop-name" required>
                <Input
                  id="shop-name"
                  value={shop.shopName}
                  onChange={(event) => setShop({ ...shop, shopName: event.target.value })}
                  maxLength={120}
                  dir="auto"
                />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label={t('settings.shopPhone')} htmlFor="shop-phone">
                  <Input
                    id="shop-phone"
                    value={shop.shopPhone}
                    onChange={(event) => setShop({ ...shop, shopPhone: event.target.value })}
                    maxLength={40}
                    dir="ltr"
                  />
                </Field>
                <Field label={t('settings.shopAddress')} htmlFor="shop-address">
                  <Input
                    id="shop-address"
                    value={shop.shopAddress}
                    onChange={(event) => setShop({ ...shop, shopAddress: event.target.value })}
                    maxLength={300}
                    dir="auto"
                  />
                </Field>
              </div>
              {shopError ? <p className="text-xs text-red-600" dir="auto">{shopError}</p> : null}
              <div className="flex justify-end">
                <Button type="submit" loading={savingShop}>
                  {savingShop ? t('common.saving') : t('common.save')}
                </Button>
              </div>
            </form>
          </Card>

          <Card className="p-4 sm:p-6">
            <div className="flex items-start gap-3">
              <span className="rounded-xl bg-sky-50 p-2.5 text-sky-700">
                <KeyRound className="h-5 w-5" />
              </span>
              <SectionTitle title={t('settings.security')} subtitle={t('settings.securitySub')} />
            </div>
            <form onSubmit={changePassword} className="mt-5 space-y-4">
              <Field label={t('auth.currentPassword')} htmlFor="current-password" required>
                <Input
                  id="current-password"
                  type="password"
                  autoComplete="current-password"
                  value={passwords.currentPassword}
                  onChange={(event) => setPasswords({ ...passwords, currentPassword: event.target.value })}
                  dir="ltr"
                />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label={t('auth.newPassword')} htmlFor="new-password" required>
                  <Input
                    id="new-password"
                    type="password"
                    autoComplete="new-password"
                    value={passwords.newPassword}
                    onChange={(event) => setPasswords({ ...passwords, newPassword: event.target.value })}
                    dir="ltr"
                  />
                </Field>
                <Field label={t('auth.confirmPassword')} htmlFor="confirm-password" required>
                  <Input
                    id="confirm-password"
                    type="password"
                    autoComplete="new-password"
                    value={passwords.confirmPassword}
                    onChange={(event) => setPasswords({ ...passwords, confirmPassword: event.target.value })}
                    dir="ltr"
                  />
                </Field>
              </div>
              {passwordError ? <p className="text-xs text-red-600" dir="auto">{passwordError}</p> : null}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="max-w-md text-[11px] leading-5 text-slate-500" dir="auto">{t('auth.securityNote')}</p>
                <Button type="submit" loading={savingPassword}>
                  <ShieldCheck className="h-4 w-4" />
                  {savingPassword ? t('common.saving') : t('auth.changePassword')}
                </Button>
              </div>
            </form>
          </Card>

          <Card className="p-4 sm:p-6">
            <SectionTitle title={t('settings.testData')} subtitle={t('settings.testDataSub')} />
            <div className="mt-4 flex flex-col gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <span className="rounded-lg bg-white p-2 text-slate-500 shadow-sm">
                  <Trash2 className="h-4 w-4" />
                </span>
                <div>
                  <p className="text-sm font-semibold text-slate-800">
                    {hasTestData ? t('common.test') : t('settings.noTestData')}
                  </p>
                  {hasTestData ? (
                    <p className="mt-0.5 text-xs text-slate-500">
                      {t('settings.testDataCount', { suppliers: testData.suppliers, transactions: testData.transactions })}
                    </p>
                  ) : null}
                </div>
              </div>
              <Button
                variant="dangerSoft"
                size="sm"
                disabled={!hasTestData}
                onClick={() => {
                  setRemoveOpen(true);
                  setConfirmText('');
                  setRemoveError('');
                }}
              >
                <Trash2 className="h-3.5 w-3.5" />
                {t('settings.removeTest')}
              </Button>
            </div>
          </Card>
        </div>

        <div className="space-y-5">
          <Card className="p-4 sm:p-5">
            <div className="flex items-center gap-2.5">
              <Languages className="h-4 w-4 text-slate-400" />
              <SectionTitle title={t('settings.language')} subtitle={t('settings.languageSub')} />
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setLang('en')}
                className={`rounded-xl border px-3 py-2.5 text-sm font-semibold transition ${
                  lang === 'en'
                    ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                }`}
              >
                {t('common.english')}
              </button>
              <button
                type="button"
                onClick={() => setLang('ur')}
                className={`rounded-xl border px-3 py-2.5 text-sm font-semibold transition ${
                  lang === 'ur'
                    ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                }`}
              >
                {t('common.urdu')}
              </button>
            </div>
          </Card>

          <Card className="p-4 sm:p-5">
            <SectionTitle title={t('settings.system')} />
            <dl className="mt-4 space-y-3 text-xs">
              <div className="flex items-center justify-between gap-3">
                <dt className="text-slate-500">{t('settings.version')}</dt>
                <dd className="font-semibold text-slate-800">{data.system.version}</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-slate-500">{t('settings.environment')}</dt>
                <dd><Badge tone="slate">{data.system.environment}</Badge></dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-slate-500">{t('settings.timezone')}</dt>
                <dd className="font-semibold text-slate-800">{data.system.timezone}</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-slate-500">{t('settings.autoBackup')}</dt>
                <dd>
                  <Badge tone={data.system.automaticBackups.enabled ? 'green' : 'slate'}>
                    {data.system.automaticBackups.enabled
                      ? `${data.system.automaticBackups.dailyAt}`
                      : t('backup.disabled')}
                  </Badge>
                </dd>
              </div>
              <div className="border-t border-slate-100 pt-3">
                <dt className="flex items-center gap-1.5 text-slate-500">
                  <Database className="h-3.5 w-3.5" />
                  {t('settings.database')}
                </dt>
                <dd className="mt-1 break-all font-mono text-[10px] leading-5 text-slate-600">
                  {data.system.database.path}
                </dd>
                <dd className="mt-1 flex items-center gap-2">
                  <span className="text-slate-500">{formatFileSize(data.system.database.sizeBytes)}</span>
                  <Badge tone={data.system.database.quickCheck === 'ok' ? 'green' : 'red'}>
                    {data.system.database.quickCheck}
                  </Badge>
                </dd>
              </div>
            </dl>
            <p className="mt-3 text-[10px] text-slate-400" dir="auto">{t('settings.dateFormat')}</p>
          </Card>

          <Card className="p-4 sm:p-5">
            <div className="space-y-2">
              <Link
                to="/backups"
                className="flex items-center justify-between rounded-xl border border-slate-200 px-3 py-2.5 text-xs font-semibold text-slate-700 transition hover:border-emerald-200 hover:bg-emerald-50"
              >
                <span className="flex items-center gap-2">
                  <HardDrive className="h-4 w-4 text-emerald-600" />
                  {t('settings.backupLink')}
                </span>
                <ArrowRight className="h-4 w-4 text-slate-400" />
              </Link>
              <Link
                to="/audit"
                className="flex items-center justify-between rounded-xl border border-slate-200 px-3 py-2.5 text-xs font-semibold text-slate-700 transition hover:border-emerald-200 hover:bg-emerald-50"
              >
                <span className="flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-emerald-600" />
                  {t('settings.auditLink')}
                </span>
                <ArrowRight className="h-4 w-4 text-slate-400" />
              </Link>
            </div>
          </Card>

          <Card className="bg-slate-900 p-4 text-white sm:p-5">
            <div className="flex items-center gap-2 text-sm font-bold">
              <Building2 className="h-4 w-4 text-emerald-400" />
              {t('settings.about')}
            </div>
            <p className="mt-2 text-xs leading-6 text-slate-300" dir="auto">{t('settings.aboutText')}</p>
            <p className="mt-3 text-[10px] text-slate-400">
              {user?.displayName ? `${user.displayName} · @${user.username}` : ''}
            </p>
            <button
              type="button"
              onClick={logout}
              className="mt-3 text-[11px] font-semibold text-emerald-300 hover:text-emerald-200"
            >
              {t('auth.logout')}
            </button>
          </Card>
        </div>
      </div>

      <Modal
        open={removeOpen}
        onClose={() => !removing && setRemoveOpen(false)}
        title={t('settings.removeTestTitle')}
        subtitle={t('settings.removeTestSub')}
        size="sm"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setRemoveOpen(false)} disabled={removing}>
              {t('common.cancel')}
            </Button>
            <Button
              variant="danger"
              onClick={removeTestData}
              loading={removing}
              disabled={confirmText !== 'DELETE TEST DATA'}
            >
              {t('settings.remove')}
            </Button>
          </div>
        }
      >
        <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs leading-5 text-red-700" dir="auto">
          {t('settings.removeTestSub')}
        </div>
        <div className="mt-4">
          <Field label={t('settings.confirmPhrase')} htmlFor="delete-test-confirmation" required>
            <Input
              id="delete-test-confirmation"
              value={confirmText}
              onChange={(event) => setConfirmText(event.target.value)}
              placeholder="DELETE TEST DATA"
              dir="ltr"
              autoComplete="off"
            />
          </Field>
        </div>
        {removeError ? <p className="mt-2 text-xs text-red-600">{removeError}</p> : null}
      </Modal>
    </div>
  );
}
