import { useEffect, useState, type FormEvent } from 'react';
import {
  DatabaseBackup,
  Download,
  RotateCcw,
  ShieldCheck,
  FileSpreadsheet,
  ChevronRight,
  RefreshCw,
  HardDrive,
  X,
} from 'lucide-react';
import { type Bootstrap, type ImportCandidate } from '../shared/domain';
import { api, post, message } from './api';
import { Dialog, Field, Submit, ErrorBox, Empty } from './components';

export function Settings({
  data,
  onChanged,
  onToast,
  onReview,
}: {
  data: Bootstrap;
  onChanged: () => Promise<void>;
  onToast: (s: string) => void;
  onReview: (candidate: ImportCandidate) => void;
}) {
  const [backups, setBackups] = useState<string[]>([]);
  const [candidates, setCandidates] = useState<ImportCandidate[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [restore, setRestore] = useState<string | null>(null);
  const [limit, setLimit] = useState(30);
  async function load() {
    try {
      const [b, i] = await Promise.all([
        api<{ names: string[] }>('/backups'),
        api<ImportCandidate[]>('/imports'),
      ]);
      setBackups(b.names);
      setCandidates(i);
      setError('');
    } catch (e) {
      setError(message(e));
    }
  }
  useEffect(() => {
    void load();
  }, [data.pendingImports]);
  async function backup() {
    setBusy(true);
    try {
      await post('/backups');
      await load();
      onToast('Copia de seguridad creada.');
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">TU INFORMACIÓN, A MANO</div>
          <h1>Datos y respaldos</h1>
          <p>Copias de seguridad e importación revisada de los Excel.</p>
        </div>
        <button className="button" onClick={load}>
          <RefreshCw size={16} />
          Actualizar
        </button>
      </div>
      <ErrorBox error={error} />
      <section className="panel settings-panel">
        <div className="section-line">
          <div className="setting-title">
            <DatabaseBackup size={24} />
            <div>
              <h3>Copias de seguridad</h3>
              <p className="muted">
                Se genera una copia diaria al abrir la app o mientras permanece en funcionamiento.
              </p>
            </div>
          </div>
          <button className="button primary" disabled={busy} onClick={backup}>
            <DatabaseBackup size={16} />
            {busy ? 'Creando copia…' : 'Crear copia ahora'}
          </button>
        </div>
        <div className="data-location">
          <HardDrive size={17} />
          <div>
            <small>Base de datos local</small>
            <code>{data.dataPath}</code>
          </div>
        </div>
        <p className="field-help">
          Descargá las copias a otra ubicación para tener un respaldo adicional. La restauración
          guarda primero una copia del estado actual.
        </p>
        {backups.length ? (
          <div className="backup-list">
            {backups.slice(0, 12).map((name) => (
              <div key={name}>
                <span className="backup-icon">
                  <ShieldCheck size={18} />
                </span>
                <div>
                  <strong>
                    {name.includes('-automatico-')
                      ? 'Respaldo automático'
                      : name.includes('-antes-de-restaurar-')
                        ? 'Antes de restaurar'
                        : 'Respaldo manual'}
                  </strong>
                  <small>
                    {name.slice(3, 13)} · {name.slice(14, 22).replaceAll('-', ':')}
                  </small>
                </div>
                <a className="button small" href={`/api/backups/${encodeURIComponent(name)}`}>
                  <Download size={14} />
                  Descargar
                </a>
                <button
                  className="icon-button"
                  aria-label={`Restaurar ${name}`}
                  title="Restaurar copia"
                  onClick={() => setRestore(name)}
                >
                  <RotateCcw size={16} />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <Empty title="Todavía no hay copias">Creá una copia para respaldar la información.</Empty>
        )}
      </section>
      <section className="panel settings-panel">
        <div className="setting-title">
          <FileSpreadsheet size={24} />
          <div>
            <h3>Revisión de reservas de Excel</h3>
            <p className="muted">{data.pendingImports} registros pendientes de incorporar.</p>
          </div>
        </div>
        <p className="field-help">
          Cada registro se incorpora solo después de revisar habitación, fechas, tarifa y cobros.
          Los cobros históricos pueden registrarse como saldo inicial sin afectar la caja del día.
        </p>
        {candidates.length ? (
          <>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Huésped</th>
                    <th>Origen</th>
                    <th>Revisión</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {candidates.slice(0, limit).map((c) => (
                    <tr key={c.id}>
                      <td>
                        <strong>{c.guestName}</strong>
                      </td>
                      <td>
                        {c.sourceSheet} · fila {c.sourceRow}
                      </td>
                      <td>
                        <span className="state state-pending">
                          {c.issues.length} puntos a revisar
                        </span>
                      </td>
                      <td>
                        <button className="button small" onClick={() => onReview(c)}>
                          Revisar
                          <ChevronRight size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {candidates.length > limit && (
              <div className="load-more">
                <button className="button small" onClick={() => setLimit((x) => x + 30)}>
                  Mostrar 30 más
                </button>
              </div>
            )}
          </>
        ) : (
          <Empty title="No hay reservas pendientes de importar">
            La herramienta de importación del proyecto prepara los registros para revisarlos aquí.
            No modifica los Excel originales.
          </Empty>
        )}
      </section>
      {restore && (
        <RestoreForm
          name={restore}
          onClose={() => setRestore(null)}
          onSaved={async () => {
            setRestore(null);
            await onChanged();
            await load();
            onToast('Copia restaurada. El estado anterior quedó respaldado.');
          }}
        />
      )}
    </>
  );
}
function RestoreForm({
  name,
  onClose,
  onSaved,
}: {
  name: string;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function save(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      await post('/restore', { name, confirmation });
      await onSaved();
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      title="Restaurar copia de seguridad"
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <form onSubmit={save}>
        <div className="dialog-body">
          <div className="notice">
            Las reservas, consumiciones y caja volverán al estado de esta copia. Se guardará un
            respaldo de la información actual antes de restaurar.
          </div>
          <p className="backup-name">{name}</p>
          <Field label="Escribí RESTAURAR para continuar">
            <input
              required
              pattern="RESTAURAR"
              autoComplete="off"
              value={confirmation}
              onChange={(e) => setConfirmation(e.target.value)}
            />
          </Field>
          <ErrorBox error={error} />
        </div>
        <div className="dialog-footer">
          <button className="button" type="button" disabled={busy} onClick={onClose}>
            Cancelar
          </button>
          <Submit busy={busy || confirmation !== 'RESTAURAR'}>Restaurar copia</Submit>
        </div>
      </form>
    </Dialog>
  );
}
