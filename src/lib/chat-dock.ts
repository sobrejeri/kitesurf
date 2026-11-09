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
/** Each notification bubble represents one reservation conversation, not a
 * merged peer: opening it must clear only its own real unread messages. */
export function chatBubbles(threads: readonly ChatThread[]) {
  return [...threads]
    .filter(thread => thread.unread > 0)
    .sort((a,b) => b.lastAt.localeCompare(a.lastAt))
    .slice(0,5);
}
/** Floating conversation avatars remain available after closing by tapping
 * outside, even if viewing the chat marked its messages read. X removes the
 * opened session, while fresh unread messages can create a new avatar. */
export function chatSessionBubbles(
  threads: readonly ChatThread[],
  openedIds: readonly string[],
  hiddenUnread: Readonly<Record<string,string>> = {},
): ChatThread[] {
  const opened = new Set(openedIds);
  return [...threads]
    .filter(t => opened.has(t.id) ||
      (t.unread > 0 && hiddenUnread[t.id] !== t.lastAt))
    .sort((a,b) => b.lastAt.localeCompare(a.lastAt))
    .slice(0,5);
}

/** Open chat's top-edge portraits represent actual active conversations,
 * not old reservations. Keep the selected reservation first, followed by each
 * other newly unread or user-opened session, even for the same participant:
 * otherwise multiple real messages from one instructor become inaccessible.
 * Distinguish those sessions through their reservation code in the UI. */
export function chatSelectableThreads(
  threads:readonly ChatThread[],
  selectedId:string|null,
  openedIds:readonly string[],
  hiddenUnread:Readonly<Record<string,string>>={},
):ChatThread[] {
  const relevant=chatSessionBubbles(threads,openedIds,hiddenUnread);
  const selected=selectedId?threads.find(t=>t.id===selectedId):undefined;
  const ordered=selected?[selected,...relevant.filter(t=>t.id!==selected.id)]:relevant;
  return ordered.slice(0,6);
}

/** Keep each open-chat portrait at the same physical tab position even
 * when selection changes or another participant sends a newer message.
 * New active sessions append on the right; selection alone never sorts. */
export function chatStableTabs(
  threads:readonly ChatThread[],
  selectedId:string|null,
  openedIds:readonly string[],
  hiddenUnread:Readonly<Record<string,string>>,
  order:readonly string[],
):ChatThread[] {
  const eligible=chatSessionBubbles(threads,openedIds,hiddenUnread);
  const active=selectedId?threads.find(t=>t.id===selectedId):undefined;
  const remaining=active && !eligible.some(t=>t.id===active.id)
    ? [...eligible,active] : eligible;
  const position=new Map(order.map((id,index)=>[id,index]));
  return remaining.sort((a,b)=>{
    const aPosition=position.get(a.id);
    const bPosition=position.get(b.id);
    if(aPosition!==undefined && bPosition!==undefined)return aPosition-bPosition;
    if(aPosition!==undefined)return -1;
    if(bPosition!==undefined)return 1;
    return b.lastAt.localeCompare(a.lastAt);
  }).slice(0,6);
}

/** Small photo row inside an open chat: only newly received messages or
 * chats opened by this user during the current session belong here.
 * Multiple bookings with one person share ONE portrait, with priority for
 * the selected reservation. The full inbox remains available in the menu. */
export function chatSwitcherThreads(
  threads: readonly ChatThread[],
  selectedId: string | null,
  openedIds: readonly string[],
  hiddenUnread: Readonly<Record<string,string>> = {},
): ChatThread[] {
  const opened = new Set(openedIds);
  const isFreshUnread = (thread:ChatThread) =>
    thread.unread > 0 && hiddenUnread[thread.id] !== thread.lastAt;
  const relevant = threads
    .filter(t => t.id === selectedId || opened.has(t.id) || isFreshUnread(t))
    .sort((a,b) => {
      if (a.id === selectedId && b.id !== selectedId) return -1;
      if (b.id === selectedId && a.id !== selectedId) return 1;
      const unreadDifference = Number(isFreshUnread(b)) - Number(isFreshUnread(a));
      return unreadDifference || b.lastAt.localeCompare(a.lastAt);
    });
  const people = new Map<string,ChatThread>();
  for (const thread of relevant) {
    if (!people.has(thread.peerId)) people.set(thread.peerId, thread);
  }
  return [...people.values()];
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
