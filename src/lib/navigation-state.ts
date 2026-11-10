/**
 * Match only the selected route or one of its child routes.
 * A sibling with a shared prefix (e.g. /aluno/reserva vs /aluno/reservar)
 * must never inherit the wrong active state.
 */
export function isActive(
  pathname: string,
  item: { href: string; match?: readonly string[] },
): boolean {
  return [item.href, ...(item.match ?? [])].some(
    route => pathname === route || pathname.startsWith(route.endsWith('/') ? route : route + '/'),
  );
}
