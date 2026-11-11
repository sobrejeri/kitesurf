import Link from 'next/link';

import { markNotificationRead } from '@/app/actions/notifications';
import { ActionForm } from '@/components/action-form';
import { Icon, type IconName } from '@/components/icon';
import { StudentPageTitle } from '@/components/student/page-title';
import { Note, PageHeader } from '@/components/ui';
import { requireRole } from '@/lib/auth';
import { formatRelativeStamp } from '@/lib/format';
import { createSupabaseServerClient } from '@/lib/supabase/server';

type Area='aluno'|'instrutor'|'admin';
interface Notice { id:string;title:string;body:string;href:string;category:string;read_at:string|null;created_at:string }

/** One icon per kind of notice; anything new falls back to the bell. */
const CATEGORY_ICONS: Readonly<Record<string, IconName>> = {
  message: 'chat', booking: 'calendar', offer: 'bell', incident: 'shield',
};

/**
 * Notifications as a phone inbox: each row opens its destination, unread rows
 * are tinted with a dot on their icon, and "Marcar como lida" stays one tap
 * away without leaving the list. Shared by the three signed-in areas.
 */
export async function NotificationInbox({area}:{area:Area}) {
  const viewer=await requireRole([area==='aluno'?'student':area==='admin'?'admin':'instructor']);
  const db=await createSupabaseServerClient();
  const {data,error}=await db.from('app_notifications')
    .select('id,title,body,href,category,read_at,created_at')
    .eq('recipient_id',viewer.id).order('created_at',{ascending:false}).limit(100).returns<Notice[]>();
  const notices=data??[];
  const unread=notices.filter(n=>!n.read_at).length;
  const summary=error?undefined:unread?`${unread} ${unread===1?'não lida':'não lidas'}`:'Tudo em dia';
  const now=Date.now();
  return (
    <>
      {area==='aluno'
        ? <StudentPageTitle title="Notificações" subtitle={summary}/>
        : <PageHeader title="Notificações" lead={summary}/>}
      {error?<Note tone="warning">As notificações dependem da migração 16 do Supabase.</Note>:notices.length===0?(
        <div className="vento-inbox-empty grid place-items-center gap-2 rounded-card border border-dashed border-line-ghost bg-surface px-6 py-10 text-center">
          <span className="grid h-12 w-12 place-items-center rounded-full bg-brand-soft text-brand" aria-hidden="true">
            <Icon name="bell" className="!h-6 !w-6"/>
          </span>
          <p className="text-[15px] font-semibold text-ink">Nenhum aviso por enquanto</p>
          <p className="max-w-[30ch] text-[13px] text-muted">Mensagens, propostas e confirmações aparecem aqui.</p>
        </div>
      ):(
        <ul aria-label="Notificações" className="vento-inbox overflow-hidden rounded-card border border-line bg-surface shadow-card">
          {notices.map(n=>(
            <li key={n.id} className={`vento-inbox-row relative flex gap-3 border-b border-line px-4 py-3.5 last:border-b-0 ${n.read_at?'':'is-unread bg-brand-wash'}`}>
              <span className={`vento-inbox-icon relative grid h-10 w-10 shrink-0 place-items-center rounded-[12px] ${n.read_at?'bg-sand text-muted':'bg-brand-soft text-brand'}`} aria-hidden="true">
                <Icon name={CATEGORY_ICONS[n.category]??'bell'} className="!h-5 !w-5"/>
                {!n.read_at?<span className="vento-inbox-dot absolute -right-1 -top-1 h-3 w-3 rounded-full border-2 border-surface bg-brand"/>:null}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  {/* The title link covers the row, so the whole notice is one tap target. */}
                  <Link href={n.href} className={`vento-inbox-title min-w-0 flex-1 text-[14.5px] leading-snug text-ink after:absolute after:inset-0 after:content-[''] focus-visible:outline-none focus-visible:after:rounded-[inherit] focus-visible:after:outline-2 focus-visible:after:outline-offset-[-2px] focus-visible:after:outline-brand ${n.read_at?'font-medium':'font-semibold'}`}>
                    {n.title}{!n.read_at?<span className="sr-only"> (não lida)</span>:null}
                  </Link>
                  <time dateTime={n.created_at} className="shrink-0 text-[11.5px] text-muted">{formatRelativeStamp(n.created_at,now)}</time>
                </div>
                <p className="mt-0.5 line-clamp-2 text-[13px] leading-snug text-muted">{n.body}</p>
                {!n.read_at?(
                  <ActionForm action={markNotificationRead} submitLabel="Marcar como lida" submitVariant="ghost"
                    className="relative z-10 mt-2" submitClassName="!min-h-8 !px-3 !text-[12px]">
                    <input type="hidden" name="notificationId" value={n.id}/>
                  </ActionForm>
                ):null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
