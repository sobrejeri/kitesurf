/**
 * DEMONSTRATIVO. VentoKite Business ainda não tem tabelas no banco: tudo aqui
 * é dado fictício para a interface. Nenhuma tela grava ou lê dados reais de
 * escolas. Quando o esquema multiempresa for aprovado, estas funções são
 * trocadas por consultas protegidas por RLS, sem mudar as telas.
 */
export const DEMO_NOTICE = 'Dados demonstrativos: o módulo Business ainda não grava nem lê dados reais.';

export type RoleId = 'owner' | 'manager' | 'finance' | 'attendant';
export interface Unit {
  id: string; name: string; city: string; address: string;
  lat: number; lng: number; opens: string; closes: string; active: boolean;
}
export interface Employee {
  id: string; name: string; email: string;
  assignments: { unitId: string; role: RoleId }[];
}
export type LinkStatus = 'active' | 'invited' | 'suspended';
export interface InstructorLink {
  id: string; name: string; status: LinkStatus; unitIds: string[];
  commissionBps: number; independentQueue: boolean;
}
export interface Lesson {
  id: string; unitId: string; instructorId: string; service: string;
  dayOffset: number; start: string; minutes: number; origin: 'digital' | 'presencial';
}

export const COMPANY = { id: 'emp-1', name: 'Escola Ventos do Norte (demonstração)', plan: 'Demonstração' };

export const UNITS: readonly Unit[] = [
  { id: 'u-prea', name: 'Preá Beach', city: 'Cruz', address: 'Av. da Praia, 120, Preá', lat: -2.8, lng: -40.4, opens: '07:00', closes: '17:00', active: true },
  { id: 'u-jeri-centro', name: 'Jeri Centro', city: 'Jijoca de Jericoacoara', address: 'Rua Principal, 45, Jericoacoara', lat: -2.79, lng: -40.51, opens: '08:00', closes: '18:00', active: true },
  { id: 'u-jeri-lagoa', name: 'Jeri Lagoa do Paraíso', city: 'Jijoca de Jericoacoara', address: 'Estrada da Lagoa, km 3', lat: -2.85, lng: -40.46, opens: '08:00', closes: '16:00', active: true },
  { id: 'u-camocim', name: 'Camocim Barra', city: 'Camocim', address: 'Orla da Barra, 8', lat: -2.9, lng: -40.84, opens: '08:00', closes: '16:00', active: false },
];

export const ROLES: readonly { id: RoleId; label: string; summary: string }[] = [
  { id: 'owner', label: 'Proprietário', summary: 'Visão consolidada e todas as permissões.' },
  { id: 'manager', label: 'Gerente', summary: 'Opera a unidade: agenda, equipe e serviços.' },
  { id: 'finance', label: 'Financeiro', summary: 'Caixa, despesas, relatórios e comissões.' },
  { id: 'attendant', label: 'Atendente', summary: 'Reservas presenciais e atendimento.' },
];

export const PERMISSIONS: readonly { id: string; label: string; group: string; sensitive?: boolean }[] = [
  { id: 'units.view', label: 'Ver unidade', group: 'Unidades' },
  { id: 'units.edit', label: 'Editar unidade', group: 'Unidades', sensitive: true },
  { id: 'staff.view', label: 'Ver funcionários', group: 'Pessoas' },
  { id: 'staff.manage', label: 'Convidar e editar funcionários', group: 'Pessoas', sensitive: true },
  { id: 'perm.edit', label: 'Alterar permissões', group: 'Pessoas', sensitive: true },
  { id: 'instr.view', label: 'Ver instrutores', group: 'Instrutores' },
  { id: 'instr.manage', label: 'Vincular e suspender instrutores', group: 'Instrutores', sensitive: true },
  { id: 'agenda.view', label: 'Ver agenda', group: 'Agenda' },
  { id: 'agenda.edit', label: 'Criar e mover aulas', group: 'Agenda' },
  { id: 'cash.operate', label: 'Operar caixa', group: 'Financeiro' },
  { id: 'cash.close', label: 'Fechar caixa', group: 'Financeiro', sensitive: true },
  { id: 'finance.reports', label: 'Ver relatórios financeiros', group: 'Financeiro' },
];

const ALL = PERMISSIONS.map((p) => p.id);
export const ROLE_PERMISSIONS: Readonly<Record<RoleId, readonly string[]>> = {
  owner: ALL,
  manager: ['units.view', 'units.edit', 'staff.view', 'instr.view', 'instr.manage', 'agenda.view', 'agenda.edit', 'cash.operate', 'finance.reports'],
  finance: ['units.view', 'staff.view', 'cash.operate', 'cash.close', 'finance.reports'],
  attendant: ['units.view', 'instr.view', 'agenda.view', 'agenda.edit', 'cash.operate'],
};

