import { useState, type FormEvent } from 'react';
import {
  Plus,
  Download,
  ArrowDownLeft,
  ArrowUpRight,
  Wallet,
  LockKeyhole,
  UnlockKeyhole,
  Undo2,
  Search,
} from 'lucide-react';
import {
  METHODS,
  money,
  dateLabel,
  type Bootstrap,
  type CashSession,
  type Movement,
  type Method,
} from '../shared/domain';
import { post, message } from './api';
import {
  Dialog,
  Field,
  Amount,
  Submit,
  ErrorBox,
  Empty,
  Stat,
  centsFrom,
  amountString,
} from './components';
import { ReverseForm } from './Account';
import { useOperation } from './useOperation';

export function Cash({
  data,
  onChanged,
  onToast,
  onOpenReservation,
}: {
  data: Bootstrap;
  onChanged: () => Promise<void>;
  onToast: (s: string) => void;
  onOpenReservation: (id: string) => void;
}) {
  const open = data.sessions.find((s) => !s.closedAt);
  const [date, setDate] = useState(open?.date ?? data.today);
  const [action, setAction] = useState<'open' | 'close' | 'movement' | null>(null);
  const [reverse, setReverse] = useState<Movement | null>(null);
  const [query, setQuery] = useState('');
  const session = data.sessions.find((s) => s.date === date);
  const movements = data.movements.filter((m) => m.date === date);
  const filtered = movements.filter(
    (m) =>
      !query ||
      `${m.description} ${m.category} ${m.reservationNumber ?? ''}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  const net = (method: Method) =>
    movements
      .filter((m) => m.method === method)
      .reduce((s, m) => s + (m.direction === 'income' ? m.amountCents : -m.amountCents), 0);
  async function saved(text: string) {
    await onChanged();
    setAction(null);
    setReverse(null);
    onToast(text);
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">EL MOVIMIENTO DE CADA DÍA</div>
          <h1>Caja</h1>
          <p>Ingresos, egresos y cierre de efectivo.</p>
        </div>
        <div className="button-row">
          <a className="button" href="/api/export/movements">
            <Download size={16} />
            Exportar
          </a>
          <button
            className="button primary"
            disabled={!open}
            onClick={() => {
              setDate(open!.date);
              setAction('movement');
            }}
          >
            <Plus size={17} />
            Nuevo movimiento
          </button>
        </div>
      </div>
      <div className="cash-date-bar">
        <div className="button-row">
          <input
            aria-label="Fecha de caja"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
          <span className={`cash-state ${session && !session.closedAt ? 'open' : ''}`}>
            {session ? (
              session.closedAt ? (
                <>
                  <LockKeyhole size={15} />
                  Caja cerrada
                </>
              ) : (
                <>
                  <UnlockKeyhole size={15} />
                  Caja abierta
                </>
              )
            ) : (
              'Sin apertura'
            )}
          </span>
        </div>
        <div className="button-row">
          {open && open.date !== date && (
            <button className="text-button" onClick={() => setDate(open.date)}>
              Ir a caja abierta · {dateLabel(open.date)}
            </button>
          )}
          {!open && (
            <button className="button small primary" onClick={() => setAction('open')}>
              <UnlockKeyhole size={15} />
              Abrir caja
            </button>
          )}
          {session && !session.closedAt && (
            <button className="button small" onClick={() => setAction('close')}>
              <LockKeyhole size={15} />
              Cerrar caja
            </button>
          )}
        </div>
      </div>
      <div className="stats-grid">
        <Stat
          label="Efectivo de apertura"
          value={money(session?.openingCents ?? 0)}
          detail="Fondo inicial del día"
          icon={<Wallet size={18} />}
        />
        <Stat
          label="Entradas en efectivo"
          value={money(session?.incomeCents ?? 0)}
          detail="Incluye cobros de reservas"
          icon={<ArrowDownLeft size={19} />}
        />
        <Stat
          label="Salidas en efectivo"
          value={money(session?.expenseCents ?? 0)}
          detail="Gastos, retiros y devoluciones"
          icon={<ArrowUpRight size={19} />}
        />
        <Stat
          label="Efectivo esperado"
          value={money(session?.expectedCents ?? 0)}
          detail="Apertura + entradas − salidas"
          tone="accent"
        />
      </div>
      <div className="payment-strip">
        <span>Otros medios · movimiento neto del día</span>
        <div>
          <span>
            Transferencias <strong>{money(net('transfer'))}</strong>
          </span>
          <span>
            Tarjetas <strong>{money(net('card'))}</strong>
          </span>
        </div>
      </div>
      {session?.closedAt && (
        <div className={`closure-summary ${session.differenceCents ? 'has-difference' : ''}`}>
          <LockKeyhole size={20} />
          <div>
            <strong>Caja cerrada · efectivo contado: {money(session.countedCents!)}</strong>
            <p>
              Diferencia con el esperado: {money(session.differenceCents ?? 0)}
              {session.notes ? ` · ${session.notes}` : ''}
            </p>
          </div>
        </div>
      )}
      <section className="panel">
        <div className="table-toolbar">
          <h3>Movimientos del día</h3>
          <div className="search-input">
            <Search size={17} />
            <input
              aria-label="Buscar movimiento"
              placeholder="Buscar detalle o categoría"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <span className="muted results-count">{filtered.length} movimientos</span>
        </div>
        {filtered.length ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Detalle</th>
                  <th>Categoría</th>
                  <th>Medio</th>
                  <th>Reserva</th>
                  <th className="numeric">Entrada</th>
                  <th className="numeric">Salida</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {filtered.map((m) => (
                  <tr key={m.id}>
                    <td>
                      <div className="movement-detail">
                        <span className={`direction-icon ${m.direction}`}>
                          {m.direction === 'income' ? (
                            <ArrowDownLeft size={17} />
                          ) : (
                            <ArrowUpRight size={17} />
                          )}
                        </span>
                        <div>
                          <strong>{m.description}</strong>
                          <small>
                            {m.source === 'payment'
                              ? 'Cobro de reserva'
                              : m.source === 'reversal'
                                ? 'Contrapartida'
                                : 'Movimiento manual'}
                            {m.reversedBy ? ' · Revertido' : ''}
                          </small>
                        </div>
                      </div>
                    </td>
                    <td>{m.category}</td>
                    <td>{METHODS[m.method]}</td>
                    <td>
                      {m.reservationId ? (
                        <button
                          className="text-button"
                          onClick={() => onOpenReservation(m.reservationId!)}
                        >
                          #{m.reservationNumber}
                        </button>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="numeric success-text">
                      {m.direction === 'income' ? money(m.amountCents) : '—'}
                    </td>
                    <td className="numeric danger-text">
                      {m.direction === 'expense' ? money(m.amountCents) : '—'}
                    </td>
                    <td>
                      {!m.reversedBy && m.source !== 'reversal' && (
                        <button
                          className="icon-button"
                          title="Revertir movimiento"
                          aria-label={`Revertir ${m.description}`}
                          onClick={() => setReverse(m)}
                        >
                          <Undo2 size={16} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty
            title={!session ? 'Abrí la caja para empezar' : 'No hay movimientos para mostrar'}
            action={
              !open && !session ? (
                <button className="button primary" onClick={() => setAction('open')}>
                  Abrir caja
                </button>
              ) : undefined
            }
          >
            {!session
              ? 'Ingresá el efectivo inicial. Luego podrás registrar cobros y movimientos.'
              : 'Los cobros de reservas aparecen aquí automáticamente.'}
          </Empty>
        )}
      </section>
      {data.sessions.length > 0 && (
        <section className="panel cash-history">
          <div className="section-line">
            <h3>Aperturas y cierres</h3>
            <span className="muted">Últimas 15 cajas</span>
          </div>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Estado</th>
                  <th className="numeric">Apertura</th>
                  <th className="numeric">Esperado</th>
                  <th className="numeric">Contado</th>
                  <th className="numeric">Diferencia</th>
                </tr>
              </thead>
              <tbody>
                {data.sessions.slice(0, 15).map((s) => (
                  <tr key={s.id} className="clickable" onClick={() => setDate(s.date)}>
                    <td>
                      <button className="text-button" onClick={() => setDate(s.date)}>
                        {dateLabel(s.date, { day: '2-digit', month: 'short', year: 'numeric' })}
                      </button>
                    </td>
                    <td>
                      <span
                        className={`state ${s.closedAt ? 'state-checked_out' : 'state-confirmed'}`}
                      >
                        {s.closedAt ? 'Cerrada' : 'Abierta'}
                      </span>
                    </td>
                    <td className="numeric">{money(s.openingCents)}</td>
                    <td className="numeric">{money(s.expectedCents)}</td>
                    <td className="numeric">
                      {s.countedCents === null ? '—' : money(s.countedCents)}
                    </td>
                    <td className={`numeric ${s.differenceCents ? 'danger-text' : ''}`}>
                      {s.differenceCents === null ? '—' : money(s.differenceCents)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
      {action === 'open' && (
        <OpenForm
          data={data}
          date={date}
          onClose={() => setAction(null)}
          onSaved={async (newDate) => {
            setDate(newDate);
            await saved('Caja abierta.');
          }}
        />
      )}
      {action === 'close' && session && (
        <CloseForm
          session={session}
          onClose={() => setAction(null)}
          onSaved={() => saved('Caja cerrada y diferencia registrada.')}
        />
      )}
      {action === 'movement' && open && (
        <MovementForm
          date={open.date}
          onClose={() => setAction(null)}
          onSaved={() => saved('Movimiento registrado.')}
        />
      )}
      {reverse && (
        <ReverseForm
          movement={reverse}
          data={data}
          onClose={() => setReverse(null)}
          onSaved={() => saved('Movimiento revertido con una contrapartida.')}
        />
      )}
    </>
  );
}
function OpenForm({
  data,
  date: initial,
  onClose,
  onSaved,
}: {
  data: Bootstrap;
  date: string;
  onClose: () => void;
  onSaved: (date: string) => Promise<void>;
}) {
  const operate = useOperation();
  const [date, setDate] = useState(initial);
  const [amount, setAmount] = useState(amountString(data.sessions[0]?.countedCents ?? 0));
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function save(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await operate('/cash/open', { date, openingCents: centsFrom(amount), notes });
      await onSaved(date);
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      title="Abrir caja"
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <form onSubmit={save}>
        <div className="dialog-body">
          <p className="form-intro">
            Contá el efectivo disponible antes de registrar los movimientos del día.
          </p>
          <div className="form-grid">
            <Field label="Fecha *">
              <input type="date" required value={date} onChange={(e) => setDate(e.target.value)} />
            </Field>
            <Field label="Efectivo inicial *">
              <Amount value={amount} onChange={setAmount} />
            </Field>
            <Field label="Observaciones" full>
              <textarea
                rows={2}
                maxLength={2000}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </Field>
          </div>
          <ErrorBox error={error} />
        </div>
        <div className="dialog-footer">
          <button className="button" type="button" disabled={busy} onClick={onClose}>
            Cancelar
          </button>
          <Submit busy={busy}>Abrir caja</Submit>
        </div>
      </form>
    </Dialog>
  );
}
function CloseForm({
  session,
  onClose,
  onSaved,
}: {
  session: CashSession;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const operate = useOperation();
  const [amount, setAmount] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function save(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await operate(`/cash/${session.id}/close`, { countedCents: centsFrom(amount), notes });
      await onSaved();
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      title="Cerrar caja"
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <form onSubmit={save}>
        <div className="dialog-body">
          <div className="form-total">
            <span>Efectivo esperado</span>
            <strong>{money(session.expectedCents)}</strong>
          </div>
          <Field label="Efectivo contado *">
            <Amount value={amount} onChange={setAmount} />
          </Field>
          {amount !== '' && (
            <p
              className={centsFrom(amount) - session.expectedCents ? 'danger-text' : 'success-text'}
            >
              Diferencia: {money(centsFrom(amount) - session.expectedCents)}
            </p>
          )}
          <Field label="Observaciones del cierre">
            <textarea
              rows={3}
              maxLength={2000}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </Field>
          <p className="field-help">
            Los movimientos de esta fecha quedarán cerrados. Las correcciones posteriores se
            registran en una nueva caja.
          </p>
          <ErrorBox error={error} />
        </div>
        <div className="dialog-footer">
          <button className="button" type="button" disabled={busy} onClick={onClose}>
            Cancelar
          </button>
          <Submit busy={busy}>Confirmar cierre</Submit>
        </div>
      </form>
    </Dialog>
  );
}
function MovementForm({
  date,
  onClose,
  onSaved,
}: {
  date: string;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const operate = useOperation();
  const [direction, setDirection] = useState('expense');
  const [method, setMethod] = useState('cash');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('Gastos generales');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function save(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await operate('/movements', {
        date,
        direction,
        method,
        amountCents: centsFrom(amount),
        description,
        category,
      });
      await onSaved();
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      title="Nuevo movimiento de caja"
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <form onSubmit={save}>
        <div className="dialog-body">
          <p className="form-intro">
            Caja del {dateLabel(date, { day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
          <div className="form-grid">
            <Field label="Tipo">
              <select value={direction} onChange={(e) => setDirection(e.target.value)}>
                <option value="expense">Salida / Egreso</option>
                <option value="income">Entrada / Ingreso</option>
              </select>
            </Field>
            <Field label="Medio">
              <select value={method} onChange={(e) => setMethod(e.target.value)}>
                {Object.entries(METHODS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Detalle *" full>
              <input
                required
                maxLength={500}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Ej. Compra de artículos de limpieza"
              />
            </Field>
            <Field label="Categoría *">
              <input
                required
                maxLength={200}
                list="cash-categories"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              />
              <datalist id="cash-categories">
                {[
                  'Gastos generales',
                  'Limpieza',
                  'Proveedores',
                  'Mantenimiento',
                  'Retiro',
                  'Aporte de efectivo',
                  'Otros ingresos',
                ].map((c) => (
                  <option value={c} key={c} />
                ))}
              </datalist>
            </Field>
            <Field label="Importe *">
              <Amount min="0.01" value={amount} onChange={setAmount} />
            </Field>
          </div>
          <p className="field-help">
            Para cobrar alojamiento o consumiciones, usá “Registrar cobro” dentro de la reserva.
          </p>
          <ErrorBox error={error} />
        </div>
        <div className="dialog-footer">
          <button className="button" type="button" disabled={busy} onClick={onClose}>
            Cancelar
          </button>
          <Submit busy={busy}>Guardar movimiento</Submit>
        </div>
      </form>
    </Dialog>
  );
}
