import { useEffect, useState, type FormEvent } from 'react';
import {
  Pencil,
  Plus,
  Wallet,
  ReceiptText,
  Phone,
  Users,
  CalendarDays,
  Undo2,
  Clock3,
  ExternalLink,
} from 'lucide-react';
import {
  type Bootstrap,
  type Detail,
  type Method,
  type Reservation,
  type Movement,
  METHODS,
  ROOMS,
  dateLabel,
  money,
  colorFor,
} from '../shared/domain';
import { api, post, message } from './api';
import { useOperation } from './useOperation';
import {
  Dialog,
  Field,
  Amount,
  ErrorBox,
  Submit,
  centsFrom,
  amountString,
  StateBadge,
  Empty,
} from './components';

type Selection = { id: string; roomId?: number; date?: string; tab?: string };
export function Account({
  selection,
  data,
  onClose,
  onEdit,
  onChanged,
  onToast,
}: {
  selection: Selection;
  data: Bootstrap;
  onClose: () => void;
  onEdit: (r: Reservation) => void;
  onChanged: () => Promise<void>;
  onToast: (s: string) => void;
}) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [error, setError] = useState('');
  const [tab, setTab] = useState(selection.tab ?? 'account');
  const [action, setAction] = useState<'consumption' | 'payment' | null>(null);
  const [voidId, setVoidId] = useState<string | null>(null);
  const [reverse, setReverse] = useState<Movement | null>(null);
  const [initialId, setInitialId] = useState<string | null>(null);
  const version = data.reservations.find((r) => r.id === selection.id)?.version;
  useEffect(() => {
    let active = true;
    api<Detail>(`/reservations/${selection.id}`)
      .then((d) => {
        if (active) {
          setDetail(d);
          setError('');
        }
      })
      .catch((e) => {
        if (active) setError(message(e));
      });
    return () => {
      active = false;
    };
  }, [selection.id, version]);
  async function changed(text: string) {
    setAction(null);
    setVoidId(null);
    setReverse(null);
    setInitialId(null);
    onToast(text);
    await onChanged();
    try {
      setDetail(await api<Detail>(`/reservations/${selection.id}`));
    } catch (e) {
      setError(message(e));
    }
  }
  const r = detail?.reservation;
  return (
    <Dialog
      title={r ? `Reserva #${String(r.number).padStart(4, '0')}` : 'Cuenta de la estadía'}
      onClose={onClose}
      drawer
    >
      {error && (
        <div className="drawer-content">
          <ErrorBox error={error} />
        </div>
      )}
      {!r && !error && <div className="loading-content">Cargando cuenta…</div>}
      {r && detail && (
        <>
          <div className="account-heading">
            <div className="account-avatar">{r.guestName.slice(0, 1)}</div>
            <div>
              <h2>{r.guestName}</h2>
              <div className="account-tags">
                <StateBadge state={r.state} />
                <span className="legend-tag">
                  <i style={{ background: colorFor(r).color }} />
                  {colorFor(r).label}
                </span>
              </div>
            </div>
            <button
              className="icon-button"
              aria-label="Editar reserva"
              title="Editar reserva"
              onClick={() => onEdit(r)}
            >
              <Pencil size={18} />
            </button>
          </div>
          <div className="stay-facts">
            <span>
              <CalendarDays size={15} />
              {dateLabel(r.checkIn)} —{' '}
              {dateLabel(r.checkOut, { day: '2-digit', month: 'short', year: 'numeric' })}
            </span>
            <span>
              <Users size={15} />
              {r.pax} huéspedes
            </span>
            {r.phone && (
              <a href={`tel:${r.phone}`}>
                <Phone size={15} />
                {r.phone}
              </a>
            )}
            <span>Hab. {[...new Set(r.assignments.map((a) => a.roomId))].join(', ')}</span>
          </div>
          <div className="account-balance">
            <div>
              <span>{r.balanceCents < 0 ? 'Saldo a favor' : 'Saldo pendiente'}</span>
              <strong>{money(Math.abs(r.balanceCents))}</strong>
            </div>
            <button className="button light" onClick={() => setAction('payment')}>
              <Wallet size={17} />
              Registrar cobro
            </button>
          </div>
          <div className="tabs">
            {[
              ['account', 'Cuenta'],
              ['consumptions', 'Consumiciones'],
              ['payments', 'Cobros'],
              ['history', 'Historial'],
            ].map(([key, label]) => (
              <button className={tab === key ? 'active' : ''} key={key} onClick={() => setTab(key)}>
                {label}
                {key === 'consumptions' && (
                  <span>{detail.consumptions.filter((c) => !c.voidedAt).length}</span>
                )}
              </button>
            ))}
          </div>
          <div className="drawer-content">
            {tab === 'account' && (
              <>
                <div className="account-lines">
                  <div>
                    <span>Alojamiento</span>
                    <strong>{money(r.lodgingCents)}</strong>
                  </div>
                  <div>
                    <span>Consumiciones</span>
                    <strong>{money(r.consumptionCents)}</strong>
                  </div>
                  <div className="subtotal">
                    <span>Total de la estadía</span>
                    <strong>{money(r.lodgingCents + r.consumptionCents)}</strong>
                  </div>
                  <div>
                    <span>Cobros de alojamiento</span>
                    <strong className="success-text">− {money(r.lodgingPaidCents)}</strong>
                  </div>
                  <div>
                    <span>Cobros de consumiciones</span>
                    <strong className="success-text">− {money(r.consumptionPaidCents)}</strong>
                  </div>
                  <div className="total">
                    <span>{r.balanceCents < 0 ? 'A favor del huésped' : 'Saldo pendiente'}</span>
                    <strong className={r.balanceCents > 0 ? 'danger-text' : 'success-text'}>
                      {money(Math.abs(r.balanceCents))}
                    </strong>
                  </div>
                </div>
                <div className="section-line subsection">
                  <h3>Habitaciones y fechas</h3>
                </div>
                {r.assignments.map((a, i) => (
                  <div className="assignment-summary" key={i}>
                    <span className="room-chip">{String(a.roomId).padStart(2, '0')}</span>
                    <div>
                      <strong>{ROOMS.find((x) => x.id === a.roomId)?.name}</strong>
                      <small>
                        {dateLabel(a.checkIn)} al {dateLabel(a.checkOut)}
                      </small>
                    </div>
                  </div>
                ))}
                <div className="account-actions">
                  <button
                    className="button"
                    onClick={() => setAction('consumption')}
                    disabled={r.state === 'cancelled'}
                  >
                    <Plus size={16} />
                    Agregar consumición
                  </button>
                  <button className="button" onClick={() => onEdit(r)}>
                    <Pencil size={16} />
                    Editar reserva
                  </button>
                </div>
                {(r.document || r.email || r.fiscalData) && (
                  <div className="notes-card">
                    <h4>Datos del huésped</h4>
                    {r.document && <p>Documento: {r.document}</p>}
                    {r.email && <p>{r.email}</p>}
                    {r.fiscalData && <p>{r.fiscalData}</p>}
                  </div>
                )}
                {r.notes && (
                  <div className="notes-card">
                    <h4>Observaciones</h4>
                    <p className="preserve-lines">{r.notes}</p>
                  </div>
                )}
              </>
            )}
            {tab === 'consumptions' && (
              <>
                <div className="section-line">
                  <div>
                    <h3>Consumiciones de la estadía</h3>
                    <p className="muted">
                      Total {money(r.consumptionCents)} · cobrado {money(r.consumptionPaidCents)}
                    </p>
                  </div>
                  <button
                    className="button small primary"
                    disabled={r.state === 'cancelled'}
                    onClick={() => setAction('consumption')}
                  >
                    <Plus size={15} />
                    Agregar
                  </button>
                </div>
                {detail.consumptions.length ? (
                  detail.consumptions.map((c) => (
                    <div key={c.id} className={`consumption-item ${c.voidedAt ? 'voided' : ''}`}>
                      <div className="item-icon">
                        <ReceiptText size={18} />
                      </div>
                      <div className="item-main">
                        <strong>
                          {c.quantity} × {c.description}
                        </strong>
                        <small>
                          {dateLabel(c.date)} · Hab. {c.roomId} · {money(c.unitCents)} c/u
                        </small>
                        {c.notes && <p>{c.notes}</p>}
                        {c.voidedAt && <small>Anulado: {c.voidReason}</small>}
                      </div>
                      <strong>{money(c.totalCents)}</strong>
                      {!c.voidedAt && (
                        <button
                          className="icon-button"
                          title="Anular consumo"
                          aria-label={`Anular ${c.description}`}
                          onClick={() => setVoidId(c.id)}
                        >
                          <Undo2 size={16} />
                        </button>
                      )}
                    </div>
                  ))
                ) : (
                  <Empty title="La cuenta de consumiciones está vacía">
                    Agregá cada consumo con su cantidad y precio. Quedará asociado a esta estadía.
                  </Empty>
                )}
              </>
            )}
            {tab === 'payments' && (
              <>
                <div className="section-line">
                  <h3>Cobros registrados</h3>
                  <button className="button small primary" onClick={() => setAction('payment')}>
                    <Plus size={15} />
                    Registrar
                  </button>
                </div>
                {detail.payments.length ? (
                  detail.payments.map((p) => (
                    <div
                      className={`consumption-item ${p.reversedBy || p.voidedAt ? 'voided' : ''}`}
                      key={p.id}
                    >
                      <div className="item-icon">
                        <Wallet size={18} />
                      </div>
                      <div className="item-main">
                        <strong>
                          {METHODS[p.method]} ·{' '}
                          {p.allocation === 'lodging' ? 'Alojamiento' : 'Consumiciones'}
                        </strong>
                        <small>
                          {dateLabel(p.date)}
                          {p.origin === 'import' ? ' · Saldo inicial de Excel' : ''}
                          {p.reversedBy || p.voidedAt ? ' · Anulado' : ''}
                        </small>
                        {p.notes && <p>{p.notes}</p>}
                      </div>
                      <strong>{money(p.amountCents)}</strong>
                      {!p.reversedBy && !p.voidedAt && (
                        <button
                          className="icon-button"
                          title={p.origin === 'import' ? 'Anular saldo inicial' : 'Revertir cobro'}
                          aria-label={
                            p.origin === 'import' ? 'Anular saldo inicial' : 'Revertir cobro'
                          }
                          onClick={() => {
                            if (p.origin === 'import') setInitialId(p.id);
                            else {
                              const movement = data.movements.find((m) => m.id === p.movementId);
                              if (movement) setReverse(movement);
                            }
                          }}
                        >
                          <Undo2 size={16} />
                        </button>
                      )}
                    </div>
                  ))
                ) : (
                  <Empty title="Todavía no se registraron cobros">
                    Los cobros actualizarán el saldo y la caja automáticamente.
                  </Empty>
                )}
              </>
            )}
            {tab === 'history' && (
              <>
                <h3>Historial de la reserva</h3>
                <div className="history">
                  {detail.history.map((h) => (
                    <div key={h.id}>
                      <span className="history-dot">
                        <Clock3 size={13} />
                      </span>
                      <div>
                        <p>{h.summary}</p>
                        <small>
                          {new Intl.DateTimeFormat('es-AR', {
                            dateStyle: 'short',
                            timeStyle: 'short',
                            timeZone: 'America/Argentina/Buenos_Aires',
                          }).format(new Date(h.createdAt))}
                        </small>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
          {action === 'consumption' && (
            <ConsumptionForm
              reservation={r}
              data={data}
              roomId={selection.roomId}
              selectedDate={selection.date}
              onClose={() => setAction(null)}
              onSaved={() => changed('Consumición agregada.')}
            />
          )}
          {action === 'payment' && (
            <PaymentForm
              reservation={r}
              data={data}
              onClose={() => setAction(null)}
              onSaved={() => changed('Cobro registrado en la cuenta y en caja.')}
            />
          )}
          {voidId && (
            <ReasonForm
              title="Anular consumición"
              description="El consumo quedará en el historial y se descontará de la cuenta. Los cobros existentes se conservan."
              onClose={() => setVoidId(null)}
              onSubmit={async (reason) => {
                await post(`/consumptions/${voidId}/void`, { reason });
                await changed('Consumición anulada.');
              }}
            />
          )}
          {reverse && (
            <ReverseForm
              movement={reverse}
              data={data}
              onClose={() => setReverse(null)}
              onSaved={() => changed('Cobro revertido con una contrapartida en caja.')}
            />
          )}
          {initialId && (
            <ReasonForm
              title="Anular saldo inicial"
              description="Se anulará el cobro histórico importado y se actualizará el saldo de la reserva. La caja no se modificará."
              onClose={() => setInitialId(null)}
              onSubmit={async (reason) => {
                await post(`/payments/${initialId}/void-initial`, { reason });
                await changed('Saldo inicial anulado.');
              }}
            />
          )}
        </>
      )}
    </Dialog>
  );
}

export function ConsumptionForm({
  reservation,
  data,
  roomId,
  selectedDate,
  onClose,
  onSaved,
}: {
  reservation: Reservation;
  data: Bootstrap;
  roomId?: number;
  selectedDate?: string;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const initial =
    reservation.assignments.find((a) => a.roomId === roomId) ?? reservation.assignments[0];
  const [room, setRoom] = useState(String(initial.roomId));
  const [date, setDate] = useState(
    selectedDate ??
      (data.today < initial.checkIn
        ? initial.checkIn
        : data.today > initial.checkOut
          ? initial.checkOut
          : data.today),
  );
  const [description, setDescription] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [price, setPrice] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const operate = useOperation();
  async function save(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await operate(`/reservations/${reservation.id}/consumptions`, {
        roomId: Number(room),
        date,
        description,
        quantity: Number(quantity),
        unitCents: centsFrom(price),
        notes,
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
      title="Agregar consumición"
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <form onSubmit={save}>
        <div className="dialog-body">
          <p className="form-intro">
            {reservation.guestName} · reserva #{reservation.number}
          </p>
          <div className="form-grid">
            <Field label="Habitación">
              <select value={room} onChange={(e) => setRoom(e.target.value)}>
                {[...new Set(reservation.assignments.map((a) => a.roomId))].map((id) => (
                  <option value={id} key={id}>
                    {ROOMS.find((r) => r.id === id)?.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Fecha *">
              <input type="date" required value={date} onChange={(e) => setDate(e.target.value)} />
            </Field>
            <Field label="Producto o descripción *" full>
              <input
                required
                maxLength={200}
                list="products"
                value={description}
                onChange={(e) => {
                  const value = e.target.value;
                  setDescription(value);
                  const product = data.products.find((p) => p.description === value);
                  if (product && product.unitCents > 0) setPrice(amountString(product.unitCents));
                }}
                placeholder="Ej. Agua, gaseosa, comida…"
              />
              <datalist id="products">
                {data.products.map((p) => (
                  <option key={p.description} value={p.description} />
                ))}
              </datalist>
            </Field>
            <Field label="Cantidad *">
              <input
                type="number"
                required
                min="1"
                max="10000"
                step="1"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
              />
            </Field>
            <Field label="Precio unitario *">
              <Amount value={price} onChange={setPrice} />
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
          <div className="form-total">
            <span>Total de la consumición</span>
            <strong>{money(Number(quantity) * centsFrom(price))}</strong>
          </div>
          <ErrorBox error={error} />
        </div>
        <div className="dialog-footer">
          <button className="button" type="button" disabled={busy} onClick={onClose}>
            Cancelar
          </button>
          <Submit busy={busy}>Agregar a la cuenta</Submit>
        </div>
      </form>
    </Dialog>
  );
}

function PaymentForm({
  reservation,
  data,
  onClose,
  onSaved,
}: {
  reservation: Reservation;
  data: Bootstrap;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const open = data.sessions.find((s) => !s.closedAt);
  const [allocation, setAllocation] = useState<'lodging' | 'consumption'>('lodging');
  const [paymentMode, setPaymentMode] = useState<'partial' | 'balance'>('partial');
  const [amount, setAmount] = useState('');
  const conceptBalance =
    allocation === 'lodging'
      ? reservation.lodgingCents - reservation.lodgingPaidCents
      : reservation.consumptionCents - reservation.consumptionPaidCents;
  const receivedCents = centsFrom(amount);
  const remainingCents = reservation.balanceCents - receivedCents;
  const [date, setDate] = useState(open?.date ?? data.today);
  const [method, setMethod] = useState<Method>('cash');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const operate = useOperation();
  async function save(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await operate(`/reservations/${reservation.id}/payments`, {
        date,
        method,
        amountCents: centsFrom(amount),
        allocation,
        notes,
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
      title="Registrar cobro"
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <form onSubmit={save}>
        <div className="dialog-body">
          <p className="form-intro">
            {reservation.guestName} · saldo total {money(reservation.balanceCents)}
          </p>
          {!open && (
            <div className="notice">
              Primero abrí la caja desde la pantalla Caja. El cobro se registrará una sola vez en
              ambas cuentas.
            </div>
          )}
          <div className="form-grid">
            <Field label="Concepto">
              <select
                value={allocation}
                onChange={(e) => {
                  const value = e.target.value as typeof allocation;
                  setAllocation(value);
                  const balance =
                    value === 'lodging'
                      ? reservation.lodgingCents - reservation.lodgingPaidCents
                      : reservation.consumptionCents - reservation.consumptionPaidCents;
                  if (paymentMode === 'balance' && balance > 0) setAmount(amountString(balance));
                  else {
                    setPaymentMode('partial');
                    setAmount('');
                  }
                }}
              >
                <option value="lodging">Alojamiento / Seña</option>
                <option value="consumption">Consumiciones</option>
              </select>
            </Field>
            <Field label="Medio de pago">
              <select value={method} onChange={(e) => setMethod(e.target.value as Method)}>
                {Object.entries(METHODS).map(([k, v]) => (
                  <option value={k} key={k}>
                    {v}
                  </option>
                ))}
              </select>
            </Field>
            <fieldset className="payment-mode full">
              <legend>Tipo de cobro</legend>
              <label className="check-line">
                <input
                  type="radio"
                  name="paymentMode"
                  value="partial"
                  checked={paymentMode === 'partial'}
                  onChange={() => {
                    setPaymentMode('partial');
                    setAmount('');
                  }}
                />
                Seña / pago parcial
              </label>
              <label className="check-line">
                <input
                  type="radio"
                  name="paymentMode"
                  value="balance"
                  checked={paymentMode === 'balance'}
                  disabled={conceptBalance <= 0}
                  onChange={() => {
                    setPaymentMode('balance');
                    setAmount(amountString(conceptBalance));
                  }}
                />
                Cobrar el saldo del concepto
              </label>
            </fieldset>
            <Field
              label={
                paymentMode === 'partial'
                  ? 'Importe recibido (seña o pago parcial) *'
                  : 'Importe a cobrar *'
              }
              hint={`Saldo de ${allocation === 'lodging' ? 'alojamiento' : 'consumiciones'}: ${money(conceptBalance)}`}
            >
              <Amount min="0.01" value={amount} onChange={setAmount} />
            </Field>
            <Field label="Fecha de caja *">
              <input type="date" required value={date} onChange={(e) => setDate(e.target.value)} />
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
          <div className="form-total" aria-live="polite">
            <span>
              {remainingCents < 0
                ? 'Saldo a favor luego del cobro'
                : 'Saldo total pendiente luego del cobro'}
            </span>
            <strong>{money(Math.abs(remainingCents))}</strong>
          </div>
          <p className="field-help">
            Podés registrar varios pagos para la misma reserva. Solo el importe recibido entra en
            caja; el resto queda pendiente. Un cobro mayor al saldo queda como crédito a favor del
            huésped.
          </p>
          <ErrorBox error={error} />
        </div>
        <div className="dialog-footer">
          <button className="button" type="button" disabled={busy} onClick={onClose}>
            Cancelar
          </button>
          <Submit busy={busy || !open}>Registrar cobro</Submit>
        </div>
      </form>
    </Dialog>
  );
}

export function ReasonForm({
  title,
  description,
  onClose,
  onSubmit,
}: {
  title: string;
  description: string;
  onClose: () => void;
  onSubmit: (reason: string) => Promise<void>;
}) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function save(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      await onSubmit(reason);
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      title={title}
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <form onSubmit={save}>
        <div className="dialog-body">
          <p className="form-intro">{description}</p>
          <Field label="Motivo *">
            <textarea
              required
              minLength={3}
              maxLength={2000}
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </Field>
          <ErrorBox error={error} />
        </div>
        <div className="dialog-footer">
          <button type="button" className="button" disabled={busy} onClick={onClose}>
            Cancelar
          </button>
          <Submit busy={busy}>Confirmar anulación</Submit>
        </div>
      </form>
    </Dialog>
  );
}

export function ReverseForm({
  movement,
  data,
  onClose,
  onSaved,
}: {
  movement: Movement;
  data: Bootstrap;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const open = data.sessions.find((s) => !s.closedAt);
  return (
    <ReasonForm
      title="Revertir movimiento"
      description={`${movement.description} · ${money(movement.amountCents)}. Se creará una contrapartida por ${METHODS[movement.method]} en la caja ${open?.date ?? '(primero abrí una caja)'}. El movimiento original queda en el historial.`}
      onClose={onClose}
      onSubmit={async (reason) => {
        if (!open) throw new Error('Primero abrí una caja para registrar la devolución.');
        await post(`/movements/${movement.id}/reverse`, { date: open.date, reason });
        await onSaved();
      }}
    />
  );
}