export const EMPLOYEES: readonly Employee[] = [
  { id: 'f-1', name: 'Marcos Almeida', email: 'marcos@ventosdonorte.example', assignments: UNITS.map((u) => ({ unitId: u.id, role: 'owner' as const })) },
  { id: 'f-2', name: 'Paula Reis', email: 'paula@ventosdonorte.example', assignments: [{ unitId: 'u-prea', role: 'manager' }, { unitId: 'u-jeri-centro', role: 'attendant' }] },
  { id: 'f-3', name: 'Diego Furtado', email: 'diego@ventosdonorte.example', assignments: [{ unitId: 'u-jeri-centro', role: 'manager' }, { unitId: 'u-jeri-lagoa', role: 'manager' }] },
  { id: 'f-4', name: 'Aline Souza', email: 'aline@ventosdonorte.example', assignments: UNITS.map((u) => ({ unitId: u.id, role: 'finance' as const })) },
  { id: 'f-5', name: 'Rafaela Costa', email: 'rafaela@ventosdonorte.example', assignments: [{ unitId: 'u-prea', role: 'attendant' }] },
  { id: 'f-6', name: 'Tiago Nogueira', email: 'tiago@ventosdonorte.example', assignments: [{ unitId: 'u-jeri-lagoa', role: 'attendant' }] },
];

export const INSTRUCTORS: readonly InstructorLink[] = [
  { id: 'i-1', name: 'Rafael Lima', status: 'active', unitIds: ['u-prea', 'u-jeri-centro'], commissionBps: 6000, independentQueue: true },
  { id: 'i-2', name: 'Camila Santos', status: 'active', unitIds: ['u-jeri-centro', 'u-jeri-lagoa'], commissionBps: 5500, independentQueue: true },
  { id: 'i-3', name: 'Bruno Teixeira', status: 'active', unitIds: ['u-prea'], commissionBps: 6000, independentQueue: false },
  { id: 'i-4', name: 'Larissa Moura', status: 'invited', unitIds: ['u-jeri-lagoa'], commissionBps: 5500, independentQueue: true },
  { id: 'i-5', name: 'Otávio Pires', status: 'suspended', unitIds: ['u-prea'], commissionBps: 5000, independentQueue: true },
];

export const LESSONS: readonly Lesson[] = [
  { id: 'a-1', unitId: 'u-prea', instructorId: 'i-1', service: 'Aula iniciante', dayOffset: 0, start: '09:00', minutes: 120, origin: 'digital' },
  { id: 'a-2', unitId: 'u-jeri-centro', instructorId: 'i-1', service: 'Aula intermediária', dayOffset: 0, start: '10:00', minutes: 60, origin: 'presencial' },
  { id: 'a-3', unitId: 'u-jeri-centro', instructorId: 'i-2', service: 'Aula iniciante', dayOffset: 0, start: '14:00', minutes: 120, origin: 'presencial' },
  { id: 'a-4', unitId: 'u-prea', instructorId: 'i-3', service: 'Aula avançada', dayOffset: 1, start: '08:00', minutes: 120, origin: 'digital' },
  { id: 'a-5', unitId: 'u-jeri-lagoa', instructorId: 'i-2', service: 'Aula iniciante', dayOffset: 1, start: '09:00', minutes: 120, origin: 'presencial' },
  { id: 'a-6', unitId: 'u-jeri-centro', instructorId: 'i-2', service: 'Aula intermediária', dayOffset: 1, start: '11:00', minutes: 60, origin: 'digital' },
  { id: 'a-7', unitId: 'u-prea', instructorId: 'i-1', service: 'Aula iniciante', dayOffset: 2, start: '15:00', minutes: 120, origin: 'presencial' },
];

export const NOTIFICATIONS = [
  { id: 'n-1', text: 'Convite enviado a Larissa Moura aguarda resposta.', href: '/admin/business/instrutores' },
  { id: 'n-2', text: 'Conflito de agenda detectado entre unidades.', href: '/admin/business/agenda' },
] as const;

// ---- Bloco 4: serviços e preços (demonstrativo) ----
export interface Service { id: string; name: string; minutes: number; capacity: number; baseCents: number; description: string }
/** A service is registered once and enabled per unit, with its own price, instructors, days and place. */
export interface UnitService { serviceId: string; unitId: string; priceCents: number | null; instructorIds: string[]; weekdays: number[]; place: string }
export interface PackageOffer { id: string; name: string; serviceId: string; lessons: number; priceCents: number; validDays: number }

export const SERVICES: readonly Service[] = [
  { id: 's-ini', name: 'Aula iniciante', minutes: 120, capacity: 2, baseCents: 26000, description: 'Primeiro contato: segurança, vento e controle da pipa.' },
  { id: 's-int', name: 'Aula intermediária', minutes: 60, capacity: 2, baseCents: 15000, description: 'Body drag, partida na prancha e direção.' },
  { id: 's-ava', name: 'Aula avançada', minutes: 120, capacity: 1, baseCents: 34000, description: 'Bordejos, saltos e manobras, individual.' },
];

