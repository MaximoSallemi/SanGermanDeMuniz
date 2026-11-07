import { useState } from 'react';
import { Plus, Download, Search, ChevronRight } from 'lucide-react';
import {
  STATES,
  METHODS,
  dateLabel,
  daysBetween,
  money,
  colorFor,
  type Bootstrap,
  type State,
  type Method,
} from '../shared/domain';
import { Empty, StateBadge } from './components';

export function Reservations({
  data,
  onOpen,
  onCreate,
  query,
  setQuery,
}: {
  data: Bootstrap;
  onOpen: (id: string) => void;
  onCreate: () => void;
  query: string;
  setQuery: (value: string) => void;
}) {
  const [state, setState] = useState('');
  const [showPast, setShowPast] = useState(false);
  const [limit, setLimit] = useState(50);
  const filtered = data.reservations.filter(
    (r) =>
      (!state || r.state === state) &&
      (!query ||
        `${r.guestName} ${r.number} ${r.document} ${r.phone}`
          .toLocaleLowerCase()
          .includes(query.toLocaleLowerCase())) &&
      (showPast || r.checkOut >= data.today),
  );
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">CADA RESERVA, EN ORDEN</div>
          <h1>Reservas</h1>
          <p>Gestioná estadías, huéspedes y cobros.</p>
        </div>
        <div className="button-row">
          <a className="button" href="/api/export/reservations">
            <Download size={16} />
            Exportar
          </a>
          <button className="button primary" onClick={onCreate}>
            <Plus size={17} />
            Nueva reserva
          </button>
        </div>
      </div>
      <section className="panel">
        <div className="table-toolbar">
          <div className="search-input">
            <Search size={17} />
            <input
              aria-label="Buscar reserva"
              placeholder="Nombre, número, documento o teléfono"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setLimit(50);
              }}
            />
          </div>
          <select
            aria-label="Filtrar estado"
            value={state}
            onChange={(e) => {
              setState(e.target.value);
              setLimit(50);
            }}
          >
            <option value="">Todos los estados</option>
            {Object.entries(STATES).map(([k, v]) => (
              <option value={k} key={k}>
                {v}
              </option>
            ))}
          </select>
          <label className="check-line">
            <input
              type="checkbox"
              checked={showPast}
              onChange={(e) => setShowPast(e.target.checked)}
            />
            Incluir pasadas
          </label>
          <span className="muted results-count">{filtered.length} reservas</span>
        </div>
        {filtered.length ? (
          <div className="table-scroll">
            <table className="reservations-table">
              <thead>
                <tr>
                  <th>Reserva / Huésped</th>
                  <th>Hab.</th>
                  <th>Pax</th>
                  <th>Ingreso</th>
                  <th>Noches</th>
                  <th>Salida</th>
                  <th>Estado</th>
                  <th className="numeric">Alojamiento</th>
                  <th className="numeric">Consumiciones</th>
                  <th className="numeric">Efectivo</th>
                  <th className="numeric">Transferencia</th>
                  <th className="numeric">Tarjeta</th>
                  <th className="numeric">Total cobrado</th>
                  <th className="numeric">Saldo</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {filtered.slice(0, limit).map((r) => (
                  <tr key={r.id} onClick={() => onOpen(r.id)}>
                    <td>
                      <button
                        className="guest-link"
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpen(r.id);
                        }}
                      >
                        <i style={{ background: colorFor(r).color }} />
                        <div>
                          <strong>{r.guestName}</strong>
                          <small>
                            #{String(r.number).padStart(4, '0')} · {dateLabel(r.bookedOn)}
                          </small>
                        </div>
                      </button>
                    </td>
                    <td>{[...new Set(r.assignments.map((a) => a.roomId))].join(', ')}</td>
                    <td>{r.pax}</td>
                    <td>
                      {dateLabel(r.checkIn, { day: '2-digit', month: 'short', year: '2-digit' })}
                    </td>
                    <td>{daysBetween(r.checkIn, r.checkOut)}</td>
                    <td>
                      {dateLabel(r.checkOut, { day: '2-digit', month: 'short', year: '2-digit' })}
                    </td>
                    <td>
                      <StateBadge state={r.state as State} />
                    </td>
                    <td className="numeric">{money(r.lodgingCents)}</td>
                    <td className="numeric">{money(r.consumptionCents)}</td>
                    {(['cash', 'transfer', 'card'] as const).map((method) => (
                      <td className="numeric" key={method}>
                        {money(r.paidByMethod[method])}
                      </td>
                    ))}
                    <td className="numeric">{money(r.paidCents)}</td>
                    <td
                      className={`numeric strong ${r.balanceCents > 0 ? 'danger-text' : r.balanceCents < 0 ? 'credit-text' : 'success-text'}`}
                    >
                      {r.balanceCents < 0
                        ? `${money(-r.balanceCents)} a favor`
                        : money(r.balanceCents)}
                    </td>
                    <td>
                      <ChevronRight size={16} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty
            title={
              data.reservations.length
                ? 'No hay reservas con estos filtros'
                : 'Todo listo para tu primera reserva'
            }
            action={
              !data.reservations.length ? (
                <button className="button primary" onClick={onCreate}>
                  <Plus size={16} />
                  Crear reserva
                </button>
              ) : undefined
            }
          >
            Al guardar una reserva, aparecerá también en el almanaque.
          </Empty>
        )}
        {filtered.length > limit && (
          <div className="load-more">
            <button className="button small" onClick={() => setLimit((x) => x + 50)}>
              Mostrar 50 más
            </button>
          </div>
        )}
      </section>
      <p className="page-note">
        Los cobros se registran desde la cuenta de cada reserva. Los importes se muestran en pesos
        argentinos.
      </p>
    </>
  );
}
