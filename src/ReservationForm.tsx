import { useRef, useState, type FormEvent } from 'react';
import { Plus, Trash2, FileSpreadsheet } from 'lucide-react';
import {
  ROOMS,
  STATES,
  addDays,
  todayLocal,
  type Assignment,
  type Reservation,
  type ReservationInput,
  type ImportCandidate,
  type Method,
} from '../shared/domain';
import { post, put, message } from './api';
import { Dialog, Field, ErrorBox, Submit, Amount, amountString, centsFrom } from './components';

type Seed = { roomId?: number; date?: string };
type Historical = { method: Method; amountCents: number; allocation: 'lodging' | 'consumption' };
export function ReservationForm({
  reservation,
  seed,
  candidate,
  onClose,
  onSaved,
}: {
  reservation?: Reservation;
  seed?: Seed;
  candidate?: ImportCandidate;
  onClose: () => void;
  onSaved: (id: string) => void;
}) {
  const proposed = candidate
    ? (JSON.parse(candidate.proposedJson) as ReservationInput & {
        historicalPayments?: Historical[];
      })
    : undefined;
  const initial = reservation ?? proposed;
  const [guestName, setGuestName] = useState(initial?.guestName ?? '');
  const [document, setDocument] = useState(initial?.document ?? '');
  const [phone, setPhone] = useState(initial?.phone ?? '');
  const [email, setEmail] = useState(initial?.email ?? '');
  const [fiscalData, setFiscalData] = useState(initial?.fiscalData ?? '');
  const [bookedOn, setBookedOn] = useState(initial?.bookedOn ?? todayLocal());
  const [pax, setPax] = useState(String(initial?.pax ?? 1));
  const [price, setPrice] = useState(
    initial && (!candidate || initial.lodgingCents > 0) ? amountString(initial.lodgingCents) : '',
  );
  const [state, setState] = useState<ReservationInput['state']>(initial?.state ?? 'confirmed');
  const [channel, setChannel] = useState<ReservationInput['channel']>(initial?.channel ?? 'direct');
  const [visualTag, setVisualTag] = useState<ReservationInput['visualTag']>(
    initial?.visualTag ?? 'auto',
  );
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [assignments, setAssignments] = useState<Assignment[]>(
    initial?.assignments ?? [
      {
        roomId: seed?.roomId ?? 0,
        checkIn: seed?.date ?? todayLocal(),
        checkOut: addDays(seed?.date ?? todayLocal(), 1),
      },
    ],
  );
  const [historical, setHistorical] = useState<Record<Method, string>>({
    cash: amountString(
      proposed?.historicalPayments
        ?.filter((p) => p.method === 'cash')
        .reduce((s, p) => s + p.amountCents, 0) ?? 0,
    ),
    transfer: amountString(
      proposed?.historicalPayments
        ?.filter((p) => p.method === 'transfer')
        .reduce((s, p) => s + p.amountCents, 0) ?? 0,
    ),
    card: amountString(
      proposed?.historicalPayments
        ?.filter((p) => p.method === 'card')
        .reduce((s, p) => s + p.amountCents, 0) ?? 0,
    ),
  });
  const [includeHistorical, setIncludeHistorical] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const operation = useRef({ body: '', key: crypto.randomUUID() });
  const patch = (index: number, key: keyof Assignment, value: string | number) =>
    setAssignments((prev) => prev.map((a, i) => (i === index ? { ...a, [key]: value } : a)));
  async function save(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    const data = {
      guestName,
      document,
      phone,
      email,
      fiscalData,
      bookedOn,
      pax: Number(pax),
      lodgingCents: centsFrom(price),
      state,
      channel,
      visualTag,
      notes,
      assignments,
      ...(reservation ? { version: reservation.version } : {}),
      ...(candidate
        ? {
            importId: candidate.id,
            historicalPayments: includeHistorical
              ? (Object.entries(historical) as [Method, string][])
                  .filter(([, v]) => centsFrom(v) > 0)
                  .map(([method, value]) => ({
                    method,
                    amountCents: centsFrom(value),
                    allocation: 'lodging',
                  }))
              : [],
          }
        : {}),
    };
    const body = JSON.stringify(data);
    if (operation.current.body !== body) operation.current = { body, key: crypto.randomUUID() };
    try {
      const detail = reservation
        ? await put<{ reservation: Reservation }>(
            `/reservations/${reservation.id}`,
            data,
            operation.current.key,
          )
        : await post<{ reservation: Reservation }>('/reservations', data, operation.current.key);
      onSaved(detail.reservation.id);
    } catch (error) {
      setError(message(error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      title={
        reservation
          ? `Editar reserva #${reservation.number}`
          : candidate
            ? 'Revisar reserva de Excel'
            : 'Nueva reserva'
      }
      onClose={() => {
        if (!busy) onClose();
      }}
      wide
    >
      <form onSubmit={save}>
        <div className="dialog-body">
          {candidate && (
            <div className="import-notice">
              <FileSpreadsheet size={20} />
              <div>
                <strong>
                  {candidate.sourceFile} · {candidate.sourceSheet} · fila {candidate.sourceRow}
                </strong>
                {candidate.issues.map((issue, i) => (
                  <p key={i}>{issue}</p>
                ))}
              </div>
            </div>
          )}
          <div className="form-section">
            <h3>Datos del huésped</h3>
            <div className="form-grid">
              <Field label="Nombre y apellido *" full>
                <input
                  autoComplete="name"
                  required
                  minLength={2}
                  maxLength={200}
                  value={guestName}
                  onChange={(e) => setGuestName(e.target.value)}
                  placeholder="Nombre del titular de la reserva"
                />
              </Field>
              <Field label="DNI / Documento">
                <input
                  value={document}
                  maxLength={200}
                  onChange={(e) => setDocument(e.target.value)}
                />
              </Field>
              <Field label="Teléfono">
                <input
                  type="tel"
                  autoComplete="tel"
                  maxLength={200}
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
              </Field>
              <Field label="Email">
                <input
                  type="email"
                  maxLength={200}
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </Field>
              <Field label="Cantidad de huéspedes *">
                <input
                  type="number"
                  min="1"
                  max="100"
                  step="1"
                  required
                  value={pax}
                  onChange={(e) => setPax(e.target.value)}
                />
              </Field>
            </div>
          </div>
          <div className="form-section">
            <div className="section-line">
              <h3>Habitaciones y estadía</h3>
              <button
                type="button"
                className="text-button"
                onClick={() =>
                  setAssignments((a) => [
                    ...a,
                    {
                      roomId: 0,
                      checkIn: a[0]?.checkIn ?? todayLocal(),
                      checkOut: a[0]?.checkOut ?? addDays(todayLocal(), 1),
                    },
                  ])
                }
              >
                <Plus size={15} />
                Agregar habitación
              </button>
            </div>
            <p className="field-help">
              El día de salida queda disponible para el siguiente ingreso. Podés agregar tramos para
              un cambio de habitación.
            </p>
            {assignments.map((a, i) => (
              <div className="assignment" key={i}>
                <Field label="Habitación *">
                  <select
                    required
                    value={a.roomId || ''}
                    onChange={(e) => patch(i, 'roomId', Number(e.target.value))}
                  >
                    <option value="">Elegir habitación</option>
                    {ROOMS.map((r) => (
                      <option value={r.id} key={r.id}>
                        {r.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Ingreso *">
                  <input
                    type="date"
                    required
                    value={a.checkIn}
                    onChange={(e) => patch(i, 'checkIn', e.target.value)}
                  />
                </Field>
                <Field label="Salida *">
                  <input
                    type="date"
                    required
                    min={a.checkIn ? addDays(a.checkIn, 1) : undefined}
                    value={a.checkOut}
                    onChange={(e) => patch(i, 'checkOut', e.target.value)}
                  />
                </Field>
                <button
                  type="button"
                  aria-label={`Quitar habitación ${i + 1}`}
                  className="icon-button danger-text"
                  disabled={assignments.length === 1}
                  onClick={() => setAssignments((x) => x.filter((_, j) => i !== j))}
                >
                  <Trash2 size={17} />
                </button>
              </div>
            ))}
          </div>
          <div className="form-section">
            <h3>Reserva y alojamiento</h3>
            <div className="form-grid">
              <Field label="Fecha de reserva *">
                <input
                  type="date"
                  required
                  value={bookedOn}
                  onChange={(e) => setBookedOn(e.target.value)}
                />
              </Field>
              <Field
                label="Total de alojamiento *"
                hint="Importe de toda la reserva, sin consumiciones."
              >
                <Amount value={price} onChange={setPrice} />
              </Field>
              <Field label="Estado">
                <select value={state} onChange={(e) => setState(e.target.value as typeof state)}>
                  {Object.entries(STATES).map(([k, v]) => (
                    <option value={k} key={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Canal">
                <select
                  value={channel}
                  onChange={(e) => setChannel(e.target.value as typeof channel)}
                >
                  <option value="direct">Directo</option>
                  <option value="booking">Booking</option>
                  <option value="other">Otro</option>
                </select>
              </Field>
              <Field
                label="Color en el almanaque"
                full
                hint="Automático: a confirmar, Booking o estado del saldo. Las etiquetas especiales conservan el color de la planilla."
              >
                <select
                  value={visualTag}
                  onChange={(e) => setVisualTag(e.target.value as typeof visualTag)}
                >
                  <option value="auto">Automático según la reserva</option>
                  <option value="fondeo">Fucsia · Fondeo</option>
                  <option value="family">Celeste · Fer y flia</option>
                  <option value="booking">Azul · Booking</option>
                  <option value="data">Durazno · Datos</option>
                  <option value="dinner">Naranja · Cena 14</option>
                </select>
              </Field>
              <Field label="CUIL / Condición fiscal / Domicilio" full>
                <input
                  maxLength={1000}
                  value={fiscalData}
                  onChange={(e) => setFiscalData(e.target.value)}
                />
              </Field>
              <Field label="Observaciones" full>
                <textarea
                  rows={3}
                  maxLength={15000}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Pedidos especiales, horarios, información adicional…"
                />
              </Field>
            </div>
          </div>
          {state === 'cancelled' && (
            <p className="notice">
              La cancelación libera las habitaciones. Los cargos y cobros quedan en la cuenta;
              ajustá el alojamiento o registrá las devoluciones que correspondan.
            </p>
          )}
          {candidate && (
            <div className="form-section">
              <label className="check-line">
                <input
                  type="checkbox"
                  checked={includeHistorical}
                  onChange={(e) => setIncludeHistorical(e.target.checked)}
                />
                Incorporar los cobros históricos como saldo inicial
              </label>
              <p className="field-help">
                Revisá los importes. Se aplican al alojamiento y no generan movimientos en caja.
              </p>
              {includeHistorical && (
                <div className="form-grid three">
                  {(['cash', 'transfer', 'card'] as const).map((key, i) => (
                    <Field label={['Efectivo', 'Transferencia', 'Tarjeta'][i]} key={key}>
                      <Amount
                        value={historical[key]}
                        onChange={(v) => setHistorical((x) => ({ ...x, [key]: v }))}
                      />
                    </Field>
                  ))}
                </div>
              )}
              <details>
                <summary>Ver datos originales</summary>
                <pre className="raw-data">
                  {JSON.stringify(JSON.parse(candidate.rawJson), null, 2)}
                </pre>
              </details>
            </div>
          )}
          <ErrorBox error={error} />
        </div>
        <div className="dialog-footer">
          <button type="button" className="button" disabled={busy} onClick={onClose}>
            Cancelar
          </button>
          <Submit busy={busy}>
            {reservation ? 'Guardar cambios' : candidate ? 'Incorporar reserva' : 'Crear reserva'}
          </Submit>
        </div>
      </form>
    </Dialog>
  );
}