export const UNIT_SERVICES: readonly UnitService[] = [
  { serviceId: 's-ini', unitId: 'u-prea', priceCents: null, instructorIds: ['i-1', 'i-3'], weekdays: [1, 2, 3, 4, 5, 6], place: 'Praia do Preá, ponto 2' },
  { serviceId: 's-ini', unitId: 'u-jeri-centro', priceCents: 28000, instructorIds: ['i-1', 'i-2'], weekdays: [0, 1, 2, 3, 4, 5, 6], place: 'Praia de Jericoacoara, em frente ao Pôr do Sol' },
  { serviceId: 's-ini', unitId: 'u-jeri-lagoa', priceCents: 30000, instructorIds: ['i-2'], weekdays: [3, 4, 5, 6], place: 'Lagoa do Paraíso, deck principal' },
  { serviceId: 's-int', unitId: 'u-prea', priceCents: null, instructorIds: ['i-1', 'i-3'], weekdays: [1, 2, 3, 4, 5, 6], place: 'Praia do Preá, ponto 2' },
  { serviceId: 's-int', unitId: 'u-jeri-centro', priceCents: 16500, instructorIds: ['i-2'], weekdays: [1, 2, 3, 4, 5], place: 'Praia de Jericoacoara, em frente ao Pôr do Sol' },
  { serviceId: 's-ava', unitId: 'u-prea', priceCents: 36000, instructorIds: ['i-3'], weekdays: [2, 4, 6], place: 'Praia do Preá, ponto 3' },
];

export const PACKAGES: readonly PackageOffer[] = [
  { id: 'p-1', name: 'Pacote 5 aulas iniciante', serviceId: 's-ini', lessons: 5, priceCents: 120000, validDays: 90 },
  { id: 'p-2', name: 'Pacote 3 aulas intermediárias', serviceId: 's-int', lessons: 3, priceCents: 42000, validDays: 60 },
];

// ---- Bloco 10: reservas presenciais (demonstrativo) ----
export type ExternalStatus = 'confirmed' | 'done' | 'cancelled';
/** Booked at the counter. The "PRE-" code marks the origin: no platform fee applies. */
export interface ExternalBooking {
  id: string; code: string; unitId: string; serviceId: string; instructorId: string;
  dayOffset: number; start: string; minutes: number; customer: string; priceCents: number; status: ExternalStatus;
}
export const EXTERNAL_BOOKINGS: readonly ExternalBooking[] = [
  { id: 'e-1', code: 'PRE-0001', unitId: 'u-jeri-centro', serviceId: 's-ini', instructorId: 'i-2', dayOffset: 2, start: '09:00', minutes: 120, customer: 'Cliente Demo A', priceCents: 28000, status: 'confirmed' },
  { id: 'e-2', code: 'PRE-0002', unitId: 'u-prea', serviceId: 's-int', instructorId: 'i-3', dayOffset: 1, start: '10:00', minutes: 60, customer: 'Cliente Demo B', priceCents: 15000, status: 'confirmed' },
  { id: 'e-3', code: 'PRE-0003', unitId: 'u-jeri-lagoa', serviceId: 's-ini', instructorId: 'i-2', dayOffset: 3, start: '09:00', minutes: 120, customer: 'Cliente Demo C', priceCents: 30000, status: 'confirmed' },
  { id: 'e-4', code: 'PRE-0004', unitId: 'u-prea', serviceId: 's-ini', instructorId: 'i-1', dayOffset: -1, start: '15:00', minutes: 120, customer: 'Cliente Demo D', priceCents: 26000, status: 'done' },
  { id: 'e-5', code: 'PRE-0005', unitId: 'u-jeri-centro', serviceId: 's-int', instructorId: 'i-2', dayOffset: 1, start: '14:00', minutes: 60, customer: 'Cliente Demo E', priceCents: 16500, status: 'cancelled' },
];

