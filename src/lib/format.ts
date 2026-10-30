/**
 * Display helpers. They format values that arrive already computed; none of
 * them derives an amount.
 */

const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

/** "R$ 1.500" — whole reais drop the ",00" the way the sketch shows them. */
export function formatMoney(amountCents: number): string {
  const formatted = BRL.format(amountCents / 100);
  return amountCents % 100 === 0 ? formatted.replace(/,00$/, '') : formatted;
}

/** 90 → "1h 30min", 120 → "2h", 30 → "30min". Durations are never "1,5h". */
export function formatMinutes(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest}min`;
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}min`;
}
