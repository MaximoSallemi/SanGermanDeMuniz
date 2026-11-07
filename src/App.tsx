import { useCallback, useEffect, useRef, useState } from 'react';
import {
  CalendarDays,
  BookOpen,
  ReceiptText,
  Wallet,
  Settings2,
  Search,
  House,
  Check,
  X,
  Menu,
  ArrowUpRight,
  RefreshCw,
} from 'lucide-react';
import type { Bootstrap, Reservation, ImportCandidate } from '../shared/domain';
import { dateLabel } from '../shared/domain';
import { api, message } from './api';
import { Calendar } from './Calendar';
import { Reservations } from './Reservations';
import { Cash } from './Cash';
import { Consumptions } from './Consumptions';
import { Settings } from './Settings';
import { Account } from './Account';
import { ReservationForm } from './ReservationForm';
import { ErrorBox } from './components';

const navigation = [
  { key: 'almanaque', label: 'Almanaque', icon: CalendarDays },
  { key: 'reservas', label: 'Reservas', icon: BookOpen },
  { key: 'consumiciones', label: 'Consumiciones', icon: ReceiptText },
  { key: 'caja', label: 'Caja', icon: Wallet },
  { key: 'datos', label: 'Datos y respaldos', icon: Settings2 },
];
type Selection = { id: string; roomId?: number; date?: string; tab?: string };
export function App() {
  const [view, setView] = useState(() =>
    navigation.some((n) => `#${n.key}` === window.location.hash)
      ? window.location.hash.slice(1)
      : 'almanaque',
  );
  const [data, setData] = useState<Bootstrap | null>(null);
  const [error, setError] = useState('');
  const [connected, setConnected] = useState(false);
  const [query, setQuery] = useState('');
  const [toast, setToast] = useState('');
  const [selection, setSelection] = useState<Selection | null>(null);
  const [editor, setEditor] = useState<{
    reservation?: Reservation;
    seed?: { roomId?: number; date?: string };
    candidate?: ImportCandidate;
  } | null>(null);
  const [mobile, setMobile] = useState(false);
  const channel = useRef<BroadcastChannel | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const notify = useCallback((text: string) => {
    setToast(text);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast(''), 5000);
  }, []);
  const refresh = useCallback(async () => {
    try {
      const result = await api<Bootstrap>('/bootstrap');
      setData(result);
      setConnected(true);
      setError('');
    } catch (e) {
      setConnected(false);
      setError(message(e));
    }
  }, []);
  const changed = useCallback(async () => {
    await refresh();
    channel.current?.postMessage('refresh');
  }, [refresh]);
  useEffect(() => {
    void refresh();
    const interval = setInterval(() => {
      if (!document.hidden) void refresh();
    }, 15000);
    const focus = () => void refresh();
    window.addEventListener('focus', focus);
    channel.current = new BroadcastChannel('san-german');
    channel.current.onmessage = () => void refresh();
    return () => {
      clearInterval(interval);
      clearTimeout(timer.current);
      window.removeEventListener('focus', focus);
      channel.current?.close();
    };
  }, [refresh]);
  useEffect(() => {
    const change = () => {
      const next = window.location.hash.slice(1);
      if (navigation.some((n) => n.key === next)) setView(next);
    };
    window.addEventListener('hashchange', change);
    return () => window.removeEventListener('hashchange', change);
  }, []);
  function navigate(next: string) {
    setView(next);
    window.location.hash = next;
    setMobile(false);
  }
  function open(id: string, roomId?: number, date?: string) {
    setSelection({ id, roomId, date, tab: roomId ? 'consumptions' : 'account' });
  }
  async function saved(id: string) {
    setEditor(null);
    setSelection({ id, tab: 'account' });
    await changed();
    notify('Reserva guardada. El almanaque está actualizado.');
  }
  const title = navigation.find((n) => n.key === view)?.label;
  return (
    <div className="app-shell">
      {mobile && (
        <button
          className="mobile-shade"
          aria-label="Cerrar menú"
          onClick={() => setMobile(false)}
        />
      )}
      <aside className={`sidebar ${mobile ? 'mobile-open' : ''}`}>
        <a href="#almanaque" className="brand" onClick={() => navigate('almanaque')}>
          <span className="brand-mark">
            <House size={29} strokeWidth={1.4} />
          </span>
          <span>
            San Germán<small>DE MUÑIZ</small>
          </span>
        </a>
        <div className="sidebar-label">GESTIÓN DEL HOSPEDAJE</div>
        <nav>
          {navigation.map((item) => (
            <button
              className={view === item.key ? 'active' : ''}
              key={item.key}
              onClick={() => navigate(item.key)}
            >
              <item.icon size={19} strokeWidth={1.7} />
              {item.label}
              {item.key === 'datos' && !!data?.pendingImports && (
                <span className="nav-count">{data.pendingImports}</span>
              )}
              {view === item.key && <span className="nav-indicator" />}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <span className="local-pill">
            <span />
            APLICACIÓN LOCAL
          </span>
          <p>Un lugar para cada detalle.</p>
          <div className="sidebar-property">
            <span className="property-monogram">SG</span>
            <div>
              <strong>San Germán de Muñiz</strong>
              <small>Administración</small>
            </div>
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <button
            className="icon-button mobile-menu"
            aria-label="Abrir menú"
            onClick={() => setMobile(true)}
          >
            <Menu size={22} />
          </button>
          <div className="breadcrumbs">
            Administración<span>/</span>
            <strong>{title}</strong>
          </div>
          <div className="topbar-right">
            <div className="top-search">
              <Search size={16} />
              <input
                aria-label="Buscar huésped o reserva"
                placeholder="Buscar huésped o reserva…"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  if (view !== 'reservas') navigate('reservas');
                }}
              />
              {query && (
                <button
                  className="icon-button"
                  aria-label="Limpiar búsqueda"
                  onClick={() => setQuery('')}
                >
                  <X size={13} />
                </button>
              )}
            </div>
            <span
              className={`connection ${connected ? 'online' : ''}`}
              title={
                connected ? 'Conectado a la base local' : 'Sin conexión con la aplicación local'
              }
            >
              <i />
              {connected ? 'Local' : 'Sin conexión'}
            </span>
            <span className="top-avatar">SG</span>
          </div>
        </header>
        <main>
          <div className="date-overline">
            {data
              ? dateLabel(data.today, {
                  weekday: 'long',
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric',
                })
              : 'San Germán de Muñiz'}
          </div>
          {error && (
            <div className="connection-error">
              <ErrorBox error={`${error} Revisá que el servidor local esté en funcionamiento.`} />
              <button className="button small" onClick={refresh}>
                <RefreshCw size={14} />
                Reintentar
              </button>
            </div>
          )}
          {!data ? (
            <div className="app-loading">
              <span className="brand-mark">
                <House size={32} />
              </span>
              <h2>Preparando la recepción…</h2>
              <p>Cargando la información local.</p>
            </div>
          ) : (
            <>
              {view === 'almanaque' && (
                <Calendar data={data} onOpen={open} onCreate={(seed) => setEditor({ seed })} />
              )}
              {view === 'reservas' && (
                <Reservations
                  data={data}
                  onOpen={open}
                  onCreate={() => setEditor({})}
                  query={query}
                  setQuery={setQuery}
                />
              )}
              {view === 'consumiciones' && <Consumptions data={data} onOpen={open} />}
              {view === 'caja' && (
                <Cash data={data} onChanged={changed} onToast={notify} onOpenReservation={open} />
              )}
              {view === 'datos' && (
                <Settings
                  data={data}
                  onChanged={changed}
                  onToast={notify}
                  onReview={(candidate) => setEditor({ candidate })}
                />
              )}
            </>
          )}
          <footer className="app-footer">
            <span>San Germán de Muñiz</span>
            <span>Gestión de reservas y recepción</span>
          </footer>
        </main>
      </div>
      {data && selection && !editor && (
        <Account
          key={selection.id}
          selection={selection}
          data={data}
          onClose={() => setSelection(null)}
          onEdit={(reservation) => setEditor({ reservation })}
          onChanged={changed}
          onToast={notify}
        />
      )}
      {editor && (
        <ReservationForm
          key={editor.reservation?.id ?? editor.candidate?.id ?? 'new'}
          {...editor}
          onClose={() => setEditor(null)}
          onSaved={saved}
        />
      )}
      {toast && (
        <div className="toast" role="status">
          <span>
            <Check size={17} />
          </span>
          {toast}
          <button aria-label="Cerrar aviso" onClick={() => setToast('')}>
            <X size={15} />
          </button>
        </div>
      )}
    </div>
  );
}
