/**
 * CPF and CNPJ as people type them, with or without punctuation. The database
 * applies the same rules again (migration 47, public.tax_id_is_valid); this
 * gives an early answer and the display format.
 *
 * The CNPJ may be alphanumeric (Receita Federal, from July 2026): the first
 * 12 characters are digits or letters, the last two are check digits. Each
 * character counts as its ASCII code minus 48.
 */
export type TaxIdKind = 'cpf' | 'cnpj';

export function normalizeTaxId(value: string): string {
  return value.replace(/[^0-9A-Za-z]/g, '').toUpperCase();
}

export function taxIdKind(clean: string): TaxIdKind | null {
  if (clean.length === 11) return 'cpf';
  if (clean.length === 14) return 'cnpj';
  return null;
}

function cpfIsValid(clean: string): boolean {
  if (!/^\d{11}$/.test(clean) || clean === clean.charAt(0).repeat(11)) return false;
  const digits = [...clean].map(Number);
  const check = (length: number) => {
    let total = 0;
    for (let i = 0; i < length; i += 1) total += (digits[i] ?? 0) * (length + 1 - i);
    return ((total * 10) % 11) % 10;
  };
  return check(9) === digits[9] && check(10) === digits[10];
}

const CNPJ_WEIGHTS = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];

function cnpjIsValid(clean: string): boolean {
  if (!/^[0-9A-Z]{12}\d{2}$/.test(clean) || clean === clean.charAt(0).repeat(14)) return false;
  const values = [...clean].map((char) => char.charCodeAt(0) - 48);
  const check = (length: number) => {
    const weights = CNPJ_WEIGHTS.slice(CNPJ_WEIGHTS.length - length);
    let total = 0;
    for (let i = 0; i < length; i += 1) total += (values[i] ?? 0) * (weights[i] ?? 0);
    const remainder = total % 11;
    return remainder < 2 ? 0 : 11 - remainder;
  };
  return check(12) === values[12] && check(13) === values[13];
}

/** Valid CPF (11 digits) or CNPJ (14 characters), already normalized. */
export function isValidTaxId(clean: string): boolean {
  const kind = taxIdKind(clean);
  if (kind === 'cpf') return cpfIsValid(clean);
  if (kind === 'cnpj') return cnpjIsValid(clean);
  return false;
}

/** 000.000.000-00 or 00.000.000/0000-00. */
export function formatTaxId(clean: string): string {
  if (clean.length === 11) return `${clean.slice(0, 3)}.${clean.slice(3, 6)}.${clean.slice(6, 9)}-${clean.slice(9)}`;
  if (clean.length === 14) {
    return `${clean.slice(0, 2)}.${clean.slice(2, 5)}.${clean.slice(5, 8)}/${clean.slice(8, 12)}-${clean.slice(12)}`;
  }
  return clean;
}

export function taxIdLabel(kind: TaxIdKind): string {
  return kind === 'cpf' ? 'CPF' : 'CNPJ';
}
