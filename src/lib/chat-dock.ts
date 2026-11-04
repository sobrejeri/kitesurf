export type ChatArea = 'aluno' | 'instrutor';
export interface ChatMessage {
  id: string; sender_id: string; body: string; created_at: string;
  attachment?: {name:string;mime:string;bytes:number;url:string;imageUrl:string|null};
  location?: {latitude:number;longitude:number};
}
export interface ChatRead {last_message_id:string;message_at:string;read_at:string}
export function chatWasRead(message:ChatMessage,receipt:ChatRead|null) {
  return Boolean(receipt && (Date.parse(receipt.message_at)>Date.parse(message.created_at)
    || (Date.parse(receipt.message_at)===Date.parse(message.created_at) && receipt.last_message_id>=message.id)));
}
export function presenceLabel(lastSeen:string|null,now=Date.now()) {
  if(!lastSeen)return 'Status indisponível';
  const stamp=Date.parse(lastSeen);
  if(!Number.isFinite(stamp))return 'Status indisponível';
  if(now-stamp<=90_000)return 'Online';
  return `Visto por último em ${new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Fortaleza',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}).format(stamp)}`;
}
export interface ChatThread {
  id: string; code: string; peerId: string; name: string; unread: number;
  notificationIds: string[]; preview: string; lastAt: string; photoUrl?: string | null; day?:string|null;
}
export const chatBookingId = (href: string, area: ChatArea): string | null => {
  const match = href.match(new RegExp(`^/${area}/atendimento/([a-f0-9-]{36})$`, 'i'));
  return match?.[1] ?? null;
};
export function chatBubbles(threads: readonly ChatThread[]) {
  const people = new Map<string, ChatThread>();
  for (const thread of [...threads].sort((a,b) => b.lastAt.localeCompare(a.lastAt))) {
    if (!thread.unread) continue;
    const existing = people.get(thread.peerId);
    if (existing) existing.unread += thread.unread;
    else people.set(thread.peerId, { ...thread });
  }
  return [...people.values()].slice(0,3);
}
export function mergeChatMessages(previous: readonly ChatMessage[], incoming: readonly ChatMessage[]) {
  const rows = new Map([...previous,...incoming].map(message=>[message.id,message]));
  return [...rows.values()].sort((a,b)=>Date.parse(a.created_at)-Date.parse(b.created_at) || a.id.localeCompare(b.id));
}

export function chatReservationDay(meetings:{starts_at:string;status:string}[],now=Date.now()):string|null {
  const rows=meetings.filter(m=>m.status!=='cancelled').sort((a,b)=>Date.parse(a.starts_at)-Date.parse(b.starts_at));
  return (rows.find(m=>m.status==='in_progress') ?? rows.find(m=>m.status==='scheduled' && Date.parse(m.starts_at)>=now) ?? rows.at(-1))?.starts_at ?? null;
}
export function chatThreadTag(thread:ChatThread):string {
  const day=thread.day?new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Fortaleza',day:'2-digit',month:'2-digit'}).format(new Date(thread.day)):null;
  return `Reserva ${thread.code} · ${day?`dia ${day}`:'dia a definir'}`;
}
