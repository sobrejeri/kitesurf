import { PACKAGES, SERVICES, UNITS, UNIT_SERVICES, type PackageOffer, type Service, type UnitService } from './demo.ts';
import type { Scope } from './rules.ts';

/** Prices are integer cents. A unit's own price wins; without one the service's base price applies. */
export function effectivePriceCents(service: Service, unitService: UnitService): number {
  return unitService.priceCents !== null && unitService.priceCents > 0 ? unitService.priceCents : service.baseCents;
}
export const hasOwnPrice = (u: UnitService): boolean => u.priceCents !== null && u.priceCents > 0;

export function unitServicesInScope(scope: Scope): UnitService[] {
  const ids = new Set(UNITS.filter((u) => (!scope.cidade || u.city === scope.cidade) && (!scope.unidade || u.id === scope.unidade)).map((u) => u.id));
  return UNIT_SERVICES.filter((u) => ids.has(u.unitId));
}
export const serviceOf = (id: string): Service | undefined => SERVICES.find((s) => s.id === id);
export const unitsEnabling = (serviceId: string): string[] => UNIT_SERVICES.filter((u) => u.serviceId === serviceId).map((u) => u.unitId);

/** "260,00" or "260" -> 26000. Never goes through floating point; more than two decimals is rejected. */
export function parseMoneyToCents(text: string): number | null {
  const m = /^(\d{1,7})(?:[.,](\d{1,2}))?$/.exec(text.trim());
  if (!m) return null;
  return Number(m[1]) * 100 + Number(((m[2] ?? '') + '00').slice(0, 2));
}

export interface ServiceInput { name: string; minutes: string; capacity: string; price: string }
export function validateService(input: ServiceInput): Record<string, string> {
  const e: Record<string, string> = {};
  if (input.name.trim().length < 3 || input.name.trim().length > 60) e.name = 'Informe o nome do serviço (3 a 60 letras).';
  const minutes = Number(input.minutes);
  if (!Number.isInteger(minutes) || minutes < 30 || minutes > 480 || minutes % 15 !== 0) e.minutes = 'Duração de 30 a 480 minutos, em múltiplos de 15.';
  const capacity = Number(input.capacity);
  if (!Number.isInteger(capacity) || capacity < 1 || capacity > 10) e.capacity = 'Capacidade de 1 a 10 alunos por aula.';
  const cents = parseMoneyToCents(input.price);
  if (cents === null || cents < 1000) e.price = 'Informe o preço base em reais, com até 2 casas (mínimo R$ 10,00).';
  return e;
}

export interface PackageSummary { regularCents: number; savingCents: number; perLessonCents: number; savingBps: number }
/** Package savings versus buying the same lessons one by one at the base price. */
export function summarizePackage(pkg: PackageOffer): PackageSummary {
  const service = serviceOf(pkg.serviceId);
  const regularCents = (service?.baseCents ?? 0) * pkg.lessons;
  const savingCents = Math.max(0, regularCents - pkg.priceCents);
  return {
    regularCents, savingCents,
    perLessonCents: Math.round(pkg.priceCents / pkg.lessons),
    savingBps: regularCents > 0 ? Math.round((savingCents * 10000) / regularCents) : 0,
  };
}
export const packages = (): readonly PackageOffer[] => PACKAGES;

export const WEEKDAYS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'] as const;
