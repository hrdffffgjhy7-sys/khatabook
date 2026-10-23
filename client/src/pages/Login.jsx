import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BookOpenText,
  DatabaseBackup,
  Eye,
  EyeOff,
  FileClock,
  LockKeyhole,
  ShieldCheck,
  Wallet
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { useI18n } from '../context/I18nContext.jsx';
import { ApiError } from '../api.js';
import { Button, Field, Input } from '../components/UI.jsx';

export default function Login() {
  const { t, lang, setLang } = useI18n();
  const { login, setup, needsSetup } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ username: '', password: '', displayName: '', confirmPassword: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const update = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    if (!form.username.trim()) {
      setError(t('auth.usernameRequired'));
      return;
    }
    if (needsSetup) {
      if (!form.displayName.trim()) {
        setError(t('auth.displayNameRequired'));
        return;
      }
      if (form.password.length < 8) {
        setError(t('auth.passwordShort'));
        return;
      }
      if (form.password !== form.confirmPassword) {
        setError(t('auth.passwordMismatch'));
        return;
      }
    }
    if (!form.password) {
      setError(t('auth.passwordShort'));
      return;
    }
    setSubmitting(true);
    try {
      if (needsSetup) {
        await setup({
          username: form.username.trim(),
          password: form.password,
          displayName: form.displayName.trim()
        });
      } else {
        await login(form.username.trim(), form.password);
      }
      navigate('/', { replace: true });
    } catch (requestError) {
      if (requestError instanceof ApiError) {
        const detail = Array.isArray(requestError.details) ? requestError.details[0]?.message : '';
        setError(detail || requestError.message);
      } else {
        setError(needsSetup ? t('auth.setupFailed') : t('auth.loginFailed'));
      }
    } finally {
      setSubmitting(false);
    }
  };

  const features = [
    { icon: Wallet, title: 'Supplier ledgers', text: 'Every credit and payment, always reconciled.' },
    { icon: FileClock, title: 'Permanent audit trail', text: 'Corrections create reversal entries, never silent edits.' },
    { icon: DatabaseBackup, title: 'Verified backups', text: 'Download and restore the complete database safely.' }
  ];

  return (
    <div className="min-h-screen bg-slate-50 lg:grid lg:grid-cols-[1.05fr_0.95fr]">
      <div className="relative hidden overflow-hidden bg-emerald-950 p-10 lg:flex lg:flex-col lg:justify-between xl:p-14">
        <div className="absolute -right-24 -top-24 h-80 w-80 rounded-full bg-emerald-500/10 blur-3xl" />
        <div className="absolute -bottom-40 -left-24 h-96 w-96 rounded-full bg-emerald-400/10 blur-3xl" />
        <div className="relative">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/15 ring-1 ring-emerald-300/20">
              <BookOpenText className="h-7 w-7 text-emerald-300" />
            </div>
            <div>
              <p className="text-lg font-bold text-white" dir="auto">
                {t('app.name')}
              </p>
              <p className="text-xs text-emerald-200/70" dir="auto">
                {t('app.tagline')}
              </p>
            </div>
          </div>
          <div className="mt-20 max-w-lg">
            <span className="inline-flex items-center gap-2 rounded-full border border-emerald-300/20 bg-emerald-300/10 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-emerald-200">
              <ShieldCheck className="h-3.5 w-3.5" />
              {t('app.secure')}
            </span>
            <h1 className="mt-5 text-4xl font-bold leading-tight tracking-tight text-white xl:text-5xl" dir="auto">
              {t('auth.loginTitle')}
            </h1>
            <p className="mt-4 max-w-md text-base leading-7 text-emerald-100/65" dir="auto">
              {t('app.tagline')}.
            </p>
          </div>
          <div className="mt-12 space-y-4">
            {features.map(({ icon: Icon, title, text }) => (
              <div key={title} className="flex items-start gap-3.5 rounded-2xl border border-white/10 bg-white/5 p-4">
                <span className="rounded-xl bg-emerald-400/10 p-2 text-emerald-300">
                  <Icon className="h-5 w-5" />
                </span>
                <div>
                  <p className="text-sm font-semibold text-white">{title}</p>
                  <p className="mt-0.5 text-xs leading-5 text-emerald-100/55">{text}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
        <p className="relative text-[11px] text-emerald-200/40">{t('app.footer')}</p>
      </div>

      <div className="flex min-h-screen flex-col bg-white lg:min-h-0">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 lg:border-0 lg:px-10 lg:py-6">
          <div className="flex items-center gap-2.5 lg:hidden">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-700">
              <BookOpenText className="h-5 w-5 text-white" />
            </div>
            <span className="text-sm font-bold text-slate-900" dir="auto">
              {t('app.name')}
            </span>
          </div>
          <div className="ml-auto inline-flex items-center rounded-lg bg-slate-100 p-0.5 text-[11px] font-semibold text-slate-600">
            <button
              type="button"
              onClick={() => setLang('en')}
              className={`rounded-md px-2.5 py-1.5 ${lang === 'en' ? 'bg-white shadow-sm' : ''}`}
            >
              English
            </button>
            <button
              type="button"
              onClick={() => setLang('ur')}
              className={`rounded-md px-2.5 py-1.5 ${lang === 'ur' ? 'bg-white shadow-sm' : ''}`}
            >
              اردو
            </button>
          </div>
        </div>

        <div className="flex flex-1 items-center justify-center px-5 py-10 sm:px-8 lg:py-12">
          <div className="w-full max-w-md">
            <div className="mb-8">
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100">
                <LockKeyhole className="h-6 w-6" />
              </div>
              <h2 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl" dir="auto">
                {needsSetup ? t('auth.setupTitle') : t('auth.loginTitle')}
              </h2>
              <p className="mt-2 text-sm leading-6 text-slate-500" dir="auto">
                {needsSetup ? t('auth.setupSubtitle') : t('auth.loginSubtitle')}
              </p>
            </div>

            {needsSetup ? (
              <div className="mb-5 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-3 text-xs leading-5 text-emerald-800" dir="auto">
                {t('auth.setupNote')}
              </div>
            ) : null}

            {error ? (
              <div className="mb-5 rounded-xl border border-red-200 bg-red-50 px-3.5 py-3 text-sm leading-6 text-red-700" dir="auto">
                {error}
              </div>
            ) : null}

            <form onSubmit={handleSubmit} className="space-y-4">
              {needsSetup ? (
                <Field label={t('auth.displayName')} htmlFor="display-name" required>
                  <Input
                    id="display-name"
                    value={form.displayName}
                    onChange={update('displayName')}
                    placeholder={t('auth.displayName')}
                    autoComplete="name"
                    dir="auto"
                    autoFocus
                    maxLength={80}
                  />
                </Field>
              ) : null}

              <Field label={t('auth.username')} htmlFor="username" required>
                <Input
                  id="username"
                  value={form.username}
                  onChange={update('username')}
                  placeholder={t('auth.username')}
                  autoComplete="username"
                  autoCapitalize="none"
                  spellCheck={false}
                  autoFocus={!needsSetup}
                  dir="ltr"
                  maxLength={50}
                />
              </Field>

              <Field label={t('auth.password')} htmlFor="password" required>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    value={form.password}
                    onChange={update('password')}
                    placeholder={t('auth.password')}
                    autoComplete={needsSetup ? 'new-password' : 'current-password'}
                    className="pr-11"
                    dir="ltr"
                    maxLength={128}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((value) => !value)}
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </Field>

              {needsSetup ? (
                <Field label={t('auth.confirmPassword')} htmlFor="confirm-password" required>
                  <Input
                    id="confirm-password"
                    type={showPassword ? 'text' : 'password'}
                    value={form.confirmPassword}
                    onChange={update('confirmPassword')}
                    placeholder={t('auth.confirmPassword')}
                    autoComplete="new-password"
                    dir="ltr"
                    maxLength={128}
                  />
                </Field>
              ) : null}

              <Button type="submit" size="lg" className="w-full" loading={submitting}>
                {submitting
                  ? needsSetup
                    ? t('auth.creating')
                    : t('auth.signingIn')
                  : needsSetup
                    ? t('auth.createAccount')
                    : t('auth.signIn')}
              </Button>
            </form>

            <p className="mt-6 text-center text-[11px] leading-5 text-slate-400" dir="auto">
              {t('auth.securityNote')}
            </p>
          </div>
        </div>
        <div className="border-t border-slate-100 px-5 py-4 text-center text-[11px] text-slate-400 lg:px-10">
          {t('app.name')} · Asia/Karachi
        </div>
      </div>
    </div>
  );
}
