/**
 * Pure URL boundary for the read-only, RLS-protected protection archive.
 * No untrusted string reaches a PostgREST filter without validation.
 */
export const ARCHIVE_PAGE_SIZE = 20;
export const ARCHIVE_MAX_PAGE = 1000;
export type ProtectionArchiveParams = Readonly<{
  codigo: string;
  codigoInvalido: boolean;
  ocorrenciasPagina: number;
  manifestacoesPagina: number;
}>;
type RawParams = Readonly<Record<string, string | string[] | undefined>>;
const single = (value: string | string[] | undefined): string =>
  typeof value === 'string' ? value : '';

export function parseProtectionArchiveParams(params: RawParams): ProtectionArchiveParams {
  const submitted = single(params.codigo).trim().toUpperCase();
  const codigoInvalido = submitted.length > 0 &&
    !/^[A-Z0-9][A-Z0-9_-]{1,38}[A-Z0-9]$/.test(submitted);
  function page(input: string | string[] | undefined): number {
    const value = single(input);
    if (!/^[1-9][0-9]{0,3}$/.test(value)) return 1;
    const result = Number(value);
    return result <= ARCHIVE_MAX_PAGE ? result : 1;
  }
  return {
    codigo: codigoInvalido ? '' : submitted,
    codigoInvalido,
    ocorrenciasPagina: page(params.ocPagina),
    manifestacoesPagina: page(params.manPagina),
  };
}

export function protectionArchiveRange(page: number): { from: number; to: number } {
  if (!Number.isInteger(page) || page < 1 || page > ARCHIVE_MAX_PAGE) {
    throw new RangeError('Invalid archive page');
  }
  const from = (page - 1) * ARCHIVE_PAGE_SIZE;
  return { from, to: from + ARCHIVE_PAGE_SIZE - 1 };
}

export function protectionArchiveUrl(
  area: 'aluno' | 'instrutor' | 'admin',
  params: ProtectionArchiveParams,
  section: 'ocPagina' | 'manPagina',
  page: number,
): string {
  protectionArchiveRange(page);
  const query = new URLSearchParams();
  if (params.codigo) query.set('codigo', params.codigo);
  // Changing one list preserves the other list's current page.
  if (section === 'ocPagina') {
    query.set('ocPagina', String(page));
    query.set('manPagina', String(params.manifestacoesPagina));
  } else {
    query.set('ocPagina', String(params.ocorrenciasPagina));
    query.set('manPagina', String(page));
  }
  return `/${area}/ocorrencias?${query.toString()}#arquivo-protege`;
}
