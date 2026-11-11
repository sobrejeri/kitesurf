import type { Metadata } from 'next';

import { NotificationInbox } from '@/components/notification-inbox';
import { requireRole } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { ButtonLink, Card, Note } from '@/components/ui';

export const metadata: Metadata = { title: 'Avisos da operação' };

export default async function AdminInboxPage() {
  await requireRole(['admin']);
  const db = await createSupabaseServerClient();
  const [instructors, partners, documents, incidents] = await Promise.all([
    db.from('instructors').select('id', { head: true, count: 'exact' }).eq('status', 'pending'),
    db.from('partners').select('id', { head: true, count: 'exact' }).eq('status', 'pending'),
    db.from('instructor_documents').select('id', { head: true, count: 'exact' }).eq('status', 'pending'),
    db.from('booking_incidents').select('id', { head: true, count: 'exact' }).in('status', ['open', 'reviewing']),
  ]);
  const items = [
    { label: 'Instrutores em análise', result: instructors, href: '/admin/instrutores' },
    { label: 'Afiliados em análise', result: partners, href: '/admin/afiliados' },
    { label: 'Documentos pendentes', result: documents, href: '/admin/documentos' },
    { label: 'Ocorrências abertas', result: incidents, href: '/admin/ocorrencias' },
  ];
  return <>
    <h1 className="mb-4 text-[26px] font-bold text-ink">Avisos da operação</h1>
    <div className="mb-7 grid gap-3 sm:grid-cols-2">
      {items.map((item) => <Card key={item.href}>
        <h2 className="text-[14px] font-semibold text-ink">{item.label}</h2>
        {item.result.error ? <Note tone="warning">Não foi possível consultar esta pendência.</Note> :
          <p className="mt-2 text-[28px] font-bold text-brand">{item.result.count ?? 0}</p>}
        <ButtonLink href={item.href} variant="ghost" size="sm" className="mt-3">Conferir</ButtonLink>
      </Card>)}
    </div>
    <NotificationInbox area="admin" />
  </>;
}
