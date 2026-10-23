import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  ArrowLeftRight,
  BarChart3,
  BookOpenText,
  DatabaseBackup,
  History,
  LayoutDashboard,
  Languages,
  LogOut,
  Menu,
  Settings as SettingsIcon,
  Users,
  X
} from 'lucide-react';
import { useI18n } from '../context/I18nContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { cn } from '../lib/format.js';

const navItems = [
  { to: '/', key: 'nav.dashboard', icon: LayoutDashboard, end: true },
  { to: '/suppliers', key: 'nav.suppliers', icon: Users },
  { to: '/transactions', key: 'nav.transactions', icon: ArrowLeftRight },
  { to: '/reports', key: 'nav.reports', icon: BarChart3 },
  { to: '/backups', key: 'nav.backups', icon: DatabaseBackup },
  { to: '/audit', key: 'nav.audit', icon: History },
  { to: '/settings', key: 'nav.settings', icon: SettingsIcon }
];

const mobileMain = navItems.slice(0, 4);
const mobileMore = navItems.slice(4);

export function Brand({ compact = false, light = false }) {
  const { t } = useI18n();
  return (
    <div className="flex min-w-0 items-center gap-3">
      <div
        className={cn(
          'flex shrink-0 items-center justify-center rounded-xl',
          compact ? 'h-9 w-9' : 'h-11 w-11',
          light ? 'bg-white/10 ring-1 ring-white/15' : 'bg-emerald-700 text-white'
        )}
      >
        <BookOpenText className={cn(light ? 'text-emerald-300' : 'text-white', compact ? 'h-5 w-5' : 'h-6 w-6')} />
      </div>
      <div className="min-w-0">
        <p
          className={cn(
            'truncate font-bold leading-tight',
            compact ? 'text-sm' : 'text-base',
            light ? 'text-white' : 'text-slate-900'
          )}
          dir="auto"
        >
          {t('app.name')}
        </p>
        {!compact ? (
          <p className={cn('truncate text-[11px]', light ? 'text-emerald-200/80' : 'text-slate-500')} dir="auto">
            {t('app.tagline')}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function LanguageToggle({ light = false }) {
  const { lang, setLang } = useI18n();
  return (
    <div
      className={cn(
        'inline-flex items-center rounded-lg p-0.5 text-[11px] font-semibold',
        light ? 'bg-white/10 text-white' : 'bg-slate-100 text-slate-600'
      )}
    >
      <button
        type="button"
        onClick={() => setLang('en')}
        className={cn('rounded-md px-2 py-1 transition', lang === 'en' && (light ? 'bg-white/20' : 'bg-white shadow-sm'))}
      >
        EN
      </button>
      <button
        type="button"
        onClick={() => setLang('ur')}
        className={cn('rounded-md px-2 py-1 transition', lang === 'ur' && (light ? 'bg-white/20' : 'bg-white shadow-sm'))}
      >
        اردو
      </button>
    </div>
  );
}

function SidebarLink({ item }) {
  const { t } = useI18n();
  const Icon = item.icon;
  return (
    <NavLink
      to={item.to}
      end={item.end}
      className={({ isActive }) =>
        cn(
          'group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition',
          isActive
            ? 'bg-white/10 text-white shadow-sm ring-1 ring-white/10'
            : 'text-emerald-100/75 hover:bg-white/5 hover:text-white'
        )
      }
    >
      {({ isActive }) => (
        <>
          <Icon className={cn('h-[18px] w-[18px]', isActive ? 'text-emerald-300' : 'text-emerald-200/60')} />
          <span dir="auto">{t(item.key)}</span>
        </>
      )}
    </NavLink>
  );
}

export default function Layout() {
  const { t } = useI18n();
  const { user, logout } = useAuth();
  const [moreOpen, setMoreOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    setMoreOpen(false);
  }, [location.pathname]);

  const initials = (user?.displayName || user?.username || 'A')
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0))
    .join('')
    .toUpperCase();

  const handleLogout = async () => {
    await logout();
    navigate('/', { replace: true });
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-emerald-950/20 bg-emerald-950 lg:flex">
        <div className="border-b border-white/10 px-5 py-5">
          <Brand light />
        </div>
        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-5">
          {navItems.map((item) => (
            <SidebarLink key={item.to} item={item} />
          ))}
        </nav>
        <div className="border-t border-white/10 p-3">
          <div className="mb-3 flex items-center gap-3 rounded-xl bg-white/5 px-3 py-2.5">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-xs font-bold text-emerald-950">
              {initials}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-white" dir="auto">
                {user?.displayName || user?.username}
              </p>
              <p className="truncate text-[11px] text-emerald-200/70">{user?.username}</p>
            </div>
          </div>
          <div className="flex items-center justify-between px-1">
            <LanguageToggle light />
            <button
              type="button"
              onClick={handleLogout}
              className="rounded-lg p-2 text-emerald-200/70 transition hover:bg-white/10 hover:text-white"
              title={t('auth.logout')}
              aria-label={t('auth.logout')}
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>

      <header className="app-header sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur lg:hidden">
        <div className="flex items-center justify-between gap-3 px-4 py-3">
          <Brand compact />
          <div className="flex items-center gap-1">
            <LanguageToggle />
            <button
              type="button"
              onClick={handleLogout}
              className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
              aria-label={t('auth.logout')}
            >
              <LogOut className="h-[18px] w-[18px]" />
            </button>
          </div>
        </div>
      </header>

      <div className="lg:pl-64">
        <main className="app-main mx-auto w-full max-w-7xl px-4 pb-28 pt-5 sm:px-6 sm:pt-6 lg:px-8 lg:pb-10 lg:pt-8">
          <Outlet />
        </main>
      </div>

      <nav className="mobile-nav fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
        <div className="grid grid-cols-5">
          {mobileMain.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  cn(
                    'flex flex-col items-center gap-1 px-1 py-2.5 text-[10px] font-medium transition',
                    isActive ? 'text-emerald-700' : 'text-slate-500'
                  )
                }
              >
                <Icon className="h-5 w-5" />
                <span className="truncate" dir="auto">
                  {t(item.key)}
                </span>
              </NavLink>
            );
          })}
          <button
            type="button"
            onClick={() => setMoreOpen(true)}
            className={cn(
              'flex flex-col items-center gap-1 px-1 py-2.5 text-[10px] font-medium transition',
              mobileMore.some((item) => location.pathname.startsWith(item.to)) ? 'text-emerald-700' : 'text-slate-500'
            )}
          >
            <Menu className="h-5 w-5" />
            <span dir="auto">{t('nav.more')}</span>
          </button>
        </div>
      </nav>

      {moreOpen ? (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-slate-950/40 backdrop-blur-[1px]" onClick={() => setMoreOpen(false)} />
          <div className="absolute inset-x-0 bottom-0 animate-slide-up rounded-t-3xl bg-white p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] shadow-2xl">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-100 text-xs font-bold text-emerald-800">
                  {initials}
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-900" dir="auto">
                    {user?.displayName || user?.username}
                  </p>
                  <p className="text-xs text-slate-500">{user?.username}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setMoreOpen(false)}
                className="rounded-lg p-2 text-slate-400 hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {mobileMore.map((item) => {
                const Icon = item.icon;
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    className={({ isActive }) =>
                      cn(
                        'flex items-center gap-3 rounded-xl border px-3 py-3 text-sm font-medium',
                        isActive
                          ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                          : 'border-slate-200 text-slate-700'
                      )
                    }
                  >
                    <Icon className="h-5 w-5" />
                    <span dir="auto">{t(item.key)}</span>
                  </NavLink>
                );
              })}
            </div>
            <div className="mt-3 flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2.5">
              <div className="flex items-center gap-2 text-sm text-slate-600">
                <Languages className="h-4 w-4" />
                <span>{t('common.language')}</span>
              </div>
              <LanguageToggle />
            </div>
            <button
              type="button"
              onClick={handleLogout}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-3 text-sm font-semibold text-red-700"
            >
              <LogOut className="h-4 w-4" />
              {t('auth.logout')}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
