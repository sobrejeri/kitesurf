/** Directly opened routes and installed PWAs may have no same-app history.
 * A safe, deterministic destination avoids sending someone out of VentoKite.
 * This is navigational fallback, never an authorization rule.
 */
export function studentSafeBackHref(pathname: string): string {
  if (pathname === '/aluno/reservar' || pathname.startsWith('/aluno/reservar/')) {
    return '/aluno/inicio';
  }
  if (pathname === '/aluno/reserva' || pathname.startsWith('/aluno/reserva/') ||
      pathname === '/aluno/atendimento' || pathname.startsWith('/aluno/atendimento/') ||
      pathname === '/aluno/ocorrencias' || pathname.startsWith('/aluno/ocorrencias/')) {
    return '/aluno/aulas';
  }
  return '/aluno/conta';
}
