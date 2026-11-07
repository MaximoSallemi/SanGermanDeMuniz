import { z } from 'zod';
import { daysBetween } from '../shared/domain.ts';

export const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Usá una fecha válida.')
  .refine((value) => {
    const parsed = new Date(`${value}T12:00:00Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  }, 'La fecha no existe.');
export const cents = z.number().int().min(0).max(1_000_000_000_000);
export const method = z.enum(['cash', 'transfer', 'card']);
const text = (max = 200) => z.string().trim().max(max);
export const assignment = z
  .object({
    id: z.string().optional(),
    roomId: z.number().int().min(1).max(9),
    checkIn: date,
    checkOut: date,
  })
  .strict()
  .refine(
    (a) => a.checkOut > a.checkIn && daysBetween(a.checkIn, a.checkOut) <= 1096,
    'La salida debe ser posterior al ingreso (máximo 3 años).',
  );
export const historicalPayment = z
  .object({
    method,
    amountCents: cents.refine((n) => n > 0),
    allocation: z.enum(['lodging', 'consumption']).default('lodging'),
  })
  .strict();
export const reservationSchema = z
  .object({
    guestName: text().min(2, 'Ingresá el nombre del huésped.'),
    document: text().default(''),
    phone: text().default(''),
    email: text()
      .refine((x) => !x || z.email().safeParse(x).success, 'El email no es válido.')
      .default(''),
    fiscalData: text(1000).default(''),
    bookedOn: date,
    pax: z.number().int().min(1).max(100),
    lodgingCents: cents,
    state: z.enum(['pending', 'confirmed', 'checked_in', 'checked_out', 'cancelled']),
    channel: z.enum(['direct', 'booking', 'other']),
    visualTag: z.enum(['auto', 'fondeo', 'family', 'booking', 'data', 'dinner']),
    notes: text(15000).default(''),
    assignments: z.array(assignment).min(1).max(30),
    version: z.number().int().positive().optional(),
    importId: z.string().optional(),
    historicalPayments: z.array(historicalPayment).max(20).optional(),
  })
  .strict();
export const consumptionSchema = z
  .object({
    roomId: z.number().int().min(1).max(9),
    date,
    description: text().min(1),
    quantity: z.number().int().min(1).max(10000),
    unitCents: cents,
    notes: text(2000).default(''),
  })
  .strict();
export const paymentSchema = z
  .object({
    date,
    method,
    amountCents: cents.refine((n) => n > 0, 'El importe debe ser mayor a cero.'),
    allocation: z.enum(['lodging', 'consumption']),
    notes: text(2000).default(''),
  })
  .strict();
export const movementSchema = z
  .object({
    date,
    method,
    amountCents: cents.refine((n) => n > 0),
    direction: z.enum(['income', 'expense']),
    description: text(500).min(1),
    category: text().min(1),
  })
  .strict();
export const openSchema = z
  .object({ date, openingCents: cents, notes: text(2000).default('') })
  .strict();
export const closeSchema = z
  .object({ countedCents: cents, notes: text(2000).default('') })
  .strict();
export const reverseSchema = z
  .object({ date, reason: text(2000).min(3, 'Indicá el motivo de la corrección.') })
  .strict();
export const reasonSchema = z
  .object({ reason: text(2000).min(3, 'Indicá el motivo de la corrección.') })
  .strict();
