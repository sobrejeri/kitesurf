import { AUDIT_LOG, EMPLOYEES, INSTRUCTORS, LESSONS, PERMISSIONS, PERMISSION_OVERRIDES, PRODUCTS, ROLES, ROLE_PERMISSIONS, SHOP_ORDERS, UNITS, type AuditEntry, type Employee, type RoleId, type Unit } from './demo.ts';
import { productStock } from './stock.ts';

/**
 * Company and staff rules. A person works in several units with a different
 * role in each, plus optional per-unit exceptions. The screens only filter
 * what they show: the real enforcement belongs to the database (RLS), later.
 */
export const normalizeCnpj = (t: string): string => t.replace(/[^0-9A-Za-z]/g, '').toUpperCase();
const charValue = (c: string): number => c.charCodeAt(0) - 48;
/** CNPJ with check digits, numeric or alphanumeric (same rule as the database). */
export function isValidCnpj(input: string): boolean {
  const n = normalizeCnpj(input);
  if (!/^[0-9A-Z]{12}[0-9]{2}$/.test(n) || /^(.)\1+$/.test(n)) return false;
  const digit = (len: number): number => {
    const weights = len === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const sum = [...n.slice(0, len)].reduce((s, c, i) => s + charValue(c) * (weights[i] ?? 0), 0);
    const r = sum % 11; return r < 2 ? 0 : 11 - r;
  };
  return digit(12) === Number(n[12]) && digit(13) === Number(n[13]);
}
export const formatCnpj = (t: string): string => { const n = normalizeCnpj(t); return n.length === 14 ? `${n.slice(0, 2)}.${n.slice(2, 5)}.${n.slice(5, 8)}/${n.slice(8, 12)}-${n.slice(12)}` : t; };

const digits = (t: string) => t.replace(/\D/g, '');
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
export function validateCompany(i: { legalName: string; tradeName: string; cnpj: string; ownerName: string; email: string; phone: string; city: string; terms?: string }, requireTerms: boolean): Record<string, string> {
  const e: Record<string, string> = {};
  if (i.legalName.trim().length < 5 || i.legalName.trim().length > 120) e.legalName = 'Informe a razão social (5 a 120 caracteres).';
  if (i.tradeName.trim().length < 3 || i.tradeName.trim().length > 60) e.tradeName = 'Informe o nome fantasia (3 a 60 caracteres).';
  if (!isValidCnpj(i.cnpj)) e.cnpj = 'CNPJ inválido. Confira os dígitos.';
  if (i.ownerName.trim().length < 3 || i.ownerName.trim().length > 80) e.ownerName = 'Informe o nome do responsável.';
  if (!EMAIL.test(i.email.trim())) e.email = 'Informe um e-mail válido.';
  if (digits(i.phone).length < 10 || digits(i.phone).length > 13) e.phone = 'Informe um telefone com DDD.';
  if (i.city.trim().length < 2) e.city = 'Informe a cidade da sede.';
  if (requireTerms && i.terms !== 'yes') e.terms = 'Aceite os termos para continuar.';
  return e;
}

export const roleLabel = (r: RoleId): string => ROLES.find((x) => x.id === r)?.label ?? r;
/** Role permissions, then this person's exceptions in this unit. No link, no permissions. */
export function effectivePermissions(employee: Employee, unitId: string): string[] {
  const link = employee.assignments.find((a) => a.unitId === unitId);
  if (!link) return [];
  const o = PERMISSION_OVERRIDES.find((x) => x.employeeId === employee.id && x.unitId === unitId);
  const base = new Set(ROLE_PERMISSIONS[link.role]);
  for (const g of o?.grant ?? []) base.add(g);
  for (const r of o?.revoke ?? []) base.delete(r);
  return PERMISSIONS.map((p) => p.id).filter((id) => base.has(id));
}
export const hasPermission = (employee: Employee, unitId: string, permission: string): boolean => effectivePermissions(employee, unitId).includes(permission);
/** An employee sees only the units they are linked to; the owner is linked to all. */
export const unitsVisibleTo = (employee: Employee | undefined): Unit[] => (employee ? UNITS.filter((u) => employee.assignments.some((a) => a.unitId === u.id)) : []);
export const employeeById = (id: string): Employee | undefined => EMPLOYEES.find((e) => e.id === id);
export const isOwner = (e: Employee): boolean => e.assignments.some((a) => a.role === 'owner');