// ---- Bloco 6: caixa e fechamento (demonstrativo) ----
export type MovementKind = 'sale' | 'supply' | 'bleed' | 'expense';
/** External methods are recorded only: the platform never charges or transfers anything here. */
export type PaymentMethod = 'cash' | 'pix_external' | 'card_external';
export interface CashMovement { id: string; sessionId: string; kind: MovementKind; method?: PaymentMethod; cents: number; note: string; time: string }
export interface CashSession {
  id: string; unitId: string; operator: string; dayOffset: number; openingCents: number;
  closing?: { countedCents: number; reason: string };
}
export const CASH_SESSIONS: readonly CashSession[] = [
  { id: 'cs-1', unitId: 'u-prea', operator: 'Paula Reis', dayOffset: 0, openingCents: 20000 },
  { id: 'cs-2', unitId: 'u-jeri-centro', operator: 'Diego Furtado', dayOffset: -1, openingCents: 15000, closing: { countedCents: 19500, reason: 'Troco entregue sem registro' } },
  { id: 'cs-3', unitId: 'u-prea', operator: 'Rafaela Costa', dayOffset: -2, openingCents: 20000, closing: { countedCents: 8000, reason: '' } },
];
export const CASH_MOVEMENTS: readonly CashMovement[] = [
  { id: 'm-1', sessionId: 'cs-1', kind: 'sale', method: 'cash', cents: 15000, note: 'Aula intermediária PRE-0002', time: '08:40' },
  { id: 'm-2', sessionId: 'cs-1', kind: 'sale', method: 'pix_external', cents: 26000, note: 'Aula iniciante, Pix recebido na conta da escola', time: '09:10' },
  { id: 'm-3', sessionId: 'cs-1', kind: 'supply', method: 'cash', cents: 5000, note: 'Reforço de troco', time: '09:30' },
  { id: 'm-4', sessionId: 'cs-1', kind: 'bleed', method: 'cash', cents: 30000, note: 'Depósito para o cofre', time: '11:00' },
  { id: 'm-5', sessionId: 'cs-1', kind: 'expense', method: 'cash', cents: 2500, note: 'Água para os alunos', time: '11:20' },
  { id: 'm-6', sessionId: 'cs-2', kind: 'sale', method: 'cash', cents: 28000, note: 'Aula iniciante', time: '09:05' },
  { id: 'm-7', sessionId: 'cs-2', kind: 'sale', method: 'card_external', cents: 28000, note: 'Aula iniciante, maquininha da escola', time: '10:15' },
  { id: 'm-8', sessionId: 'cs-2', kind: 'expense', method: 'cash', cents: 3000, note: 'Gelo e lanche da equipe', time: '12:00' },
  { id: 'm-9', sessionId: 'cs-2', kind: 'bleed', method: 'cash', cents: 20000, note: 'Retirada do gerente', time: '16:30' },
  { id: 'm-10', sessionId: 'cs-3', kind: 'sale', method: 'cash', cents: 30000, note: 'Aula iniciante', time: '09:20' },
  { id: 'm-11', sessionId: 'cs-3', kind: 'expense', method: 'cash', cents: 2000, note: 'Material de limpeza', time: '13:00' },
  { id: 'm-12', sessionId: 'cs-3', kind: 'bleed', method: 'cash', cents: 40000, note: 'Depósito para o cofre', time: '17:00' },
];

export type ClosingMode = 'daily' | 'shift' | 'manual';
export const CLOSING_MODES: readonly { id: ClosingMode; label: string; hint: string }[] = [
  { id: 'daily', label: 'Fechamento diário', hint: 'Um caixa por dia, conferido ao fim do expediente.' },
  { id: 'shift', label: 'Fechamento por turno', hint: 'Cada turno abre e fecha o seu caixa.' },
  { id: 'manual', label: 'Fechamento manual', hint: 'O gerente decide quando fechar.' },
];
export type PrintPurpose = 'closing' | 'sale' | 'booking' | 'rental' | 'bleed' | 'supply' | 'external_payment';
export const PRINT_PURPOSES: readonly { id: PrintPurpose; label: string }[] = [
  { id: 'closing', label: 'Fechamento de caixa' }, { id: 'sale', label: 'Vendas' }, { id: 'booking', label: 'Reservas' }, { id: 'rental', label: 'Aluguéis' },
  { id: 'bleed', label: 'Sangrias' }, { id: 'supply', label: 'Suprimentos' }, { id: 'external_payment', label: 'Pagamentos externos registrados' },
];

