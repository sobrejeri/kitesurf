import Link from 'next/link';

import { markNotificationRead } from '@/app/actions/notifications';
import { ActionForm } from '@/components/action-form';
import { Card, Note, PageHeader } from '@/components/ui';
import { requireRole } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/supabase/server';

type Area='aluno'|'instrutor'|'admin';
interface Notice { id:string;title:string;body:string;href:string;category:string;read_at:string|null;created_at:string }

export async function NotificationInbox({area}:{area:Area}) {
  const viewer=await requireRole([area==='aluno'?'student':area==='admin'?'admin':'instructor']);
  const db=await createSupabaseServerClient();
  const {data,error}=await db.from('app_notifications')
    .select('id,title,body,href,category,read_at,created_at')
    .eq('recipient_id',viewer.id).order('created_at',{ascending:false}).limit(100).returns<Notice[]>();
  return (
    <>
      <PageHeader eyebrow="Central de avisos" title="Notificações"
        lead="Propostas de aula, mensagens e confirmações aparecem aqui. Push externo ainda não está conectado."/>
      {error?<Note tone="warning">As notificações dependem da migração 16 do Supabase.</Note>: (
        <Card>
          {(data??[]).length===0?<p className="text-[13px] text-muted">Nenhum aviso por enquanto.</p>:(
            <ul className="divide-y divide-line">
              {(data??[]).map(n=>(
                <li key={n.id} className="py-4">
                  <div className="flex items-center gap-2">
                    {!n.read_at?<span aria-label="Não lido" className="h-2.5 w-2.5 rounded-full bg-brand"/>:null}
                    <strong className="min-w-0 flex-1 text-[14px] text-ink">{n.title}</strong>
                    <time dateTime={n.created_at} className="shrink-0 text-[11px] text-muted">
                      {new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Fortaleza',dateStyle:'short'}).format(new Date(n.created_at))}
                    </time>
                  </div>
                  <p className="mt-2 text-[13px] text-muted">{n.body}</p>
                  <div className="mt-3 flex flex-wrap items-center gap-3">
                    <Link href={n.href} className="text-[13px] font-semibold text-brand underline">Abrir atualização</Link>
                    {!n.read_at?(
                      <ActionForm action={markNotificationRead} submitLabel="Marcar como lido" submitVariant="ghost">
                        <input type="hidden" name="notificationId" value={n.id}/>
                      </ActionForm>
                    ):<span className="text-[11px] text-muted">Lido</span>}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}
    </>
  );
}
