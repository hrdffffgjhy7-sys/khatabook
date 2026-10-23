import {
  AlertTriangle,
  ArrowDownLeft,
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  LoaderCircle,
  RotateCcw,
  Search,
  Wallet
} from 'lucide-react';
import { cn, formatCurrency } from '../lib/format.js';
import { useI18n } from '../context/I18nContext.jsx';

export function Button({
  children,
  variant = 'primary',
  size = 'md',
  className,
  loading = false,
  disabled,
  type = 'button',
  ...props
}) {
  const variants = {
    primary:
      'border border-emerald-700 bg-emerald-700 text-white shadow-sm hover:bg-emerald-800 focus-visible:ring-emerald-500',
    secondary:
      'border border-slate-300 bg-white text-slate-700 shadow-sm hover:bg-slate-50 focus-visible:ring-slate-400',
    danger:
      'border border-red-600 bg-red-600 text-white shadow-sm hover:bg-red-700 focus-visible:ring-red-500',
    dangerSoft:
      'border border-red-200 bg-red-50 text-red-700 hover:bg-red-100 focus-visible:ring-red-400',
    ghost: 'border border-transparent text-slate-600 hover:bg-slate-100 hover:text-slate-900 focus-visible:ring-slate-400',
    dark: 'border border-slate-900 bg-slate-900 text-white shadow-sm hover:bg-slate-800 focus-visible:ring-slate-600',
    success:
      'border border-emerald-600 bg-emerald-600 text-white shadow-sm hover:bg-emerald-700 focus-visible:ring-emerald-500'
  };
  const sizes = {
    sm: 'px-3 py-1.5 text-xs',
    md: 'px-4 py-2.5 text-sm',
    lg: 'px-5 py-3 text-sm sm:text-base'
  };
  return (
    <button
      type={type}
      disabled={disabled || loading}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-xl font-semibold outline-none transition focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-55',
        variants[variant],
        sizes[size],
        className
      )}
      {...props}
    >
      {loading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : null}
      {children}
    </button>
  );
}

