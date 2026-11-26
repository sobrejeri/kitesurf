// Nenhuma ação é permitida quando o identificador não corresponde a um único alvo.
export async function requireUniqueTarget(locator, description) {
  const count = await locator.count();
  if (count !== 1) throw new Error(`${description}: esperado um alvo, encontrados ${count}`);
  return locator;
}

export function requireUuid(value, description) {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
    throw new Error(`${description}: identificador inválido`);
  }
  return value.toLowerCase();
}
