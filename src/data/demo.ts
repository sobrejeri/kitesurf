/**
 * Fictitious data for the Vento prototype.
 *
 * Everything here stands in for what an API would return. Money is integer
 * centavos and every amount is already computed — the screens only display
 * these values. That mirrors the rule the real product must follow: the
 * browser never derives a price, a commission or a payout. When the prototype
 * is wired to a backend, these constants are replaced by API responses, not by
 * arithmetic in components.
 */

export const LEVELS = ['Primeira vez', 'Já fiz aulas', 'Quero evoluir'] as const;
export const LANGUAGES = ['Português', 'Inglês', 'Espanhol', 'Francês', 'Alemão', 'Italiano'] as const;

export const MIN_HOURS = 1;
export const MAX_HOURS = 8;

/** Hourly rate as the server would publish it, for the "2h × R$ 300/hora" line. */
export const HOURLY_RATE_CENTS = 30_000;

/**
 * Quote previews by number of hours, as a quote endpoint would return them.
 * Looked up, never multiplied in the browser.
 */
export const QUOTE_PREVIEW_CENTS: Readonly<Record<number, number>> = {
  1: 30_000,
  2: 60_000,
  3: 90_000,
  4: 120_000,
  5: 150_000,
  6: 180_000,
  7: 210_000,
  8: 240_000,
};

export const STUDENT = {
  name: 'Luana',
  initials: 'L',
  language: 'Português',
  region: 'Ceará, Brasil',
  beaches: 'Preá e Jericoacoara',
} as const;

export const INSTRUCTOR = {
  name: 'Rafael Lima',
  firstName: 'Rafael',
  initials: 'RL',
  role: 'Instrutor independente',
  rating: '4,9',
  ratingCount: 62,
} as const;

export const ADMIN_TEAM = { name: 'Equipe Vento', initials: 'EV', role: 'Operação da plataforma' } as const;

export const PARTNER = {
  name: 'Pousada Mar & Vento',
  initials: 'PM',
  code: 'MAR-E-VENTO',
  beach: 'Preá',
  commissionLabel: '5%',
  contact: 'Recepção de demonstração · recepcao@exemplo.com',
} as const;

/** The one confirmed booking every role sees from its own side. */
export const BOOKING = {
  code: 'VNT-1042',
  title: 'Aula particular de kitesurf',
  status: 'Confirmada',
  beach: 'Preá',
  meetingPoint: 'Praia do Preá',
  day: '02',
  month: 'NOV.',
  dateLong: '02 de novembro',
  dateShort: '02 de nov.',
  weekdayHeading: 'SEG., 2 DE NOV.',
  time: '09:00',
  durationLabel: '2h',
  rescheduleDeadline: 'Solicite até 01/11, 09:00 · antecedência de 24h',
  presenceCode: '4826',
  studentLevel: 'Já fiz aulas',
  totalCents: 150_000,
  platformCents: 22_500,
  instructorNetCents: 127_500,
  transportCents: 0,
  partnerCents: 0,
  payoutCents: 0,
} as const;

/** Hours are minutes so the progress bar never handles fractions. */
export const LEARNING = {
  contractedMinutes: 360,
  doneMinutes: 90,
  scheduledMinutes: 120,
  availableMinutes: 150,
  donePercent: 25,
  stepsDone: 2,
  steps: [
    { title: 'Conhecer os equipamentos', done: true },
    { title: 'Entender o vento e a janela de voo', done: true },
    { title: 'Controlar o kite', done: false },
    { title: 'Body drag', done: false },
    { title: 'Waterstart', done: false },
    { title: 'Primeiros bordos', done: false },
  ],
  history: [
    {
      minutes: 90,
      date: '28 de outubro',
      instructor: 'Rafael Lima',
      note: 'Primeiro contato e controle básico do kite.',
    },
  ],
} as const;

