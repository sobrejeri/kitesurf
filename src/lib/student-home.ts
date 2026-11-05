import type {StudentBooking} from './data';

/** Only actual records advance progress. Past unrecorded lessons stay pending. */
export function studentHomeSummary(bookings:readonly StudentBooking[],now=Date.now()) {
  const confirmed=bookings.filter(b=>b.status==='confirmed');
  const encounters=confirmed.flatMap(booking=>booking.booking_meetings.map(meeting=>({booking,meeting})));
  const order=(a:typeof encounters[number],b:typeof encounters[number])=>Date.parse(a.meeting.starts_at)-Date.parse(b.meeting.starts_at);
  const ongoing=encounters.filter(e=>e.meeting.status==='in_progress').sort(order);
  const upcoming=encounters.filter(e=>e.meeting.status==='scheduled' && Date.parse(e.meeting.starts_at)>=now).sort(order);
  const unrecorded=encounters.filter(e=>e.meeting.status==='scheduled' && Date.parse(e.meeting.starts_at)<now).sort(order);
  const current=ongoing[0] ?? upcoming[0] ?? unrecorded[0] ?? null;
  const recent=[...bookings].filter(b=>b.status==='completed').sort((a,b)=>{
    const last=(booking:StudentBooking)=>Math.max(0,...booking.booking_meetings.map(m=>Date.parse(m.starts_at)));
    return last(b)-last(a);
  })[0] ?? null;
  const booking=current?.booking ?? recent;
  const recordedMinutes=booking?.booking_meetings.filter(m=>m.status==='done').reduce((sum,m)=>sum+m.done_minutes,0) ?? 0;
  const totalMinutes=(booking?.total_hours ?? 0)*60;
  return {current,upcoming,ongoing,unrecorded,booking,recordedMinutes,totalMinutes,
    remainingMinutes:Math.max(0,totalMinutes-recordedMinutes),
    percent:totalMinutes?Math.min(100,Math.round(recordedMinutes/totalMinutes*100)):0,
    pending:bookings.filter(b=>b.status==='awaiting_payment' && Date.parse(b.created_at)>=now-600_000),
  };
}