// ---- Bloco 7: financeiro (demonstrativo) ----
export interface FinEntry { id: string; unitId: string; kind: 'revenue' | 'expense'; category: string; cents: number; dayOffset: number; employeeId: string; note: string }
export const FIN_ENTRIES: readonly FinEntry[] = [
  { id: 'fe-1', unitId: 'u-prea', kind: 'revenue', category: 'Aulas', cents: 52000, dayOffset: -1, employeeId: 'f-2', note: 'Aulas do dia' },
  { id: 'fe-2', unitId: 'u-jeri-centro', kind: 'revenue', category: 'Aulas', cents: 56000, dayOffset: -1, employeeId: 'f-3', note: 'Aulas do dia' },
  { id: 'fe-3', unitId: 'u-prea', kind: 'revenue', category: 'Aluguel de equipamentos', cents: 16000, dayOffset: -2, employeeId: 'f-5', note: 'Pranchas e trapézios' },
  { id: 'fe-4', unitId: 'u-jeri-lagoa', kind: 'revenue', category: 'Aulas', cents: 30000, dayOffset: -3, employeeId: 'f-6', note: 'Aula iniciante' },
  { id: 'fe-5', unitId: 'u-jeri-centro', kind: 'revenue', category: 'Loja', cents: 24000, dayOffset: -4, employeeId: 'f-3', note: 'Camisetas e protetor' },
  { id: 'fe-6', unitId: 'u-prea', kind: 'revenue', category: 'Aulas', cents: 78000, dayOffset: -5, employeeId: 'f-2', note: 'Aulas do dia' },
  { id: 'fe-7', unitId: 'u-prea', kind: 'revenue', category: 'Aulas', cents: 26000, dayOffset: 0, employeeId: 'f-5', note: 'Aula iniciante' },
  { id: 'fx-1', unitId: 'u-prea', kind: 'expense', category: 'Manutenção', cents: 12000, dayOffset: -2, employeeId: 'f-2', note: 'Reparo de pipa' },
  { id: 'fx-2', unitId: 'u-jeri-centro', kind: 'expense', category: 'Marketing', cents: 20000, dayOffset: -3, employeeId: 'f-3', note: 'Anúncio local' },
  { id: 'fx-3', unitId: 'u-jeri-lagoa', kind: 'expense', category: 'Aluguel do espaço', cents: 45000, dayOffset: -6, employeeId: 'f-3', note: 'Deck da lagoa' },
  { id: 'fx-4', unitId: 'u-prea', kind: 'expense', category: 'Água e energia', cents: 18000, dayOffset: -1, employeeId: 'f-2', note: 'Conta do mês' },
  { id: 'fx-5', unitId: 'u-jeri-centro', kind: 'expense', category: 'Alimentação', cents: 3000, dayOffset: -1, employeeId: 'f-3', note: 'Gelo e lanche da equipe' },
];
export interface Receivable { id: string; unitId: string; party: string; dueOffset: number; cents: number; receivedCents: number }
export const RECEIVABLES: readonly Receivable[] = [
  { id: 'rc-1', unitId: 'u-jeri-centro', party: 'Hotel Dunas (pacote de hóspedes)', dueOffset: 5, cents: 90000, receivedCents: 0 },
  { id: 'rc-2', unitId: 'u-prea', party: 'Pousada Vila Kite', dueOffset: -3, cents: 150000, receivedCents: 60000 },
  { id: 'rc-3', unitId: 'u-jeri-lagoa', party: 'Agência Mar Azul', dueOffset: -10, cents: 80000, receivedCents: 80000 },
];
export interface Payable { id: string; unitId: string; party: string; dueOffset: number; cents: number; paidCents: number }
export const PAYABLES: readonly Payable[] = [
  { id: 'pg-1', unitId: 'u-prea', party: 'Oficina do Vento', dueOffset: 2, cents: 12000, paidCents: 0 },
  { id: 'pg-2', unitId: 'u-jeri-centro', party: 'Marketing Local', dueOffset: -2, cents: 20000, paidCents: 20000 },
  { id: 'pg-3', unitId: 'u-jeri-lagoa', party: 'Locação do espaço', dueOffset: 10, cents: 45000, paidCents: 15000 },
];
/** The percentage is frozen on each lesson: changing an instructor's rate later never rewrites old lessons. */
export interface CommissionItem { id: string; instructorId: string; unitId: string; lesson: string; dayOffset: number; baseCents: number; commissionBps: number }
export const COMMISSION_ITEMS: readonly CommissionItem[] = [
  { id: 'ci-1', instructorId: 'i-1', unitId: 'u-prea', lesson: 'Aula iniciante', dayOffset: -6, baseCents: 26000, commissionBps: 6000 },
  { id: 'ci-2', instructorId: 'i-1', unitId: 'u-jeri-centro', lesson: 'Aula iniciante', dayOffset: -4, baseCents: 28000, commissionBps: 6000 },
  { id: 'ci-3', instructorId: 'i-1', unitId: 'u-prea', lesson: 'Aula iniciante', dayOffset: -1, baseCents: 26000, commissionBps: 6000 },
  { id: 'ci-4', instructorId: 'i-2', unitId: 'u-jeri-centro', lesson: 'Aula iniciante', dayOffset: -5, baseCents: 28000, commissionBps: 5500 },
  { id: 'ci-5', instructorId: 'i-2', unitId: 'u-jeri-lagoa', lesson: 'Aula iniciante', dayOffset: -3, baseCents: 30000, commissionBps: 5500 },
  { id: 'ci-6', instructorId: 'i-2', unitId: 'u-jeri-centro', lesson: 'Aula intermediária', dayOffset: -1, baseCents: 15000, commissionBps: 5500 },
  { id: 'ci-7', instructorId: 'i-3', unitId: 'u-prea', lesson: 'Aula iniciante', dayOffset: -9, baseCents: 26000, commissionBps: 5500 },
  { id: 'ci-8', instructorId: 'i-3', unitId: 'u-prea', lesson: 'Aula avançada', dayOffset: -3, baseCents: 34000, commissionBps: 6000 },
];
export type ExternalMethod = 'pix' | 'ted' | 'cash';
/** Paid by the school outside VentoKite. The platform only records it; the instructor confirms receipt. */
export interface ExternalPayment { id: string; instructorId: string; cents: number; dayOffset: number; method: ExternalMethod; reference: string; confirmed: boolean }
export const EXTERNAL_PAYMENTS: readonly ExternalPayment[] = [
  { id: 'xp-1', instructorId: 'i-1', cents: 20000, dayOffset: -3, method: 'pix', reference: 'PIX-A1B2', confirmed: true },
  { id: 'xp-2', instructorId: 'i-2', cents: 10000, dayOffset: -2, method: 'pix', reference: 'PIX-C3D4', confirmed: false },
  { id: 'xp-3', instructorId: 'i-1', cents: 15000, dayOffset: -1, method: 'ted', reference: 'TED-9921', confirmed: false },
];