export function Field({ label, htmlFor, hint, error, required, children, className }) {
  return (
    <div className={className}>
      {label ? (
        <label htmlFor={htmlFor} className="label-base" dir="auto">
          {label}
          {required ? <span className="ml-0.5 text-red-500">*</span> : null}
        </label>
      ) : null}
      {children}
      {error ? (
        <p className="mt-1.5 text-xs font-medium text-red-600" dir="auto">
          {error}
        </p>
      ) : hint ? (
        <p className="mt-1.5 text-xs leading-5 text-slate-500" dir="auto">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export function Input({ className, ...props }) {
  return <input className={cn('input-base', className)} {...props} />;
}

export function Textarea({ className, ...props }) {
  return <textarea className={cn('input-base min-h-[92px] resize-y', className)} {...props} />;
}

export function Select({ className, children, ...props }) {
  return (
    <select className={cn('input-base cursor-pointer', className)} {...props}>
      {children}
    </select>
  );
}

export function Checkbox({ label, className, ...props }) {
  return (
    <label className={cn('flex cursor-pointer items-start gap-3 text-sm text-slate-700', className)}>
      <input
        type="checkbox"
        className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
        {...props}
      />
      <span dir="auto">{label}</span>
    </label>
  );
}

export function Card({ className, children, ...props }) {
  return (
    <div className={cn('card-surface', className)} {...props}>
      {children}
    </div>
  );
}

export function PageHeader({ title, subtitle, actions, className }) {
  return (
    <div className={cn('mb-6 flex flex-col gap-4 sm:mb-8 sm:flex-row sm:items-end sm:justify-between', className)}>
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl" dir="auto">
          {title}
        </h1>
        {subtitle ? (
          <p className="mt-1.5 max-w-2xl text-sm leading-6 text-slate-500" dir="auto">
            {subtitle}
          </p>
        ) : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function Badge({ children, tone = 'slate', className }) {
  const tones = {
    slate: 'border-slate-200 bg-slate-100 text-slate-700',
    green: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    red: 'border-red-200 bg-red-50 text-red-700',
    amber: 'border-amber-200 bg-amber-50 text-amber-800',
    blue: 'border-sky-200 bg-sky-50 text-sky-700',
    purple: 'border-violet-200 bg-violet-50 text-violet-700',
    gray: 'border-slate-200 bg-white text-slate-500'
  };
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2.5 py-1 text-[11px] font-semibold leading-none',
        tones[tone],
        className
      )}
      dir="auto"
    >
      {children}
    </span>
  );
}

export function TransactionTypeBadge({ type }) {
  const { t } = useI18n();
  const config = {
    purchase: { tone: 'red', icon: ArrowUpRight },
    payment: { tone: 'green', icon: ArrowDownLeft },
    purchase_reversal: { tone: 'slate', icon: RotateCcw },
    payment_reversal: { tone: 'amber', icon: RotateCcw }
  }[type] || { tone: 'slate' };
  const Icon = config.icon;
  return (
    <Badge tone={config.tone}>
      {Icon ? <Icon className="h-3 w-3" /> : null}
      {t(`txn.type.${type}`)}
    </Badge>
  );
}

export function StatusBadge({ status }) {
  const { t } = useI18n();
  if (status === 'reversed') return <Badge tone="red">{t('common.reversed')}</Badge>;
  return <Badge tone="green">{t('common.active')}</Badge>;
}

export function StatCard({ label, value, hint, icon: Icon = Wallet, tone = 'slate', className, onClick }) {
  const tones = {
    red: 'bg-red-50 text-red-700 ring-red-100',
    green: 'bg-emerald-50 text-emerald-700 ring-emerald-100',
    slate: 'bg-slate-100 text-slate-700 ring-slate-200',
    amber: 'bg-amber-50 text-amber-700 ring-amber-100',
    blue: 'bg-sky-50 text-sky-700 ring-sky-100'
  };
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={cn(
        'card-surface flex min-w-0 flex-col gap-3 p-4 text-left sm:p-5',
        onClick && 'transition hover:-translate-y-0.5 hover:shadow-md',
        className
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500" dir="auto">
          {label}
        </p>
        <span className={cn('rounded-xl p-2 ring-1', tones[tone])}>
          <Icon className="h-5 w-5" />
        </span>
      </div>
      <p className="break-words text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">{value}</p>
      {hint ? (
        <p className="text-xs leading-5 text-slate-500" dir="auto">
          {hint}
        </p>
      ) : null}
    </Tag>
  );
}

export function Spinner({ className }) {
  return <LoaderCircle className={cn('h-5 w-5 animate-spin text-emerald-600', className)} />;
}

export function LoadingBlock({ label }) {
  const { t } = useI18n();
  return (
    <div className="flex min-h-[220px] flex-col items-center justify-center gap-3 text-slate-500">
      <Spinner className="h-7 w-7" />
      <p className="text-sm">{label || t('common.loading')}</p>
    </div>
  );
}

export function EmptyState({ icon: Icon = Wallet, title, description, action, className }) {
  return (
    <div className={cn('flex flex-col items-center justify-center px-6 py-12 text-center', className)}>
      <div className="mb-4 rounded-2xl bg-slate-100 p-4 text-slate-400">
        <Icon className="h-7 w-7" />
      </div>
      <h3 className="text-base font-semibold text-slate-800" dir="auto">
        {title}
      </h3>
      {description ? (
        <p className="mt-1.5 max-w-md text-sm leading-6 text-slate-500" dir="auto">
          {description}
        </p>
      ) : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

export function ErrorState({ message, onRetry, className }) {
  const { t } = useI18n();
  return (
    <Card className={cn('border-red-200 p-6', className)}>
      <div className="flex items-start gap-3">
        <span className="rounded-full bg-red-50 p-2 text-red-600">
          <AlertTriangle className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-slate-900">{t('toast.error')}</p>
          <p className="mt-1 text-sm leading-6 text-slate-600" dir="auto">
            {message || t('error.generic')}
          </p>
          {onRetry ? (
            <Button variant="secondary" size="sm" className="mt-4" onClick={onRetry}>
              {t('common.refresh')}
            </Button>
          ) : null}
        </div>
      </div>
    </Card>
  );
}

export function SearchInput({ value, onChange, placeholder, className }) {
  return (
    <div className={cn('relative', className)}>
      <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
      <input
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="input-base pl-10"
        dir="auto"
      />
    </div>
  );
}

export function Money({ paise, className, colorize = false, prefix = '' }) {
  const value = formatCurrency(paise);
  return (
    <span
      className={cn(
        'whitespace-nowrap font-semibold tabular-nums',
        colorize && Number(paise) > 0
          ? 'text-red-600'
          : colorize && Number(paise) < 0
            ? 'text-emerald-700'
            : '',
        className
      )}
    >
      {prefix}
      {value}
    </span>
  );
}

export function Pagination({ page, pages, onChange }) {
  const { t } = useI18n();
  if (!pages || pages <= 1) return null;
  return (
    <div className="flex flex-col items-center justify-between gap-3 border-t border-slate-200 px-4 py-3 sm:flex-row">
      <p className="text-xs text-slate-500">
        {t('common.page')} {page} {t('common.of')} {pages}
      </p>
      <div className="flex items-center gap-2">
        <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => onChange(page - 1)}>
          <ChevronLeft className="h-4 w-4" />
          {t('common.previous')}
        </Button>
        <Button variant="secondary" size="sm" disabled={page >= pages} onClick={() => onChange(page + 1)}>
          {t('common.next')}
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

export function SectionTitle({ title, subtitle, action, className }) {
  return (
    <div className={cn('flex flex-wrap items-center justify-between gap-3', className)}>
      <div>
        <h2 className="text-base font-semibold text-slate-900" dir="auto">
          {title}
        </h2>
        {subtitle ? (
          <p className="mt-0.5 text-xs text-slate-500" dir="auto">
            {subtitle}
          </p>
        ) : null}
      </div>
      {action}
    </div>
  );
}