export interface QueueEntry {
  position: number;
  name: string;
  initials: string;
  beaches: string;
  status: 'Disponível' | 'Pausado';
  tone: 'a1' | 'a2' | 'a3' | 'a4';
}

export const QUEUE: readonly QueueEntry[] = [
  { position: 1, name: 'Rafael Lima', initials: 'RL', beaches: 'Preá e Jericoacoara', status: 'Disponível', tone: 'a1' },
  { position: 2, name: 'Marina Costa', initials: 'MC', beaches: 'Preá', status: 'Disponível', tone: 'a2' },
  { position: 3, name: 'Pedro Alves', initials: 'PA', beaches: 'Preá', status: 'Disponível', tone: 'a3' },
  { position: 4, name: 'Bia Martins', initials: 'BM', beaches: 'Preá e Jericoacoara', status: 'Disponível', tone: 'a4' },
];

export interface InstructorRow {
  name: string;
  initials: string;
  years: number;
  beaches: string;
  languages: string;
  status: string;
  pending: boolean;
  tone: 'a1' | 'a2' | 'a3' | 'a4';
}

export const INSTRUCTORS: readonly InstructorRow[] = [
  { name: 'Rafael Lima', initials: 'RL', years: 8, beaches: 'Preá, Jericoacoara', languages: 'Português, Inglês', status: 'Aprovado · disponível', pending: false, tone: 'a1' },
  { name: 'Marina Costa', initials: 'MC', years: 6, beaches: 'Preá', languages: 'Português, Inglês, Espanhol', status: 'Aprovado · disponível', pending: false, tone: 'a2' },
  { name: 'Pedro Alves', initials: 'PA', years: 10, beaches: 'Preá', languages: 'Português, Inglês', status: 'Aprovado · disponível', pending: false, tone: 'a3' },
  { name: 'Bia Martins', initials: 'BM', years: 5, beaches: 'Preá, Jericoacoara', languages: 'Português, Inglês, Espanhol', status: 'Aprovado · disponível', pending: false, tone: 'a4' },
  { name: 'Camila Rocha', initials: 'CR', years: 4, beaches: 'Preá', languages: 'Português', status: 'Em análise', pending: true, tone: 'a2' },
];

export const DEMO_PROFILES = ['Rafael', 'Marina', 'Pedro', 'Bia', 'Camila'] as const;

export const PARTNERS = [
  { name: 'Pousada Mar & Vento', code: 'MAR-E-VENTO', commission: '5%', bookings: 0, status: 'Aprovada' },
  { name: 'Pousada Sol do Preá', code: 'SOL-DO-PREA', commission: '5%', bookings: 0, status: 'Em análise' },
] as const;

export const VEHICLES = [
  { name: 'Veículo de apoio', code: 'APOIO-01', seats: 4, hourlyCents: 10_000, status: 'Ativo' },
] as const;

export const OPERATION_RULES = {
  offerResponse: '2 min',
  searchTotal: '6 min',
  payment: '10 min',
  pauseAfter: '3 expirações',
} as const;

/** Seven days of the instructor's expected net, already computed per day. */
export const NET_BY_DAY: readonly { label: string; cents: number }[] = [
  { label: '30/10', cents: 0 },
  { label: '31/10', cents: 0 },
  { label: '01/11', cents: 0 },
  { label: '02/11', cents: 127_500 },
  { label: '03/11', cents: 0 },
  { label: '04/11', cents: 0 },
  { label: '05/11', cents: 0 },
];

export const EVENT_LOG = [
  { text: 'Fila iniciada: recusas e expirações preservam a prioridade.', meta: '16:44 · registro da operação' },
] as const;

export const INCIDENT_TYPES = ['Condições de vento', 'Cancelamento', 'Aluno ausente', 'Instrutor ausente'] as const;

export const DEMO_NOTICE =
  'Demonstração neste navegador. Nenhuma mensagem externa, cobrança, reembolso ou transferência é realizada.';