// ---- Bloco 9: estoque e aluguéis (demonstrativo) ----
export interface Product { id: string; sku: string; name: string; category: string; priceCents: number; minStock: number }
export type StockMovementType = 'in' | 'sale' | 'adjust' | 'transfer_out' | 'transfer_in';
/** The ledger is the source of truth: stock of a product in a unit is the sum of its movements. */
export interface StockMovement { id: string; productId: string; unitId: string; type: StockMovementType; qty: number; dayOffset: number; note: string; transferId?: string }
export const PRODUCTS: readonly Product[] = [
  { id: 'p-cam', sku: 'CAM-VK', name: 'Camiseta VentoKite', category: 'Vestuário', priceCents: 6000, minStock: 5 },
  { id: 'p-pro', sku: 'PRO-50', name: 'Protetor solar FPS 50', category: 'Cuidados', priceCents: 3500, minStock: 6 },
  { id: 'p-bon', sku: 'BON-VK', name: 'Boné VentoKite', category: 'Vestuário', priceCents: 4500, minStock: 3 },
  { id: 'p-oc', sku: 'OCL-01', name: 'Óculos de sol', category: 'Acessórios', priceCents: 9000, minStock: 3 },
  { id: 'p-bol', sku: 'BOL-ST', name: 'Bolsa estanque', category: 'Acessórios', priceCents: 12000, minStock: 2 },
];
export const STOCK_MOVEMENTS: readonly StockMovement[] = [
  { id: 'sm-1', productId: 'p-cam', unitId: 'u-prea', type: 'in', qty: 20, dayOffset: -20, note: 'Estoque inicial' },
  { id: 'sm-2', productId: 'p-cam', unitId: 'u-jeri-centro', type: 'in', qty: 15, dayOffset: -20, note: 'Estoque inicial' },
  { id: 'sm-3', productId: 'p-cam', unitId: 'u-jeri-lagoa', type: 'in', qty: 5, dayOffset: -20, note: 'Estoque inicial' },
  { id: 'sm-4', productId: 'p-cam', unitId: 'u-prea', type: 'sale', qty: -3, dayOffset: -5, note: 'Vendas do balcão' },
  { id: 'sm-5', productId: 'p-cam', unitId: 'u-jeri-centro', type: 'sale', qty: -4, dayOffset: -4, note: 'Vendas do balcão' },
  { id: 'sm-6', productId: 'p-cam', unitId: 'u-jeri-centro', type: 'transfer_out', qty: -3, dayOffset: -2, note: 'Para Jeri Lagoa', transferId: 'tr-1' },
  { id: 'sm-7', productId: 'p-cam', unitId: 'u-jeri-lagoa', type: 'transfer_in', qty: 3, dayOffset: -2, note: 'De Jeri Centro', transferId: 'tr-1' },
  { id: 'sm-8', productId: 'p-pro', unitId: 'u-prea', type: 'in', qty: 30, dayOffset: -20, note: 'Estoque inicial' },
  { id: 'sm-9', productId: 'p-pro', unitId: 'u-jeri-centro', type: 'in', qty: 20, dayOffset: -20, note: 'Estoque inicial' },
  { id: 'sm-10', productId: 'p-pro', unitId: 'u-jeri-lagoa', type: 'in', qty: 4, dayOffset: -20, note: 'Estoque inicial' },
  { id: 'sm-11', productId: 'p-pro', unitId: 'u-prea', type: 'sale', qty: -5, dayOffset: -3, note: 'Vendas do balcão' },
  { id: 'sm-12', productId: 'p-bon', unitId: 'u-prea', type: 'in', qty: 10, dayOffset: -20, note: 'Estoque inicial' },
  { id: 'sm-13', productId: 'p-bon', unitId: 'u-jeri-centro', type: 'in', qty: 10, dayOffset: -20, note: 'Estoque inicial' },
  { id: 'sm-14', productId: 'p-oc', unitId: 'u-prea', type: 'in', qty: 8, dayOffset: -20, note: 'Estoque inicial' },
  { id: 'sm-15', productId: 'p-oc', unitId: 'u-jeri-centro', type: 'in', qty: 6, dayOffset: -20, note: 'Estoque inicial' },
  { id: 'sm-16', productId: 'p-oc', unitId: 'u-jeri-lagoa', type: 'in', qty: 2, dayOffset: -20, note: 'Estoque inicial' },
  { id: 'sm-17', productId: 'p-bol', unitId: 'u-prea', type: 'in', qty: 5, dayOffset: -20, note: 'Estoque inicial' },
  { id: 'sm-18', productId: 'p-bol', unitId: 'u-prea', type: 'adjust', qty: -1, dayOffset: -1, note: 'Quebra na contagem' },
];
export type EquipmentType = 'prancha' | 'pipa' | 'trapezio' | 'colete' | 'capacete';
export type Condition = 'novo' | 'bom' | 'regular' | 'ruim';
export interface Equipment { id: string; code: string; type: EquipmentType; label: string; unitId: string; condition: Condition; retired: boolean }
export const EQUIPMENT: readonly Equipment[] = [
  { id: 'eq-1', code: 'PR-01', type: 'prancha', label: 'Prancha twin tip 138', unitId: 'u-prea', condition: 'bom', retired: false },
  { id: 'eq-2', code: 'PR-02', type: 'prancha', label: 'Prancha twin tip 140', unitId: 'u-prea', condition: 'regular', retired: false },
  { id: 'eq-3', code: 'PI-01', type: 'pipa', label: 'Pipa 9 m', unitId: 'u-prea', condition: 'bom', retired: false },
  { id: 'eq-4', code: 'PI-02', type: 'pipa', label: 'Pipa 12 m', unitId: 'u-prea', condition: 'novo', retired: false },
  { id: 'eq-5', code: 'TR-01', type: 'trapezio', label: 'Trapézio M', unitId: 'u-prea', condition: 'bom', retired: false },
  { id: 'eq-6', code: 'PR-03', type: 'prancha', label: 'Prancha twin tip 136', unitId: 'u-jeri-centro', condition: 'bom', retired: false },
  { id: 'eq-7', code: 'PI-03', type: 'pipa', label: 'Pipa 9 m', unitId: 'u-jeri-centro', condition: 'regular', retired: false },
  { id: 'eq-8', code: 'CO-01', type: 'colete', label: 'Colete de impacto G', unitId: 'u-jeri-centro', condition: 'bom', retired: false },
  { id: 'eq-9', code: 'PI-04', type: 'pipa', label: 'Pipa 7 m', unitId: 'u-jeri-lagoa', condition: 'bom', retired: false },
  { id: 'eq-10', code: 'PR-04', type: 'prancha', label: 'Prancha twin tip 138', unitId: 'u-jeri-lagoa', condition: 'ruim', retired: false },
  { id: 'eq-11', code: 'CA-09', type: 'capacete', label: 'Capacete M (aposentado)', unitId: 'u-prea', condition: 'ruim', retired: true },
];
export interface Rental { id: string; equipmentId: string; customer: string; dayOffset: number; start: string; hours: number; priceCents: number; conditionOut: Condition; returned?: { dayOffset: number; condition: Condition; note: string } }
export const RENTALS: readonly Rental[] = [
  { id: 'rt-1', equipmentId: 'eq-1', customer: 'Cliente Demo A', dayOffset: 0, start: '09:00', hours: 2, priceCents: 8000, conditionOut: 'bom' },
  { id: 'rt-2', equipmentId: 'eq-7', customer: 'Cliente Demo B', dayOffset: 0, start: '14:00', hours: 3, priceCents: 24000, conditionOut: 'regular' },
  { id: 'rt-3', equipmentId: 'eq-5', customer: 'Cliente Demo C', dayOffset: -1, start: '10:00', hours: 2, priceCents: 5000, conditionOut: 'bom', returned: { dayOffset: -1, condition: 'bom', note: '' } },
  { id: 'rt-4', equipmentId: 'eq-2', customer: 'Cliente Demo D', dayOffset: -2, start: '15:00', hours: 1, priceCents: 4000, conditionOut: 'regular', returned: { dayOffset: -2, condition: 'regular', note: '' } },
  { id: 'rt-5', equipmentId: 'eq-10', customer: 'Cliente Demo E', dayOffset: -3, start: '08:00', hours: 2, priceCents: 8000, conditionOut: 'regular', returned: { dayOffset: -3, condition: 'ruim', note: 'Quilha quebrada' } },
];
/** An equipment is in maintenance exactly while it has an open ticket. */
export interface MaintenanceTicket { id: string; equipmentId: string; openedOffset: number; description: string; costCents: number | null; status: 'open' | 'done' }
export const MAINTENANCE: readonly MaintenanceTicket[] = [
  { id: 'mt-1', equipmentId: 'eq-10', openedOffset: -3, description: 'Quilha quebrada, devolvida em estado ruim', costCents: null, status: 'open' },
  { id: 'mt-2', equipmentId: 'eq-3', openedOffset: -8, description: 'Troca de bexiga', costCents: 18000, status: 'done' },
];

