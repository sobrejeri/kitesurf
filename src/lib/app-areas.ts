/**
 * The four installable apps. Each lives under its own path, installs as its
 * own PWA (manifest scope = that path) and keeps its own Supabase session in
 * its own cookie — so a phone can be signed in as a student in "Vento" and as
 * an admin in "VentoKite Admin" at the same time.
 *
 * Shared by the proxy, server code and client components; no server-only
 * imports here.
 */

export type AppArea = 'aluno' | 'instrutor' | 'admin' | 'afiliado';
export type AreaRole = 'student' | 'instructor' | 'admin' | 'partner';

export interface AreaInfo {
  /** Name on the home screen and in the login header. */
  appName: string;
  /** Word under "Vento" in the wave brand. */
  subtitle: string;
  /** Who the app is for, in the login copy. */
  audience: string;
  role: AreaRole;
  /** Where a signed-in user lands. */
  home: string;
  /** Self sign-up allowed? Admin accounts are never self-created. */
  signup: boolean;
}

export const APP_AREAS: Readonly<Record<AppArea, AreaInfo>> = {
  aluno: { appName: 'Vento', subtitle: 'Aulas de kitesurf', audience: 'alunos', role: 'student', home: '/aluno/aulas', signup: true },
  instrutor: { appName: 'VentoKite Instrutor', subtitle: 'Instrutor', audience: 'instrutores', role: 'instructor', home: '/instrutor/hoje', signup: true },
  admin: { appName: 'VentoKite Admin', subtitle: 'Admin', audience: 'a equipe de operação', role: 'admin', home: '/admin/visao', signup: false },
  // Formerly "Vento Pousada": any partner who refers students (inn, school, shop, creator).
  afiliado: { appName: 'VentoKite Afiliados', subtitle: 'Afiliado', audience: 'afiliados', role: 'partner', home: '/afiliado/inicio', signup: true },
};

export const AREA_LIST = Object.keys(APP_AREAS) as AppArea[];

/** Request header the proxy sets so server code knows which app it serves. */
export const AREA_HEADER = 'x-vento-area';

export function isArea(value: unknown): value is AppArea {
  return typeof value === 'string' && value in APP_AREAS;
}

/**
 * An area named by an outside link (e-mail confirmation, password recovery).
 * Links sent before the Pousada app became the Afiliado app still say
 * area=pousada, so that old name maps to the affiliate app.
 */
export function areaFromParam(value: unknown): AppArea | null {
  if (value === 'pousada') return 'afiliado';
  return isArea(value) ? value : null;
}

/** /instrutor/hoje → instrutor. Anything outside the four apps is the student app. */
export function areaFromPath(pathname: string): AppArea {
  const first = pathname.split('/')[1];
  return isArea(first) ? first : 'aluno';
}

export function areaForRole(role: AreaRole): AppArea {
  return (AREA_LIST.find((area) => APP_AREAS[area].role === role) ?? 'aluno');
}

/**
 * Each app's session cookie. Separate names keep the four logins apart. The
 * affiliate app keeps the cookie it had as the Pousada app, so affiliates who
 * were already signed in stay signed in after the rename.
 */
export function sessionCookieName(area: AppArea): string {
  return area === 'afiliado' ? 'vento-pousada-auth' : `vento-${area}-auth`;
}

export function loginPath(area: AppArea, next?: string): string {
  return next ? `/${area}/entrar?next=${encodeURIComponent(next)}` : `/${area}/entrar`;
}

/** A post-login destination is only accepted inside the same app. */
export function safeNextFor(area: AppArea, next: string | null | undefined): string | null {
  if (!next || next.startsWith('//') || !next.startsWith(`/${area}/`)) return null;
  if (next.startsWith(`/${area}/entrar`) || next.startsWith(`/${area}/criar-conta`)) return null;
  return next;
}
