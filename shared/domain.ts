export const ROOMS = [
  { id: 1, name: 'PB 1 Farias', floor: 'Planta baja', short: '01' },
  { id: 2, name: 'PB 2 Farias', floor: 'Planta baja', short: '02' },
  { id: 3, name: 'PB 3 Jardín', floor: 'Planta baja', short: '03' },
  { id: 4, name: 'PB 4 Jardín', floor: 'Planta baja', short: '04' },
  { id: 5, name: 'PA 5 Farias', floor: 'Planta alta', short: '05' },
  { id: 6, name: 'PA 6 Farias', floor: 'Planta alta', short: '06' },
  { id: 7, name: 'PA 7 Jardín', floor: 'Planta alta', short: '07' },
  { id: 8, name: 'PA 8 Jardín', floor: 'Planta alta', short: '08' },
  { id: 9, name: 'PA 9 Medio', floor: 'Planta alta', short: '09' },
] as const;

export const LEGEND = [
  { key: 'balance', label: 'Falta abonar', color: '#ff0000', ink: '#ffffff' },
  { key: 'paid', label: 'Abonó todo', color: '#00ff00', ink: '#153516' },
  { key: 'pending', label: 'A confirmar', color: '#ffff00', ink: '#4c4200' },
  { key: 'fondeo', label: 'Fondeo', color: '#ff00ff', ink: '#4d004d' },
  { key: 'family', label: 'Fer y flia', color: '#00ffff', ink: '#004c4c' },
  { key: 'booking', label: 'Booking', color: '#0000ff', ink: '#ffffff' },
  { key: 'data', label: 'Datos', color: '#fce5cd', ink: '#5b3b1a' },
  { key: 'dinner', label: 'Cena 14', color: '#ff9900', ink: '#4e3000' },
] as const;
export const STATES = {
  pending: 'A confirmar',
  confirmed: 'Confirmada',
  checked_in: 'Hospedado',
  checked_out: 'Finalizada',
  cancelled: 'Cancelada',
} as const;
export const METHODS = { cash: 'Efectivo', transfer: 'Transferencia', card: 'Tarjeta' } as const;
export type State = keyof typeof STATES;
export type Method = keyof typeof METHODS;
export type VisualTag = 'auto' | 'fondeo' | 'family' | 'booking' | 'data' | 'dinner';
export type Assignment = { id?: string; roomId: number; checkIn: string; checkOut: string };
export type ReservationInput = {
  guestName: string;
  document: string;
  phone: string;
  email: string;
  fiscalData: string;
  bookedOn: string;
  pax: number;
  lodgingCents: number;
  state: State;
  channel: 'direct' | 'booking' | 'other';
  visualTag: VisualTag;
  notes: string;
  assignments: Assignment[];
};
export type Reservation = ReservationInput & {
  id: string;
  number: number;
  createdAt: string;
  updatedAt: string;
  version: number;
  checkIn: string;
  checkOut: string;
  consumptionCents: number;
  paidCents: number;
  lodgingPaidCents: number;
  consumptionPaidCents: number;
  balanceCents: number;
  paidByMethod: Record<Method, number>;
};
export type Consumption = {
  id: string;
  reservationId: string;
  roomId: number;
  date: string;
  description: string;
  quantity: number;
  unitCents: number;
  totalCents: number;
  notes: string;
  voidedAt: string | null;
  voidReason: string | null;
};
export type Movement = {
  id: string;
  date: string;
  direction: 'income' | 'expense';
  method: Method;
  amountCents: number;
  description: string;
  category: string;
  reservationId: string | null;
  reservationNumber?: number;
  source: 'manual' | 'payment' | 'reversal';
  reversalOf: string | null;
  reversedBy: string | null;
  createdAt: string;
};
export type Payment = {
  id: string;
  reservationId: string;
  date: string;
  amountCents: number;
  method: Method;
  allocation: 'lodging' | 'consumption';
  notes: string;
  movementId: string | null;
  reversedBy: string | null;
  origin?: string;
  voidedAt: string | null;
};
export type CashSession = {
  id: string;
  date: string;
  openingCents: number;
  countedCents: number | null;
  expectedCents: number;
  differenceCents: number | null;
  incomeCents: number;
  expenseCents: number;
  closedAt: string | null;
  notes: string;
};
export type ImportCandidate = {
  id: string;
  sourceFile: string;
  sourceSheet: string;
  sourceRow: string;
  guestName: string;
  proposedJson: string;
  rawJson: string;
  status: 'pending' | 'imported' | 'dismissed';
  issues: string[];
};
export type Bootstrap = {
  today: string;
  rooms: typeof ROOMS;
  reservations: Reservation[];
  sessions: CashSession[];
  movements: Movement[];
  consumptions: Consumption[];
  products: { description: string; unitCents: number }[];
  pendingImports: number;
  dataPath: string;
};
export type Detail = {
  reservation: Reservation;
  consumptions: Consumption[];
  payments: Payment[];
  history: { id: string; action: string; summary: string; createdAt: string }[];
};

export function todayLocal() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/Buenos_Aires',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const part = (name: string) => parts.find((p) => p.type === name)!.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}
export function addDays(date: string, count: number) {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + count);
  return d.toISOString().slice(0, 10);
}
export function daysBetween(start: string, end: string) {
  return Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86400000);
}
export function money(cents: number) {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: cents % 100 ? 2 : 0,
  }).format(cents / 100);
}
export function dateLabel(
  date: string,
  options: Intl.DateTimeFormatOptions = { day: '2-digit', month: 'short' },
) {
  return new Intl.DateTimeFormat('es-AR', { ...options, timeZone: 'UTC' }).format(
    new Date(`${date}T12:00:00Z`),
  );
}
export function colorFor(reservation: Reservation) {
  const key =
    reservation.visualTag !== 'auto'
      ? reservation.visualTag
      : reservation.state === 'pending'
        ? 'pending'
        : reservation.channel === 'booking'
          ? 'booking'
          : reservation.balanceCents > 0
            ? 'balance'
            : 'paid';
  return LEGEND.find((x) => x.key === key)!;
}