// ---- Bloco 5: lojinha da escola (demonstrativo) ----
export type ShopOrigin = 'vitrine' | 'qr' | 'instagram' | 'afiliado' | 'balcao';
export const ORIGIN_LABEL: Record<ShopOrigin, string> = { vitrine: 'Vitrine da escola', qr: 'QR Code', instagram: 'Instagram', afiliado: 'Afiliado', balcao: 'Balcão' };
export type ShopOrderStatus = 'received' | 'confirmed' | 'ready' | 'delivered' | 'cancelled';
/** The cart stores choices only. Prices, stock and availability are always looked up again from the catalog. */
export type CartItem =
  | { id: string; kind: 'lesson'; serviceId: string; unitId: string; instructorId: string; dayOffset: number; start: string; people: number }
  | { id: string; kind: 'product'; productId: string; unitId: string; qty: number }
  | { id: string; kind: 'rental'; type: EquipmentType; unitId: string; hours: number; qty: number };
export interface ShopOrder { id: string; number: string; customer: string; phone: string; origin: ShopOrigin; status: ShopOrderStatus; createdOffset: number; couponCode?: string; items: CartItem[] }
export interface Coupon { id: string; code: string; kind: 'percent' | 'fixed'; value: number; minCents: number; unitIds: string[]; untilOffset: number; maxUses: number; used: number; active: boolean }
export interface StoreSettings { name: string; slogan: string; whatsapp: string; accent: 'azul' | 'preto' | 'cinza'; published: boolean }

