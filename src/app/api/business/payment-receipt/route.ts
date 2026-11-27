import { NextResponse } from 'next/server';
import { businessReceiptsEnabled } from '@/lib/business/payment-receipt-feature';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { isArea } from '@/lib/app-areas';

export const runtime = 'nodejs';
const LIMIT = 5 * 1024 * 1024;
const BUCKET = 'vento-business-payment-receipts';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
function signature(bytes: Uint8Array, type: string): boolean {
  if (type === 'application/pdf') return [37, 80, 68, 70, 45].every((n, i) => bytes[i] === n);
  if (type === 'image/png') return [137, 80, 78, 71, 13, 10, 26, 10].every((n, i) => bytes[i] === n);
  if (type === 'image/jpeg') return [255, 216, 255].every((n, i) => bytes[i] === n);
  return false;
}

/** The Storage policy repeats payment ownership and company permissions. */
export async function POST(request: Request) {
  if (!businessReceiptsEnabled()) return NextResponse.json({ error: 'Envio de comprovantes ainda não disponível.' }, { status: 503 });
  try {
    const origin = request.headers.get('origin');
    const host = request.headers.get('host');
    if (!origin || !host || new URL(origin).host !== host) return NextResponse.json({ error: 'Origem inválida.' }, { status: 403 });
  } catch { return NextResponse.json({ error: 'Origem inválida.' }, { status: 403 }); }
  const header = request.headers.get('content-length');
  const length = header && /^\d+$/.test(header) ? Number(header) : NaN;
  if (!Number.isSafeInteger(length) || length < 1 || length > LIMIT + 64 * 1024) return NextResponse.json({ error: 'Confira o tamanho do arquivo (até 5 MB).' }, { status: 413 });
  const area = new URL(request.url).searchParams.get('area');
  if (!area || !isArea(area)) return NextResponse.json({ error: 'Área inválida.' }, { status: 400 });
  const db = await createSupabaseServerClient(area);
  const claims = await db.auth.getClaims();
  if (claims.error || !claims.data?.claims?.sub) return NextResponse.json({ error: 'Entre novamente para enviar o comprovante.' }, { status: 401 });
  let form: FormData;
  try { form = await request.formData(); } catch { return NextResponse.json({ error: 'Não foi possível ler o arquivo.' }, { status: 400 }); }
  const paymentId = form.get('paymentId'); const file = form.get('file');
  if (typeof paymentId !== 'string' || !UUID.test(paymentId) || !(file instanceof File) || file.size < 1 || file.size > LIMIT) {
    return NextResponse.json({ error: 'Selecione um PDF, JPG ou PNG de até 5 MB.' }, { status: 400 });
  }
  const bytes = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  if (!signature(bytes, file.type)) return NextResponse.json({ error: 'O arquivo não corresponde a um PDF, JPG ou PNG.' }, { status: 400 });
  const path = `${paymentId}/comprovante`;
  const access = await db.rpc('business_payment_receipt_access', { p_name: path, p_write: true });
  if (access.error || access.data !== true) return NextResponse.json({ error: 'Não foi possível enviar para este pagamento.' }, { status: 403 });
  const uploaded = await db.storage.from(BUCKET).upload(path, file, { contentType: file.type, upsert: false, cacheControl: '0' });
  if (uploaded.error) return NextResponse.json({ error: 'Não foi possível enviar. Verifique se já existe comprovante para este pagamento.' }, { status: 409 });
  return NextResponse.json({ ok: true });
}

/** Stream only an authorized file as an attachment, never as executable content. */
export async function GET(request: Request) {
  if (!businessReceiptsEnabled()) return NextResponse.json({ error: 'Comprovantes ainda não disponíveis.' }, { status: 503 });
  const params = new URL(request.url).searchParams;
  const paymentId = params.get('paymentId');
  if (!paymentId || !UUID.test(paymentId)) return NextResponse.json({ error: 'Comprovante não encontrado.' }, { status: 404 });
  const area = params.get('area');
  if (!area || !isArea(area)) return NextResponse.json({ error: 'Comprovante não encontrado.' }, { status: 404 });
  try {
    const db = await createSupabaseServerClient(area);
    const claims = await db.auth.getClaims();
    if (claims.error || !claims.data?.claims?.sub) return NextResponse.json({ error: 'Entre novamente para consultar o comprovante.' }, { status: 401 });
    const path = `${paymentId}/comprovante`;
    const access = await db.rpc('business_payment_receipt_access', { p_name: path, p_write: false });
    if (access.error || access.data !== true) return NextResponse.json({ error: 'Comprovante não encontrado.' }, { status: 404 });
    const downloaded = await db.storage.from(BUCKET).download(path);
    if (downloaded.error || !downloaded.data || downloaded.data.size < 1 || downloaded.data.size > LIMIT) {
      return NextResponse.json({ error: 'Comprovante não encontrado.' }, { status: 404 });
    }
    return new Response(downloaded.data, { headers: {
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': 'attachment; filename="comprovante"',
      'Cache-Control': 'private, no-store, max-age=0',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
    } });
  } catch { return NextResponse.json({ error: 'Comprovante não encontrado.' }, { status: 404 }); }
}
