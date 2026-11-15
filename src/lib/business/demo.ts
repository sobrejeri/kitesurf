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