export const STORE: StoreSettings = { name: 'Ventos do Norte Kite School', slogan: 'Aulas e equipamentos em Preá e Jericoacoara', whatsapp: '88999990000', accent: 'azul', published: false };
export const COUPONS: readonly Coupon[] = [
  { id: 'c-1', code: 'VENTO10', kind: 'percent', value: 1000, minCents: 0, unitIds: [], untilOffset: 60, maxUses: 100, used: 12, active: true },
  { id: 'c-2', code: 'PREA20', kind: 'fixed', value: 2000, minCents: 15000, unitIds: ['u-prea'], untilOffset: 30, maxUses: 20, used: 20, active: true },
  { id: 'c-3', code: 'VERAO', kind: 'percent', value: 1500, minCents: 20000, unitIds: [], untilOffset: -5, maxUses: 50, used: 8, active: true },
  { id: 'c-4', code: 'PAUSADO', kind: 'fixed', value: 1000, minCents: 0, unitIds: [], untilOffset: 90, maxUses: 10, used: 0, active: false },
];
export const SHOP_ORDERS: readonly ShopOrder[] = [
  { id: 'o-1', number: 'VK-1041', customer: 'Camila Duarte', phone: '88999991111', origin: 'vitrine', status: 'received', createdOffset: 0, couponCode: 'VENTO10', items: [
    { id: 'a', kind: 'lesson', serviceId: 's-ini', unitId: 'u-prea', instructorId: 'i-1', dayOffset: 2, start: '08:00', people: 1 },
    { id: 'b', kind: 'product', productId: 'p-cam', unitId: 'u-prea', qty: 1 }] },
  { id: 'o-2', number: 'VK-1040', customer: 'Bruno Alves', phone: '88999992222', origin: 'instagram', status: 'confirmed', createdOffset: -1, items: [
    { id: 'a', kind: 'lesson', serviceId: 's-ini', unitId: 'u-jeri-centro', instructorId: 'i-2', dayOffset: 3, start: '09:00', people: 2 },
    { id: 'b', kind: 'rental', type: 'colete', unitId: 'u-jeri-centro', hours: 2, qty: 1 }] },
  { id: 'o-3', number: 'VK-1039', customer: 'Helena Prado', phone: '88999993333', origin: 'afiliado', status: 'ready', createdOffset: -2, items: [
    { id: 'a', kind: 'product', productId: 'p-pro', unitId: 'u-prea', qty: 2 },
    { id: 'b', kind: 'product', productId: 'p-bon', unitId: 'u-jeri-centro', qty: 1 }] },
  { id: 'o-4', number: 'VK-1038', customer: 'Diego Moura', phone: '88999994444', origin: 'qr', status: 'delivered', createdOffset: -4, items: [
    { id: 'a', kind: 'rental', type: 'prancha', unitId: 'u-prea', hours: 3, qty: 1 }] },
  { id: 'o-5', number: 'VK-1037', customer: 'Larissa Neri', phone: '88999995555', origin: 'balcao', status: 'cancelled', createdOffset: -6, items: [
    { id: 'a', kind: 'product', productId: 'p-oc', unitId: 'u-prea', qty: 1 }] },
];
