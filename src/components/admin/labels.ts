import type { BadgeTone } from '../ui';

export const INSTRUCTOR_STATUS: Readonly<Record<'pending' | 'approved' | 'paused', { label: string; tone: BadgeTone }>> = {
  pending: { label: 'Em análise', tone: 'warning' },
  approved: { label: 'Aprovado', tone: 'success' },
  paused: { label: 'Pausado', tone: 'quiet' },
};

export const BOOKING_STATUS: Readonly<
  Record<'awaiting_payment' | 'confirmed' | 'completed' | 'cancelled', { label: string; tone: BadgeTone }>
> = {
  awaiting_payment: { label: 'Pendente', tone: 'warning' },
  confirmed: { label: 'Confirmada', tone: 'success' },
  completed: { label: 'Concluída', tone: 'brand' },
  cancelled: { label: 'Cancelada', tone: 'danger' },
};
