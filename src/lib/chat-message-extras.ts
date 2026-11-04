import 'server-only';
import type {createSupabaseServerClient} from './supabase/server';
import type {ChatMessage} from './chat-dock';
const signed=new Map<string,{url:string;imageUrl:string|null;until:number}>();
export async function chatMessageExtras(db:Awaited<ReturnType<typeof createSupabaseServerClient>>,viewerId:string,bookingId:string,messages:ChatMessage[]) {
  if(!messages.length)return messages;
  const ids=messages.map(m=>m.id);
  const [files,locations]=await Promise.all([
    db.from('booking_message_attachments').select('message_id,object_path,original_name,mime_type,bytes').eq('booking_id',bookingId).in('message_id',ids),
    db.from('booking_message_locations').select('message_id,latitude,longitude').eq('booking_id',bookingId).in('message_id',ids),
  ]);
  // Existing plain conversations remain usable before migration 37 is installed.
  if(files.error || locations.error)return messages;
  for(const row of files.data ?? []){
    const message=messages.find(m=>m.id===row.message_id);if(!message)continue;
    const key=`${viewerId}:${bookingId}:${row.object_path}`;
    let cached=signed.get(key);
    if(!cached || cached.until<Date.now()){
      const bucket=db.storage.from('vento-chat-files');
      const download=await bucket.createSignedUrl(row.object_path,3600,{download:row.original_name});
      if(!download.data?.signedUrl)continue;
      const preview=/^image\/(jpeg|png|webp|gif)$/.test(row.mime_type)?await bucket.createSignedUrl(row.object_path,3600):null;
      cached={url:download.data.signedUrl,imageUrl:preview?.data?.signedUrl ?? null,until:Date.now()+120_000};
      if(signed.size>=500)signed.clear();signed.set(key,cached);
    }
    message.attachment={name:row.original_name,mime:row.mime_type,bytes:row.bytes,url:cached.url,imageUrl:cached.imageUrl};
  }
  for(const row of locations.data ?? []){
    const message=messages.find(m=>m.id===row.message_id);
    if(message)message.location={latitude:row.latitude,longitude:row.longitude};
  }
  return messages;
}