export interface ConsolidatedRow { unit: Unit; lessonsToday: number; staff: number; instructors: number; stockUnits: number; orders: number }
export function consolidatedRows(units: readonly Unit[]): ConsolidatedRow[] {
  return units.map((unit) => ({
    unit,
    lessonsToday: LESSONS.filter((l) => l.unitId === unit.id && l.dayOffset === 0).length,
    staff: EMPLOYEES.filter((e) => e.assignments.some((a) => a.unitId === unit.id)).length,
    instructors: INSTRUCTORS.filter((i) => i.status === 'active' && i.unitIds.includes(unit.id)).length,
    stockUnits: PRODUCTS.reduce((n, p) => n + productStock(p.id, unit.id), 0),
    orders: SHOP_ORDERS.filter((o) => o.status !== 'cancelled' && o.items.some((i) => i.unitId === unit.id)).length,
  }));
}

export interface InviteInput { name: string; email: string; links: { unitId: string; role: string }[] }
export function validateInvite(i: InviteInput): Record<string, string> {
  const e: Record<string, string> = {};
  if (i.name.trim().length < 3 || i.name.trim().length > 80) e.name = 'Informe o nome (3 a 80 letras).';
  if (!EMAIL.test(i.email.trim())) e.email = 'Informe um e-mail válido.';
  else if (EMPLOYEES.some((x) => x.email.toLowerCase() === i.email.trim().toLowerCase())) e.email = 'Já existe um funcionário com este e-mail.';
  if (i.links.length === 0) e.links = 'Escolha ao menos uma unidade e um cargo.';
  else if (i.links.some((l) => !UNITS.some((u) => u.id === l.unitId && u.active) || !ROLES.some((r) => r.id === l.role))) e.links = 'Cada unidade precisa de um cargo válido.';
  else if (i.links.some((l) => l.role === 'owner')) e.links = 'O cargo de Proprietário não é concedido por convite: só pela transferência da empresa.';
  return e;
}
export function validateLink(i: { employeeId: string; unitId: string; role: string }): Record<string, string> {
  const e: Record<string, string> = {};
  const emp = employeeById(i.employeeId);
  if (!emp) e.employeeId = 'Escolha o funcionário.';
  if (!UNITS.some((u) => u.id === i.unitId && u.active)) e.unitId = 'Escolha uma unidade ativa.';
  if (!ROLES.some((r) => r.id === i.role)) e.role = 'Escolha o cargo.';
  else if (i.role === 'owner') e.role = 'O cargo de Proprietário não é concedido por vínculo.';
  if (emp && !e.unitId && emp.assignments.some((a) => a.unitId === i.unitId)) e.unitId = 'Este funcionário já está vinculado a esta unidade.';
  return e;
}
/** A unit always keeps someone who can manage it, and the owner's links are not removed here. */
export function validateUnlink(employeeId: string, unitId: string): string | null {
  const emp = employeeById(employeeId); const link = emp?.assignments.find((a) => a.unitId === unitId);
  if (!emp || !link) return 'Vínculo não encontrado.';
  if (link.role === 'owner') return 'O vínculo do Proprietário não pode ser removido.';
  const left = EMPLOYEES.filter((e) => e.id !== employeeId && e.assignments.some((a) => a.unitId === unitId && (a.role === 'owner' || a.role === 'manager')));
  return link.role === 'manager' && left.length === 0 ? 'A unidade ficaria sem gerente nem proprietário.' : null;
}
export function validateRole(i: { name: string; base: string; permissions: readonly string[]; confirmSensitive: boolean }): Record<string, string> {
  const e: Record<string, string> = {};
  if (i.name.trim().length < 3 || i.name.trim().length > 30) e.name = 'Nome do cargo de 3 a 30 letras.';
  else if (ROLES.some((r) => r.label.toLowerCase() === i.name.trim().toLowerCase())) e.name = 'Já existe um cargo com este nome.';
  if (!ROLES.some((r) => r.id === i.base && r.id !== 'owner')) e.base = 'Escolha um cargo base (exceto Proprietário).';
  if (i.permissions.length === 0 || i.permissions.some((p) => !PERMISSIONS.some((x) => x.id === p))) e.permissions = 'Escolha ao menos uma permissão válida.';
  else if (i.permissions.some((p) => PERMISSIONS.find((x) => x.id === p)?.sensitive) && !i.confirmSensitive) e.confirmSensitive = 'Confirme que entende as permissões sensíveis escolhidas.';
  return e;
}
export const auditInScope = (unitIds: ReadonlySet<string>, action = '', actor = ''): AuditEntry[] =>
  AUDIT_LOG.filter((a) => (!a.unitId || unitIds.has(a.unitId)) && (!action || a.action === action) && (!actor || a.actorId === actor)).sort((a, b) => a.minutesAgo - b.minutesAgo);
export const agoLabel = (m: number): string => (m < 60 ? `há ${m} min` : m < 1440 ? `há ${Math.floor(m / 60)} h` : `há ${Math.floor(m / 1440)} dia(s)`);
