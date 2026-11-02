import 'server-only';

import { createSupabaseServerClient } from '@/lib/supabase/server';

export type MeetingChange = {
  id:string;booking_id:string;meeting_id:string;
  requester_id:string;responder_id:string;
  original_starts_at:string;proposed_starts_at:string;
  reason:string;status:'pending'|'accepted'|'rejected'|'expired';
  expires_at:string;requested_at:string;responded_at:string|null;
  choice_expires_at:string|null; resolution:'cancelled'|'replacement_requested'|null;
};

export type MeetingChangeRead = {ready:boolean; rows:MeetingChange[]};

export async function listMeetingChanges(bookingId:string):Promise<MeetingChangeRead>{
  const db=await createSupabaseServerClient();
  const {data,error}=await db.from('meeting_change_requests')
    .select('id,booking_id,meeting_id,requester_id,responder_id,original_starts_at,proposed_starts_at,reason,status,expires_at,requested_at,responded_at,choice_expires_at,resolution')
    .eq('booking_id',bookingId)
    .order('requested_at',{ascending:false})
    .limit(30).returns<MeetingChange[]>();
  if(error){
    console.warn('[meeting.changes.read]',{code:error.code});
    return {ready:false,rows:[]};
  }
  return {ready:true,rows:data??[]};
}
