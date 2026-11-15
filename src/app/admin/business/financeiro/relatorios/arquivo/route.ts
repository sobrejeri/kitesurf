import { getViewer } from '@/lib/auth';
import { buildPdf, buildXlsx } from '@/lib/business/files';
import { financePdfLines, financeSheetRows } from '@/lib/business/report';
import { parseScope } from '@/lib/business/rules';

export const dynamic = 'force-dynamic';

/** Financial report download. Demo data; Admin with the second factor, checked here because the layout does not cover route handlers. */
export async function GET(request: Request) {
  const viewer = await getViewer();
  if (!viewer || viewer.role !== 'admin' || !viewer.secondFactor) return new Response('Acesso negado.', { status: 403 });
  const url = new URL(request.url);
  const format = url.searchParams.get('formato');
  if (format !== 'xlsx' && format !== 'pdf') return new Response('Formato inválido.', { status: 400 });
  const days = [7, 30, 90].includes(Number(url.searchParams.get('dias'))) ? Number(url.searchParams.get('dias')) : 30;
  const scope = parseScope(Object.fromEntries(url.searchParams));
  const bytes = format === 'xlsx' ? buildXlsx('Financeiro', financeSheetRows(scope, days)) : buildPdf('Relatório financeiro', financePdfLines(scope, days));
  return new Response(Buffer.from(bytes), { headers: {
    'Content-Type': format === 'xlsx' ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : 'application/pdf',
    'Content-Disposition': `attachment; filename="relatorio-financeiro-${days}d.${format}"`, 'Cache-Control': 'no-store' } });
}
