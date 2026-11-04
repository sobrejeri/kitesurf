import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { getViewer } from './auth';
import { createSupabaseServerClient, currentArea } from './supabase/server';
import { chatBookingId, chatReservationDay, type ChatArea, type ChatMessage, type ChatThread } from './chat-dock';
import { friendlyError } from '@/app/actions/errors';
import {chatFileMatches,CHAT_FILE_TYPES,MAX_CHAT_FILE} from './chat-files';
import {chatMessageExtras} from './chat-message-extras';

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
  meetings:{starts_at:string;status:string}[];
}
const columns = `id,code,student_id,instructor_id,created_at,
  student:profiles!bookings_student_id_fkey(full_name),
  instructor:instructors!bookings_instructor_id_fkey(profile:profiles!instructors_id_fkey(full_name)),
  meetings:booking_meetings!booking_meetings_booking_id_fkey(starts_at,status),
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
    const heartbeat=await db.rpc('touch_my_chat_presence');
    const featuresReady=!heartbeat.error;
    if (request.method === 'POST') {
      // Custom-header JSON requests require a same-origin browser request.
      if (request.headers.get('x-vento-chat') !== '1'
        || request.headers.get('sec-fetch-site') === 'cross-site') return json({error:'Solicitação inválida.'},403);
      if(request.headers.get('content-type')?.startsWith('multipart/form-data')){
        if(!featuresReady)return json({error:'O envio de arquivos ainda precisa ser ativado no chat.'},503);
        if(Number(request.headers.get('content-length'))>MAX_CHAT_FILE+65536)return json({error:'O arquivo deve ter até 10 MB.'},413);
        const form=await request.formData();const id=Id.safeParse(form.get('bookingId'));const file=form.get('file');
        if(!id.success || !(file instanceof File) || !file.size || file.size>MAX_CHAT_FILE)return json({error:'Selecione uma foto ou arquivo de até 10 MB.'},400);
        const owned=await ownBookings().eq('id',id.data).maybeSingle<ChatBooking>();
        if(owned.error)throw owned.error;if(!owned.data)return json({error:'Conversa indisponível.'},404);
        const name=[...file.name].map(c=>c.charCodeAt(0)<32 || c==='/' || c==='\\'?'_':c).join('').slice(0,180);
        let mime=file.type;
        if(!mime || (mime==='application/vnd.ms-excel' && name.toLowerCase().endsWith('.csv'))){
          const extensions:Record<string,string>={jpg:'image/jpeg',jpeg:'image/jpeg',png:'image/png',webp:'image/webp',gif:'image/gif',heic:'image/heic',heif:'image/heif',pdf:'application/pdf',txt:'text/plain',csv:'text/csv',docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',xlsx:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'};
          mime=extensions[name.split('.').at(-1)?.toLowerCase() ?? ''] ?? '';
        }
        const bytes=new Uint8Array(await file.arrayBuffer());
        if(!(CHAT_FILE_TYPES as readonly string[]).includes(mime) || !chatFileMatches(bytes,mime))return json({error:'Formato não reconhecido. Use uma foto, PDF, TXT, CSV, DOCX ou XLSX.'},400);
        const prepared=await db.rpc('prepare_chat_attachment',{p_booking_id:id.data,p_name:name,p_mime:mime,p_bytes:file.size});
        if(prepared.error)throw prepared.error;
        const upload=prepared.data?.[0] as {upload_id:string;object_path:string}|undefined;
        if(!upload)throw new Error('Upload unavailable');
        const bucket=db.storage.from('vento-chat-files');
        const stored=await bucket.upload(upload.object_path,bytes,{contentType:mime,upsert:false});
        if(stored.error){await db.rpc('discard_my_chat_upload',{p_upload_id:upload.upload_id});throw stored.error;}
        let sent=await db.rpc('send_chat_attachment',{p_upload_id:upload.upload_id});
        if(sent.error?.message?.includes('Please wait before sending again')){
          await new Promise(resolve=>setTimeout(resolve,2100));
          sent=await db.rpc('send_chat_attachment',{p_upload_id:upload.upload_id});
        }
        if(sent.error){const removed=await bucket.remove([upload.object_path]);if(!removed.error)await db.rpc('discard_my_chat_upload',{p_upload_id:upload.upload_id});throw sent.error;}
        return json({ok:true,id:sent.data});
      }
      const input = z.discriminatedUnion('type',[
        z.strictObject({type:z.literal('send'),bookingId:Id,body:z.string().trim().min(1).max(2000)}),
        z.strictObject({type:z.literal('read'),bookingId:Id,ids:z.array(Id).max(100),through:z.iso.datetime({offset:true}),lastMessageId:Id}),
        z.strictObject({type:z.literal('visibility'),visible:z.boolean()}),
        z.strictObject({type:z.literal('location'),bookingId:Id,latitude:z.number().min(-90).max(90),longitude:z.number().min(-180).max(180)}),
      ]).safeParse(await request.json().catch(()=>null));
      if (!input.success) return json({error:'Confira a mensagem e tente novamente.'},400);
      if(input.data.type==='visibility'){
        if(!featuresReady)return json({error:'O status online ainda precisa ser ativado no chat.'},503);
        const result=await db.rpc('set_my_chat_visibility',{p_visible:input.data.visible});
        if(result.error)throw result.error;return json({ok:true});
      }
      const owned = await ownBookings().eq('id',input.data.bookingId).maybeSingle<ChatBooking>();
      if (owned.error) throw owned.error;
      if (!owned.data) return json({error:'Conversa indisponível.'},404);
      if (input.data.type === 'send') {
        const sent = await db.rpc('send_booking_message',{p_booking_id:input.data.bookingId,p_body:input.data.body});
        if (sent.error) return json({error:friendlyError(sent.error)},400);
        return json({ok:true,id:sent.data});
      }
      if(input.data.type==='location'){
        if(!featuresReady)return json({error:'O envio de localização ainda precisa ser ativado no chat.'},503);
        const result=await db.rpc('send_chat_location',{p_booking_id:input.data.bookingId,p_latitude:input.data.latitude,p_longitude:input.data.longitude});
        if(result.error)return json({error:friendlyError(result.error)},400);return json({ok:true,id:result.data});
      }
      if(featuresReady){const marked=await db.rpc('mark_my_booking_chat_read',{p_booking_id:input.data.bookingId,p_message_id:input.data.lastMessageId});if(marked.error)throw marked.error;}
      const unread = input.data.ids.length ? await db.from('app_notifications').select('id').eq('recipient_id',viewer.id)
        .eq('category','message').eq('href',`/${area}/atendimento/${input.data.bookingId}`)
        .in('id',input.data.ids).is('read_at',null).lte('created_at',input.data.through) : {data:[],error:null};
      if (unread.error) throw unread.error;
      for (const row of unread.data ?? []) {
        const marked = await db.rpc('mark_my_notification_read',{p_id:row.id});
        if (marked.error) throw marked.error;
      }
      return json({ok:true,featuresReady,ids:(unread.data ?? []).map(row=>row.id)});
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
      const rows=(messages.data ?? []).slice(0,100).reverse();
      const [presence,receipt]=featuresReady?await Promise.all([
        db.from('chat_presence').select('last_seen').eq('user_id',thread.peerId).maybeSingle(),
        db.from('booking_chat_reads').select('last_message_id,message_at,read_at').eq('booking_id',bookingId).eq('user_id',thread.peerId).maybeSingle(),
      ]):[{data:null},{data:null}];
      return json({viewerId,featuresReady,thread,messages:featuresReady?await chatMessageExtras(db,viewerId,bookingId,rows):rows,
        peerLastSeen:presence.data?.last_seen ?? null,peerRead:receipt.data ?? null,hasOlder:(messages.data?.length ?? 0)>100});
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
    // Resolve one private photo per participant for the entire conversation list.
    const peers=[...new Map(threads.map(t=>[t.peerId,t])).values()];
    for(let start=0;start<peers.length;start+=5){
      await Promise.all(peers.slice(start,start+5).map(async peer=>{
        const url=await photoFor(peer);
        for(const thread of threads)if(thread.peerId===peer.peerId)thread.photoUrl=url;
      }));
    }
    const ownPresence=featuresReady?await db.from('chat_presence').select('show_online').eq('user_id',viewerId).maybeSingle():{data:null};
    return json({viewerId,featuresReady,showOnline:ownPresence.data?.show_online ?? true,threads});

    async function photoFor(thread: ChatThread): Promise<string|null> {
      try {
        const key=`${area}:${viewerId}:${thread.peerId}`;
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
  return {id:row.id,code:row.code,day:chatReservationDay(row.meetings ?? []),peerId:area==='aluno'?row.instructor_id:row.student_id,
    name:(area==='aluno'?row.instructor?.profile?.full_name:row.student?.full_name)?.trim() || (area==='aluno'?'Instrutor':'Aluno'),
    unread:received.length,notificationIds:received.map(n=>n.id),preview:row.messages?.[0]?.body ?? 'Conversa da sua aula',
    lastAt:received[0]?.created_at ?? row.messages?.[0]?.created_at ?? row.created_at};
}
