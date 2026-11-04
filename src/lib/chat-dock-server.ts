import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { getViewer } from './auth';
import { createSupabaseServerClient, currentArea } from './supabase/server';
import { chatBookingId, chatBubbles, type ChatArea, type ChatMessage, type ChatThread } from './chat-dock';
import { friendlyError } from '@/app/actions/errors';

const json = (body: unknown, status = 200) => NextResponse.json(body, {
  status, headers: { 'Cache-Control': 'private, no-store', Vary: 'Cookie' },
});
const Id = z.uuid();
const photos = new Map<string,{url:string|null;until:number}>();
interface ChatBooking {
  id: string; code: string; student_id: string; instructor_id: string; created_at: string;
  student: { full_name: string } | null;
  instructor: { profile: { full_name: string } | null } | null;
  messages: ChatMessage[];
}
const columns = `id,code,student_id,instructor_id,created_at,
  student:profiles!bookings_student_id_fkey(full_name),
  instructor:instructors!bookings_instructor_id_fkey(profile:profiles!instructors_id_fkey(full_name)),
  messages:booking_messages!booking_messages_booking_id_fkey(id,sender_id,body,created_at)`;

export async function chatDockRequest(request: NextRequest, area: ChatArea) {
  const viewer = await getViewer();
  if (!viewer) return json({ error: 'Entre novamente para abrir suas conversas.' },401);
  if (await currentArea() !== area || viewer.role !== (area === 'aluno' ? 'student' : 'instructor'))
    return json({ error: 'Conversa indisponível nesta conta.' },403);
  const viewerId=viewer.id;
  const db = await createSupabaseServerClient(area);
  const ownerColumn = area === 'aluno' ? 'student_id' : 'instructor_id';
  const ownBookings = () => db.from('bookings').select(columns).eq(ownerColumn,viewer.id)
    .in('status',['confirmed','completed']).not('instructor_id','is',null)
    .order('created_at',{ascending:false,referencedTable:'messages'})
    .order('id',{ascending:false,referencedTable:'messages'})
    .limit(1,{referencedTable:'messages'});
  const bookingId = request.nextUrl.searchParams.get('bookingId');
  try {
    if (request.method === 'POST') {
      // Custom-header JSON requests require a same-origin browser request.
      if (request.headers.get('x-vento-chat') !== '1'
        || request.headers.get('sec-fetch-site') === 'cross-site') return json({error:'Solicitação inválida.'},403);
      const input = z.discriminatedUnion('type',[
        z.strictObject({type:z.literal('send'),bookingId:Id,body:z.string().trim().min(1).max(2000)}),
        z.strictObject({type:z.literal('read'),bookingId:Id,ids:z.array(Id).min(1).max(100),through:z.iso.datetime({offset:true})}),
      ]).safeParse(await request.json().catch(()=>null));
      if (!input.success) return json({error:'Confira a mensagem e tente novamente.'},400);
      const owned = await ownBookings().eq('id',input.data.bookingId).maybeSingle<ChatBooking>();
      if (owned.error) throw owned.error;
      if (!owned.data) return json({error:'Conversa indisponível.'},404);
      if (input.data.type === 'send') {
        const sent = await db.rpc('send_booking_message',{p_booking_id:input.data.bookingId,p_body:input.data.body});
        if (sent.error) return json({error:friendlyError(sent.error)},400);
        return json({ok:true,id:sent.data});
      }
      const unread = await db.from('app_notifications').select('id').eq('recipient_id',viewer.id)
        .eq('category','message').eq('href',`/${area}/atendimento/${input.data.bookingId}`)
        .in('id',input.data.ids).is('read_at',null).lte('created_at',input.data.through);
      if (unread.error) throw unread.error;
      for (const row of unread.data ?? []) {
        const marked = await db.rpc('mark_my_notification_read',{p_id:row.id});
        if (marked.error) throw marked.error;
      }
      return json({ok:true,ids:(unread.data ?? []).map(row=>row.id)});
    }
    if (bookingId) {
      if (!Id.safeParse(bookingId).success) return json({error:'Conversa inválida.'},400);
      const booking = await ownBookings().eq('id',bookingId).maybeSingle<ChatBooking>();
      if (booking.error) throw booking.error;
      if (!booking.data) return json({error:'Conversa indisponível.'},404);
      let query = db.from('booking_messages').select('id,sender_id,body,created_at').eq('booking_id',bookingId);
      const before = z.object({at:z.iso.datetime({offset:true}),id:Id}).safeParse({
        at:request.nextUrl.searchParams.get('before'),id:request.nextUrl.searchParams.get('messageId'),
      });
      if (before.success) query = query.or(`created_at.lt.${before.data.at},and(created_at.eq.${before.data.at},id.lt.${before.data.id})`);
      const messages = await query.order('created_at',{ascending:false}).order('id',{ascending:false}).limit(101).returns<ChatMessage[]>();
      if (messages.error) throw messages.error;
      const thread = toThread(booking.data,area,[]);
      thread.photoUrl = await photoFor(thread);
      return json({viewerId,thread,messages:(messages.data ?? []).slice(0,100).reverse(),hasOlder:(messages.data?.length ?? 0)>100});
    }
    const [bookings,notices] = await Promise.all([
      ownBookings().order('created_at',{ascending:false}).limit(50).returns<ChatBooking[]>(),
      db.from('app_notifications').select('id,href,created_at').eq('recipient_id',viewer.id)
        .eq('category','message').is('read_at',null).order('created_at',{ascending:false}).limit(1000),
    ]);
    if (bookings.error || notices.error) throw bookings.error ?? notices.error;
    const noticeRows = notices.data ?? [];
    const rows = bookings.data ?? [];
    // A new message on an older reservation must still appear as a bubble.
    const extraIds = [...new Set(noticeRows.map(n=>chatBookingId(n.href,area))
      .filter((id): id is string => Boolean(id) && !rows.some(row=>row.id===id)))];
    for (let offset=0;offset<extraIds.length;offset+=100) {
      const extra = await ownBookings().in('id',extraIds.slice(offset,offset+100)).returns<ChatBooking[]>();
      if (extra.error) throw extra.error;
      rows.push(...extra.data ?? []);
    }
    const threads = rows.map(row=>toThread(row,area,noticeRows)).sort((a,b)=>b.lastAt.localeCompare(a.lastAt));
    // Only resolve photos displayed in bubbles; other photos load on opening.
    for (const bubble of chatBubbles(threads)) {
      const url=await photoFor(bubble);
      for (const thread of threads) if(thread.peerId===bubble.peerId)thread.photoUrl=url;
    }
    return json({viewerId,threads});

    async function photoFor(thread: ChatThread): Promise<string|null> {
      try {
        const key=`${area}:${viewerId}:${thread.id}:${thread.peerId}`;
        const cached=photos.get(key);
        if(cached && cached.until>Date.now())return cached.url;
        let path: string|null = null;
        if (area === 'aluno') {
          const result = await db.rpc('get_my_booking_instructor_avatar',{p_booking_id:thread.id});
          if (!result.error && typeof result.data === 'string') path=result.data;
        } else {
          const result = await db.rpc('get_my_instructor_student_avatar_paths');
          if (!result.error) path=(result.data as {student_id:string;avatar_path:string}[])
            ?.find(row=>row.student_id===thread.peerId)?.avatar_path ?? null;
        }
        const result = path ? await db.storage.from(area === 'aluno' ? 'vento-instructor-avatars' : 'vento-student-avatars')
          .createSignedUrl(path,3600) : null;
        const url=result?.data?.signedUrl ?? null;
        if(photos.size>=200)photos.clear();
        photos.set(key,{url,until:Date.now()+120_000});
        return url;
      } catch { return null; }
    }
  } catch (error) {
    console.error('[chat.dock]',{code:(error as {code?:string})?.code});
    return json({error:'Não foi possível atualizar a conversa. Tente novamente.'},503);
  }
}

function toThread(row: ChatBooking,area: ChatArea,notices: {id:string;href:string;created_at:string}[]):ChatThread {
  const received = notices.filter(n=>chatBookingId(n.href,area)===row.id);
  return {id:row.id,code:row.code,peerId:area==='aluno'?row.instructor_id:row.student_id,
    name:(area==='aluno'?row.instructor?.profile?.full_name:row.student?.full_name)?.trim() || (area==='aluno'?'Instrutor':'Aluno'),
    unread:received.length,notificationIds:received.map(n=>n.id),preview:row.messages?.[0]?.body ?? 'Conversa da sua aula',
    lastAt:received[0]?.created_at ?? row.messages?.[0]?.created_at ?? row.created_at};
}
