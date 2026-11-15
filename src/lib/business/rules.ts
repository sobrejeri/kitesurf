import { EMPLOYEES, INSTRUCTORS, LESSONS, ROLE_PERMISSIONS, UNITS, type Employee, type Lesson, type RoleId, type Unit } from './demo.ts';

/** City and unit filters live in the URL, so every screen filters the same way. */
export interface Scope { cidade: string; unidade: string }

export function parseScope(params: Record<string, string | string[] | undefined>): Scope {
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';
  const unidade = UNITS.some((u) => u.id === one(params.unidade)) ? one(params.unidade) : '';
  const unit = UNITS.find((u) => u.id === unidade);
  const cityOk = UNITS.some((u) => u.city === one(params.cidade));
  // A unit always wins: its own city is the city.
  const cidade = unit ? unit.city : cityOk ? one(params.cidade) : '';
  return { cidade, unidade };
}

export const cities = (): string[] => [...new Set(UNITS.map((u) => u.city))].sort();
export const unitsInScope = (scope: Scope): Unit[] =>
  UNITS.filter((u) => (!scope.cidade || u.city === scope.cidade) && (!scope.unidade || u.id === scope.unidade));
export const unitName = (id: string) => UNITS.find((u) => u.id === id)?.name ?? 'Unidade';
export const instructorName = (id: string) => INSTRUCTORS.find((i) => i.id === id)?.name ?? 'Instrutor';
export const scopeQuery = (scope: Scope): string => {
  const q = new URLSearchParams();
  if (scope.cidade && !scope.unidade) q.set('cidade', scope.cidade);
  if (scope.unidade) q.set('unidade', scope.unidade);
  const s = q.toString();
  return s ? `?${s}` : '';
};

export const employeesInScope = (scope: Scope): Employee[] => {
  const ids = new Set(unitsInScope(scope).map((u) => u.id));
  return EMPLOYEES.filter((e) => e.assignments.some((a) => ids.has(a.unitId)));
};
export const instructorsInScope = (scope: Scope) => {
  const ids = new Set(unitsInScope(scope).map((u) => u.id));
  return INSTRUCTORS.filter((i) => i.unitIds.some((id) => ids.has(id)));
};
export const lessonsInScope = (scope: Scope): Lesson[] => {
  const ids = new Set(unitsInScope(scope).map((u) => u.id));
  return LESSONS.filter((l) => ids.has(l.unitId));
};

/** Permissions are per unit: the same person can be manager in one and attendant in another. */
export function can(employee: Employee, unitId: string, permission: string): boolean {
  const role: RoleId | undefined = employee.assignments.find((a) => a.unitId === unitId)?.role;
  return role ? ROLE_PERMISSIONS[role].includes(permission) : false;
}

const toMin = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

/**
 * One instructor, one calendar: lessons of the same instructor on the same
 * day overlap even when they belong to different units. Returns lesson ids.
 */
export function findConflicts(lessons: readonly Lesson[]): Set<string> {
  const bad = new Set<string>();
  for (const [i, a] of lessons.entries()) {
    for (const b of lessons.slice(i + 1)) {
      if (a.instructorId !== b.instructorId || a.dayOffset !== b.dayOffset) continue;
      if (toMin(a.start) < toMin(b.start) + b.minutes && toMin(b.start) < toMin(a.start) + a.minutes) { bad.add(a.id); bad.add(b.id); }
    }
  }
  return bad;
}

export interface UnitInput { name: string; city: string; address: string; opens: string; closes: string; lat: string; lng: string }
export function validateUnit(input: UnitInput): Record<string, string> {
  const e: Record<string, string> = {};
  if (input.name.trim().length < 3 || input.name.trim().length > 80) e.name = 'Informe o nome da unidade (3 a 80 letras).';
  if (input.city.trim().length < 2) e.city = 'Informe a cidade.';
  if (input.address.trim().length < 5 || input.address.trim().length > 120) e.address = 'Informe o endereço (5 a 120 caracteres).';
  const time = /^([01]\d|2[0-3]):[0-5]\d$/;
  if (!time.test(input.opens)) e.opens = 'Horário de abertura inválido.';
  if (!time.test(input.closes)) e.closes = 'Horário de fechamento inválido.';
  if (!e.opens && !e.closes && toMin(input.closes) <= toMin(input.opens)) e.closes = 'O fechamento precisa ser depois da abertura.';
  const coord = (v: string, max: number) => v.trim() === '' || (Number.isFinite(Number(v)) && Math.abs(Number(v)) <= max);
  if (!coord(input.lat, 90)) e.lat = 'Latitude entre -90 e 90.';
  if (!coord(input.lng, 180)) e.lng = 'Longitude entre -180 e 180.';
  return e;
}

/** "seg., 16/11" for today + offset, in Fortaleza time. */
export function dayLabel(offset: number): string {
  return new Intl.DateTimeFormat('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit', timeZone: 'America/Fortaleza' })
    .format(new Date(Date.now() + offset * 86_400_000));
}
export const endTime = (start: string, minutes: number): string => {
  const t = Number(start.slice(0, 2)) * 60 + Number(start.slice(3, 5)) + minutes;
  return `${String(Math.floor(t / 60) % 24).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
};
