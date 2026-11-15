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
