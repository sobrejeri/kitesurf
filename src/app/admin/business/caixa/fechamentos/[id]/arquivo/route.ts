import { getViewer } from '@/lib/auth';
import { closingSummary, sessionById } from '@/lib/business/caixa';
import { buildPdf, buildXlsx } from '@/lib/business/files';
import { closingPdfLines, closingSheetRows } from '@/lib/business/report';

export const dynamic = 'force-dynamic';

/**
 * Closing report download (Excel or PDF). Demo data only. Admin with the
 * second factor, like every Business page; the check is repeated here because
 * a route handler is not covered by the layout.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const viewer = await getViewer();
  if (!viewer || viewer.role !== 'admin' || !viewer.secondFactor) return new Response('Acesso negado.', { status: 403 });
  const { id } = await params;
  const session = sessionById(id);
  const summary = session ? closingSummary(session) : null;
  if (!session || !summary) return new Response('Fechamento não encontrado.', { status: 404 });
  const format = new URL(request.url).searchParams.get('formato');
  if (format !== 'xlsx' && format !== 'pdf') return new Response('Formato inválido.', { status: 400 });
  const bytes = format === 'xlsx' ? buildXlsx('Fechamento', closingSheetRows(summary)) : buildPdf('Fechamento de caixa', closingPdfLines(summary));
  return new Response(Buffer.from(bytes), {
    headers: {
      'Content-Type': format === 'xlsx' ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : 'application/pdf',
      'Content-Disposition': `attachment; filename="fechamento-caixa-${id}.${format}"`,
      'Cache-Control': 'no-store',
    },
  });
}
