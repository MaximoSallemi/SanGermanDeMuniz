import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, CalendarDays, Plus, ArrowRight, Users } from 'lucide-react';
import {
  LEGEND,
  addDays,
  daysBetween,
  dateLabel,
  colorFor,
  money,
  type Bootstrap,
  type Reservation,
} from '../shared/domain';
import { Stat } from './components';

export function Calendar({
  data,
  onOpen,
  onCreate,
}: {
  data: Bootstrap;
  onOpen: (id: string, roomId?: number, date?: string) => void;
  onCreate: (seed?: { roomId?: number; date?: string }) => void;
}) {
  const today = data.today;
  const [anchor, setAnchor] = useState(today.slice(0, 7));
  const [cellWidth, setCellWidth] = useState(58);
  const [viewport, setViewport] = useState({ left: 0, width: 1000 });
  const scroll = useRef<HTMLDivElement>(null);
  const active = data.reservations.filter((r) => r.state !== 'cancelled');
  const allDates = active.flatMap((r) => r.assignments.flatMap((a) => [a.checkIn, a.checkOut]));
  const firstYear = Math.min(
    Number(today.slice(0, 4)) - 1,
    ...allDates.map((d) => Number(d.slice(0, 4))),
  );
  const lastYear = Math.max(
    Number(today.slice(0, 4)) + 2,
    ...allDates.map((d) => Number(d.slice(0, 4))),
  );
  const start = `${firstYear}-01-01`;
  const end = `${lastYear + 1}-01-01`;
  const totalDays = daysBetween(start, end);
  const roomWidth = 190;
  const width = roomWidth + totalDays * cellWidth;
  const first = Math.max(0, Math.floor((viewport.left - roomWidth) / cellWidth) - 3);
  const last = Math.min(totalDays, first + Math.ceil(viewport.width / cellWidth) + 10);
  const visibleDays = useMemo(
    () =>
      Array.from({ length: last - first }, (_, i) => ({
        index: first + i,
        date: addDays(start, first + i),
      })),
    [first, last, start],
  );
  const months = useMemo(() => {
    const result: { index: number; count: number; date: string }[] = [];
    for (let y = firstYear; y <= lastYear; y++)
      for (let m = 1; m <= 12; m++) {
        const date = `${y}-${String(m).padStart(2, '0')}-01`;
        const next = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`;
        result.push({ date, index: daysBetween(start, date), count: daysBetween(date, next) });
      }
    return result;
  }, [firstYear, lastYear, start]);
  function goTo(date: string, behavior: ScrollBehavior = 'smooth') {
    const left = daysBetween(start, date) * cellWidth;
    scroll.current?.scrollTo({ left, behavior });
  }
  useEffect(() => {
    goTo(today, 'instant');
  }, [start, cellWidth]);
  useEffect(() => {
    const element = scroll.current!;
    const observer = new ResizeObserver(() =>
      setViewport((v) => ({ ...v, width: element.clientWidth })),
    );
    observer.observe(element);
    setViewport({ left: element.scrollLeft, width: element.clientWidth });
    return () => observer.disconnect();
  }, []);
  const occupied = new Set(
    active.flatMap((r) =>
      r.assignments.filter((a) => a.checkIn <= today && a.checkOut > today).map((a) => a.roomId),
    ),
  ).size;
  const arrivals = active.filter((r) => r.checkIn === today);
  const departures = active.filter((r) => r.checkOut === today);
  const outstanding = active.reduce((s, r) => s + Math.max(0, r.balanceCents), 0);
  function changeMonth(step: number) {
    const date = new Date(`${anchor}-01T12:00:00Z`);
    date.setUTCMonth(date.getUTCMonth() + step);
    const month = date.toISOString().slice(0, 7);
    if (Number(month.slice(0, 4)) < firstYear || Number(month.slice(0, 4)) > lastYear) return;
    setAnchor(month);
    goTo(`${month}-01`);
  }
  const weekday = (date: string) => dateLabel(date, { weekday: 'short' }).replace('.', '');
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">UNA VISTA DE CADA ESTADÍA</div>
          <h1>Almanaque</h1>
          <p>Habitaciones, reservas y cuentas, en el mismo lugar.</p>
        </div>
        <button className="button primary" onClick={() => onCreate()}>
          <Plus size={17} />
          Nueva reserva
        </button>
      </div>
      <div className="stats-grid">
        <Stat
          label="Habitaciones ocupadas"
          value={
            <>
              {occupied}
              <span className="stat-denominator"> / {data.rooms.length}</span>
            </>
          }
          detail={`${data.rooms.length - occupied} disponibles hoy`}
          icon={<CalendarDays size={19} />}
        />
        <Stat
          label="Ingresos de hoy"
          value={arrivals.length}
          detail={`${arrivals.reduce((s, r) => s + r.pax, 0)} huéspedes previstos`}
          icon={<ArrowRight size={19} />}
        />
        <Stat
          label="Salidas de hoy"
          value={departures.length}
          detail="Revisá las cuentas antes de la salida"
          icon={<Users size={19} />}
        />
        <Stat
          label="Saldo por cobrar"
          value={money(outstanding)}
          detail="Reservas activas y consumiciones"
          tone="accent"
        />
      </div>
      <section className="panel calendar-panel">
        <div className="calendar-toolbar">
          <div className="month-controls">
            <button
              className="icon-button"
              aria-label="Mes anterior"
              onClick={() => changeMonth(-1)}
            >
              <ChevronLeft size={18} />
            </button>
            <input
              aria-label="Ir al mes"
              type="month"
              min={`${firstYear}-01`}
              max={`${lastYear}-12`}
              value={anchor}
              onChange={(e) => {
                if (e.target.value) {
                  setAnchor(e.target.value);
                  goTo(`${e.target.value}-01`);
                }
              }}
            />
            <button
              className="icon-button"
              aria-label="Mes siguiente"
              onClick={() => changeMonth(1)}
            >
              <ChevronRight size={18} />
            </button>
            <button
              className="button small"
              onClick={() => {
                setAnchor(today.slice(0, 7));
                goTo(today);
              }}
            >
              Hoy
            </button>
          </div>
          <div className="calendar-tools">
            <span className="live-dot" />
            Calendario continuo
            <select
              aria-label="Ancho de los días"
              value={cellWidth}
              onChange={(e) => setCellWidth(Number(e.target.value))}
            >
              <option value={42}>Compacto</option>
              <option value={58}>Normal</option>
              <option value={82}>Amplio</option>
            </select>
          </div>
        </div>
        <div
          ref={scroll}
          className="timeline-scroll"
          onScroll={(e) => {
            const el = e.currentTarget;
            setViewport({ left: el.scrollLeft, width: el.clientWidth });
            const visibleDate = addDays(start, Math.floor(el.scrollLeft / cellWidth));
            setAnchor(visibleDate.slice(0, 7));
          }}
        >
          <div className="timeline" style={{ width }}>
            <div className="timeline-header" style={{ width }}>
              <div className="timeline-corner" style={{ width: roomWidth }}>
                HABITACIONES<span>{data.rooms.length} habitaciones</span>
              </div>
              {months
                .filter((m) => m.index + m.count >= first && m.index <= last)
                .map((m) => (
                  <div
                    className="month-band"
                    key={m.date}
                    style={{ left: roomWidth + m.index * cellWidth, width: m.count * cellWidth }}
                  >
                    <span
                      style={{
                        paddingLeft: Math.max(12, viewport.left - m.index * cellWidth + 12),
                      }}
                    >
                      {dateLabel(m.date, { month: 'long', year: 'numeric' })}
                    </span>
                  </div>
                ))}
              {visibleDays.map(({ index, date }) => (
                <div
                  key={date}
                  className={`day-header ${date === today ? 'is-today' : ''} ${['sáb', 'dom'].includes(weekday(date)) ? 'weekend' : ''}`}
                  style={{ left: roomWidth + index * cellWidth, width: cellWidth }}
                >
                  <span>{weekday(date)}</span>
                  <strong>{Number(date.slice(8))}</strong>
                  {date === today && <i />}
                </div>
              ))}
            </div>
            {data.rooms.map((room) => (
              <div className="timeline-row" key={room.id} style={{ width, height: 64 }}>
                <div className="room-label" style={{ width: roomWidth }}>
                  <span className="room-number">{room.short}</span>
                  <div>
                    <strong>{room.name.slice(3)}</strong>
                    <span>{room.floor}</span>
                  </div>
                </div>
                {visibleDays.map(({ index, date }) => (
                  <button
                    key={date}
                    className={`day-cell ${date === today ? 'is-today' : ''} ${['sáb', 'dom'].includes(weekday(date)) ? 'weekend' : ''}`}
                    style={{ left: roomWidth + index * cellWidth, width: cellWidth }}
                    title={`Nueva reserva · ${room.name} · ${dateLabel(date)}`}
                    aria-label={`Reservar ${room.name}, ${dateLabel(date, { day: 'numeric', month: 'long', year: 'numeric' })}`}
                    onClick={() => onCreate({ roomId: room.id, date })}
                  >
                    <Plus size={14} />
                  </button>
                ))}
                {active.flatMap((r) =>
                  r.assignments
                    .filter(
                      (a) =>
                        a.roomId === room.id &&
                        daysBetween(start, a.checkIn) < last &&
                        daysBetween(start, a.checkOut) > first,
                    )
                    .map((a, i) => {
                      const color = colorFor(r);
                      const index = daysBetween(start, a.checkIn);
                      const nights = daysBetween(a.checkIn, a.checkOut);
                      const clipped = Math.max(index, first);
                      const count = Math.min(index + nights, last) - clipped;
                      return (
                        <button
                          key={`${r.id}-${i}`}
                          className="reservation-bar"
                          style={{
                            left: roomWidth + clipped * cellWidth + 3,
                            width: count * cellWidth - 6,
                            background: color.color,
                            color: color.ink,
                          }}
                          title={`${r.guestName} · #${r.number}\n${dateLabel(a.checkIn)} al ${dateLabel(a.checkOut)} · ${color.label}\nSaldo ${money(r.balanceCents)}`}
                          onClick={() =>
                            onOpen(
                              r.id,
                              room.id,
                              a.checkIn <= today && a.checkOut >= today ? today : a.checkIn,
                            )
                          }
                        >
                          <span className="bar-name">{r.guestName}</span>
                          <span className="bar-meta">
                            {nights} {nights === 1 ? 'noche' : 'noches'} · #{r.number}
                          </span>
                        </button>
                      );
                    }),
                )}
              </div>
            ))}
          </div>
        </div>
        <div className="legend">
          {LEGEND.map((item) => (
            <span key={item.key}>
              <i style={{ background: item.color }} />
              {item.label}
            </span>
          ))}
        </div>
        <div className="calendar-caption">
          <span>
            Deslizá horizontalmente para recorrer los días. Seleccioná un espacio libre para
            reservar.
          </span>
          <span>Las reservas terminan el día de salida.</span>
        </div>
      </section>
      <div className="day-summary">
        <DailyList
          title="Llegan hoy"
          items={arrivals}
          onOpen={onOpen}
          empty="No hay ingresos previstos para hoy."
        />
        <DailyList
          title="Salen hoy"
          items={departures}
          onOpen={onOpen}
          empty="No hay salidas previstas para hoy."
        />
      </div>
    </>
  );
}
function DailyList({
  title,
  items,
  onOpen,
  empty,
}: {
  title: string;
  items: Reservation[];
  onOpen: (id: string) => void;
  empty: string;
}) {
  return (
    <section className="panel daily-list">
      <div className="section-line">
        <h3>{title}</h3>
        <span className="count-badge">{items.length}</span>
      </div>
      {items.length ? (
        items.map((r) => (
          <button className="daily-guest" key={r.id} onClick={() => onOpen(r.id)}>
            <span className="avatar">{r.guestName.slice(0, 1)}</span>
            <div>
              <strong>{r.guestName}</strong>
              <small>
                Hab. {[...new Set(r.assignments.map((a) => a.roomId))].join(', ')} · {r.pax}{' '}
                huéspedes
              </small>
            </div>
            <span className={r.balanceCents > 0 ? 'danger-text' : 'success-text'}>
              {r.balanceCents > 0 ? money(r.balanceCents) : 'Al día'}
            </span>
            <ChevronRight size={16} />
          </button>
        ))
      ) : (
        <p className="muted compact-empty">{empty}</p>
      )}
    </section>
  );
}
