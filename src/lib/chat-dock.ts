export type ChatArea = 'aluno' | 'instrutor';
export interface ChatMessage { id: string; sender_id: string; body: string; created_at: string }
export interface ChatThread {
  id: string; code: string; peerId: string; name: string; unread: number;
  notificationIds: string[]; preview: string; lastAt: string; photoUrl?: string | null;
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
