import { useEffect, useId, useRef, type ReactNode } from 'react';
import { X, AlertCircle, LoaderCircle, ArrowUpRight, Inbox } from 'lucide-react';
import { STATES, type State } from '../shared/domain';

const openDialogs = new Set<symbol>();
let originalOverflow = '';

export function Dialog({
  title,
  children,
  onClose,
  wide = false,
  drawer = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
  drawer?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const id = useId();
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const element = ref.current!;
    element.focus();
    function key(event: KeyboardEvent) {
      if (event.defaultPrevented) return;
      // Only the topmost dialog handles the keyboard when dialogs are nested.
      const dialogs = document.querySelectorAll('[role="dialog"]');
      if (dialogs[dialogs.length - 1] !== element) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        closeRef.current();
      }
      if (event.key !== 'Tab') return;
      const items = Array.from(
        element.querySelectorAll<HTMLElement>(
          'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex="0"]',
        ),
      ).filter((x) => x.offsetParent !== null);
      const first = items[0];
      const last = items.at(-1);
      if (!first) {
        event.preventDefault();
        return;
      }
      if (
        event.shiftKey &&
        (document.activeElement === first || document.activeElement === element)
      ) {
        event.preventDefault();
        last?.focus();
      } else if (
        !event.shiftKey &&
        (document.activeElement === last || document.activeElement === element)
      ) {
        event.preventDefault();
        first.focus();
      }
    }
    const token = Symbol('dialog');
    if (openDialogs.size === 0) originalOverflow = document.body.style.overflow;
    openDialogs.add(token);
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', key);
    return () => {
      openDialogs.delete(token);
      if (openDialogs.size === 0) document.body.style.overflow = originalOverflow;
      document.removeEventListener('keydown', key);
      previous?.focus();
    };
  }, []);
  return (
    <div className={`overlay ${drawer ? 'drawer-overlay' : ''}`}>
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={id}
        tabIndex={-1}
        className={`${drawer ? 'drawer' : 'dialog'} ${wide ? 'wide' : ''}`}
      >
        <div className="dialog-header">
          <h2 id={id}>{title}</h2>
          <button className="icon-button" aria-label="Cerrar" onClick={onClose}>
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
export function Field({
  label,
  children,
  full = false,
  hint,
}: {
  label: string;
  children: ReactNode;
  full?: boolean;
  hint?: string;
}) {
  return (
    <label className={`field ${full ? 'full' : ''}`}>
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}
export function ErrorBox({ error }: { error: string }) {
  return error ? (
    <div className="error-box" role="alert">
      <AlertCircle size={18} />
      <span>{error}</span>
    </div>
  ) : null;
}
export function Submit({ busy, children }: { busy: boolean; children: ReactNode }) {
  return (
    <button type="submit" className="button primary" disabled={busy}>
      {busy && <LoaderCircle size={16} className="spin" />}
      {children}
    </button>
  );
}
export function StateBadge({ state }: { state: State }) {
  return <span className={`state state-${state}`}>{STATES[state]}</span>;
}
export function Empty({
  title,
  children,
  action,
}: {
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <div className="empty-icon">
        <Inbox size={28} strokeWidth={1.4} />
      </div>
      <h3>{title}</h3>
      {children && <p>{children}</p>}
      {action}
    </div>
  );
}
export function Stat({
  label,
  value,
  detail,
  tone = '',
  icon,
}: {
  label: string;
  value: ReactNode;
  detail?: string;
  tone?: string;
  icon?: ReactNode;
}) {
  return (
    <div className={`stat ${tone}`}>
      <div className="stat-top">
        <span>{label}</span>
        {icon ?? <ArrowUpRight size={17} />}
      </div>
      <strong>{value}</strong>
      {detail && <small>{detail}</small>}
    </div>
  );
}
export const centsFrom = (value: string) => Math.round(Number(value) * 100);
export const amountString = (cents: number) => String(cents / 100);
export function Amount({
  value,
  onChange,
  required = true,
  min = '0',
}: {
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  min?: string;
}) {
  return (
    <div className="amount-input">
      <span>$</span>
      <input
        aria-label="Importe en pesos"
        type="number"
        inputMode="decimal"
        step="0.01"
        min={min}
        max="10000000000"
        required={required}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="0"
      />
    </div>
  );
}
