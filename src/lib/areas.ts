/** The four areas of the app and the role each belongs to. */
export const AREAS = [
  { label: 'Aluno', href: '/aluno/aulas', prefix: '/aluno', role: 'student' },
  { label: 'Instrutor', href: '/instrutor/hoje', prefix: '/instrutor', role: 'instructor' },
  { label: 'Admin', href: '/admin/visao', prefix: '/admin', role: 'admin' },
  { label: 'Pousada', href: '/pousada/inicio', prefix: '/pousada', role: 'partner' },
] as const;

/** Area links for an admin's switcher; other roles get none. */
export function areaLinksFor(role: string) {
  return role === 'admin' ? AREAS.map(({ label, href }) => ({ label, href })) : undefined;
}
