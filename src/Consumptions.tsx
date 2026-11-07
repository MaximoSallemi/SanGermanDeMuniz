import { useState } from 'react';
import { Download, Search, ChevronRight, ReceiptText } from 'lucide-react';
import { ROOMS, money, dateLabel, type Bootstrap } from '../shared/domain';
import { Empty, Stat } from './components';

export function Consumptions({
  data,
  onOpen,
}: {
  data: Bootstrap;
  onOpen: (id: string, room?: number, date?: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [room, setRoom] = useState('');
  const [includeVoided, setIncludeVoided] = useState(false);
  const [limit, setLimit] = useState(50);
  const reservations = new Map(data.reservations.map((r) => [r.id, r]));
  const list = data.consumptions.filter(
    (c) =>
      (includeVoided || !c.voidedAt) &&
      (!room || c.roomId === Number(room)) &&
      (!query ||
        `${c.description} ${reservations.get(c.reservationId)?.guestName}`
          .toLowerCase()
          .includes(query.toLowerCase())),
  );
  const active = data.consumptions.filter((c) => !c.voidedAt);
  const pending = data.reservations.reduce(
    (s, r) => s + Math.max(0, r.consumptionCents - r.consumptionPaidCents),
    0,
  );
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">CADA CONSUMO, EN SU CUENTA</div>
          <h1>Consumiciones</h1>
          <p>El detalle de todas las habitaciones y estadías.</p>
        </div>
        <a className="button" href="/api/export/consumptions">
          <Download size={16} />
          Exportar
        </a>
      </div>
      <div className="stats-grid three">
        <Stat
          label="Consumiciones de hoy"
          value={money(
            active.filter((c) => c.date === data.today).reduce((s, c) => s + c.totalCents, 0),
          )}
          detail={`${active.filter((c) => c.date === data.today).reduce((s, c) => s + c.quantity, 0)} unidades registradas`}
          icon={<ReceiptText size={18} />}
        />
        <Stat
          label="Total registrado"
          value={money(active.reduce((s, c) => s + c.totalCents, 0))}
          detail="Histórico de consumiciones vigentes"
        />
        <Stat
          label="Pendiente de consumiciones"
          value={money(pending)}
          detail="Saldo por cobrar de todas las estadías"
          tone="accent"
        />
      </div>
      <section className="panel">
        <div className="table-toolbar">
          <div className="search-input">
            <Search size={17} />
            <input
              aria-label="Buscar consumición"
              placeholder="Buscar consumo o huésped"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setLimit(50);
              }}
            />
          </div>
          <select
            aria-label="Filtrar habitación"
            value={room}
            onChange={(e) => {
              setRoom(e.target.value);
              setLimit(50);
            }}
          >
            <option value="">Todas las habitaciones</option>
            {ROOMS.map((r) => (
              <option value={r.id} key={r.id}>
                {r.name}
              </option>
            ))}
          </select>
          <label className="check-line">
            <input
              type="checkbox"
              checked={includeVoided}
              onChange={(e) => setIncludeVoided(e.target.checked)}
            />
            Ver anuladas
          </label>
        </div>
        {list.length ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Habitación</th>
                  <th>Huésped / Reserva</th>
                  <th>Descripción</th>
                  <th className="numeric">Cantidad</th>
                  <th className="numeric">Precio unitario</th>
                  <th className="numeric">Total</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {list.slice(0, limit).map((c) => (
                  <tr
                    className={`clickable ${c.voidedAt ? 'voided' : ''}`}
                    key={c.id}
                    onClick={() => onOpen(c.reservationId, c.roomId, c.date)}
                  >
                    <td>
                      {dateLabel(c.date, { day: '2-digit', month: 'short', year: '2-digit' })}
                    </td>
                    <td>
                      <span className="room-chip">{String(c.roomId).padStart(2, '0')}</span>
                    </td>
                    <td>
                      <button
                        className="guest-link"
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpen(c.reservationId, c.roomId, c.date);
                        }}
                      >
                        <div>
                          <strong>{reservations.get(c.reservationId)?.guestName}</strong>
                          <small>#{reservations.get(c.reservationId)?.number}</small>
                        </div>
                      </button>
                    </td>
                    <td>
                      <strong>{c.description}</strong>
                      {c.voidedAt && <small className="block">Anulada · {c.voidReason}</small>}
                    </td>
                    <td className="numeric">{c.quantity}</td>
                    <td className="numeric">{money(c.unitCents)}</td>
                    <td className="numeric strong">{money(c.totalCents)}</td>
                    <td>
                      <ChevronRight size={16} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty title="No hay consumiciones para mostrar">
            Para agregar una, seleccioná la estadía en el almanaque o abrí una reserva.
          </Empty>
        )}
        {list.length > limit && (
          <div className="load-more">
            <button className="button small" onClick={() => setLimit((x) => x + 50)}>
              Mostrar 50 más
            </button>
          </div>
        )}
      </section>
    </>
  );
}
