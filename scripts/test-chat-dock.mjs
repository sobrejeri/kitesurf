import assert from 'node:assert/strict';
import {chatBookingId,chatBubbles,mergeChatMessages} from '../src/lib/chat-dock.ts';
const id='00000000-0000-0000-0000-000000000001';
assert.equal(chatBookingId(`/aluno/atendimento/${id}`,'aluno'),id);
assert.equal(chatBookingId(`/instrutor/atendimento/${id}`,'aluno'),null);
assert.equal(chatBookingId(`/aluno/atendimento/${id}?antes=x`,'aluno'),null);
assert.equal(chatBookingId(`/aluno/atendimento/${id}/extra`,'aluno'),null);
const threads=[
  {id:'old',peerId:'teacher',lastAt:'2026-11-01T10:00:00Z',unread:2},
  {id:'new',peerId:'teacher',lastAt:'2026-11-02T10:00:00Z',unread:3},
  {id:'read',peerId:'other',lastAt:'2026-11-03T10:00:00Z',unread:0},
];
const bubbles=chatBubbles(threads);
assert.equal(bubbles.length,2);
assert.deepEqual(bubbles.map(t=>t.id),['new','old']);
assert.deepEqual(bubbles.map(t=>t.unread),[3,2]);
assert.equal(threads[0].unread,2);assert.equal(threads[1].unread,3);
assert.equal(chatBubbles(threads.filter(t=>t.unread>0&&t.id!=='old')).length,1);
assert.equal(chatBubbles(threads.concat(Array.from({length:8},(_,i)=>({id:`extra-${i}`,peerId:`extra-peer-${i}`,lastAt:`2026-11-03T10:00:0${i}Z`,unread:1})))).length,5);
const message=(id,created_at,body=id)=>({id,created_at,body,sender_id:'owner'});
const a=message('a','2026-11-04T10:00:00-03:00');
const b=message('b','2026-11-04T13:00:00Z');
const c=message('c','2026-11-04T13:01:00Z');
const merged=mergeChatMessages([b,c],[a,b]);
assert.deepEqual(merged.map(m=>m.id),['a','b','c']);
assert.equal(mergeChatMessages([b],[{...b,body:'latest'}])[0].body,'latest');
console.log('PASS: unread avatar bubbles remain per reservation and cap the stack; history merges without duplicates');
const {chatWasRead,presenceLabel,chatReservationDay,chatThreadTag}=await import('../src/lib/chat-dock.ts');
const {chatFileMatches}=await import('../src/lib/chat-files.ts');
assert.equal(chatWasRead(c,{last_message_id:b.id,message_at:b.created_at,read_at:b.created_at}),false);
assert.equal(chatWasRead(b,{last_message_id:c.id,message_at:c.created_at,read_at:c.created_at}),true);
assert.equal(presenceLabel('2026-11-04T13:00:00Z',Date.parse('2026-11-04T13:00:30Z')),'Online');
assert.match(presenceLabel('2026-11-04T13:00:00Z',Date.parse('2026-11-04T14:00:00Z')),/Visto por último/);
const days=[{starts_at:'2026-11-05T13:00:00Z',status:'scheduled'},{starts_at:'2026-11-04T13:00:00Z',status:'completed'},{starts_at:'2026-11-03T13:00:00Z',status:'cancelled'}];
assert.equal(chatReservationDay(days,Date.parse('2026-11-04T14:00:00Z')),days[0].starts_at);
assert.equal(chatReservationDay(days,Date.parse('2026-11-06T14:00:00Z')),days[0].starts_at);
assert.equal(chatThreadTag({code:'VNT-1001',day:days[0].starts_at}),'Reserva VNT-1001 · dia 05/11');
assert.equal(chatFileMatches(new TextEncoder().encode('<script>bad</script>'),'image/jpeg'),false);
assert.equal(chatFileMatches(new Uint8Array([255,216,255,0]),'image/jpeg'),true);
assert.equal(chatFileMatches(new Uint8Array([0,65]),'text/plain'),false);
console.log('PASS: receipts, presence, reservation dates and attachment format checks');


// Messenger-style UI regression: one draggable unread stack, a safe dismiss
// target, X to close the active window, and photo switching inside the chat.
const {readFileSync}=await import('node:fs');
const floatingChat=readFileSync(new URL('../src/components/floating-chat.tsx',import.meta.url),'utf8');
const floatingCss=readFileSync(new URL('../src/components/floating-chat.module.css',import.meta.url),'utf8');
const lineIcons=readFileSync(new URL('../src/components/icon.tsx',import.meta.url),'utf8');
assert.ok(
  !floatingChat.includes('ref={launcher}') &&
  floatingChat.includes("const visibleUnread=threads.filter(t=>t.unread>0 && hiddenUnread[t.id]!==t.lastAt)") &&
  floatingChat.includes('const bubbleList=chatBubbles(visibleUnread)') &&
  floatingChat.includes('const extraUnreadThreads=') &&
  floatingChat.includes('onClick={()=>{if(suppressBubbleClick.current)return;show(t.id);}}') &&
  floatingChat.includes('onPointerDown={onBubbleDown}') &&
  floatingChat.includes('onPointerMove={onBubbleMove}') &&
  floatingChat.includes('onPointerUp={onBubbleUp}') &&
  floatingChat.includes("if(!drag.moved) event.currentTarget.setPointerCapture(event.pointerId)") &&
  floatingChat.includes("bubbleSide.current=side") &&
  floatingChat.includes("setBubblePosition({") &&
  floatingCss.includes('.bubbles {') && floatingCss.includes('touch-action:none') &&
  floatingCss.includes('.bubblesDragging {'),
  'Unread conversation avatars must be draggable between the two screen sides without intercepting taps',
);
assert.ok(
  floatingChat.includes('const dismissAllBubbles=useCallback') &&
  floatingChat.includes('for(const t of threads) if(t.unread>0) next[t.id]=t.lastAt') &&
  floatingChat.includes('dismissAllBubbles();return;') &&
  floatingChat.includes("styles.trashTarget") &&
  floatingChat.includes("styles.trashTargetHot") &&
  floatingChat.includes('aria-label="Solte aqui para fechar todas as bolinhas de conversa"') &&
  floatingChat.includes('setHiddenUnread(previous=>({...previous,[current.id]:current.lastAt}))') &&
  floatingChat.includes('aria-label="Fechar conversa"') &&
  lineIcons.includes('close: <path'),
  'Dismiss all must preserve unread messages for reappearance on a new message, while X closes one chat',
);
assert.ok(
  floatingChat.includes('aria-label="Alternar entre conversas recentes ou abertas"') &&
  floatingChat.includes('className={styles.threadSwitchButton}') &&
  floatingChat.includes('aria-pressed={selected}') &&
  floatingChat.includes('onClick={() => show(t.id)}') &&
  floatingChat.includes("url.pathname.replace(/\\/$/, '') ===") &&
  floatingCss.includes('.threadSwitcherScroll {') &&
  floatingCss.includes('.threadSwitchButton[aria-pressed="true"]') &&
  floatingCss.includes('.studentDock .badge,.studentDock .count { background:#e6334e;color:#fff; }'),
  'Open chat must offer horizontal thumbnail switching, menu access and red unread counters',
);
console.log('PASS: messenger-style stacked unread bubbles, side snapping, dismiss X and top photo switcher');


// iPhone keyboard regression: chat must follow VisualViewport (including
// offsetTop while Safari pans the page) rather than disappear behind the
// status bar or keyboard. Do not force the keyboard open on chat launch.
assert.ok(
  floatingChat.includes('const vv=window.visualViewport') &&
  floatingChat.includes('const top=Math.max(0,vv.offsetTop)') &&
  floatingChat.includes('const height=Math.max(230,vv.height)') &&
  floatingChat.includes("vv.addEventListener('resize',schedule)") &&
  floatingChat.includes("vv.addEventListener('scroll',schedule)") &&
  floatingChat.includes("vv.removeEventListener('resize',schedule)") &&
  floatingChat.includes("vv.removeEventListener('scroll',schedule)") &&
  floatingChat.includes("if (window.innerWidth >= 768) input.current?.focus()") &&
  floatingChat.includes("'--chat-vv-height'") &&
  floatingChat.includes("'--chat-vv-top'") &&
  floatingChat.includes("open?styles.dockOpen:''") &&
  floatingCss.includes('.dockOpen.dockKeyboard .panel') &&
  floatingCss.includes('top:calc(var(--chat-vv-top') &&
  floatingCss.includes('max-height:calc(var(--chat-vv-height') &&
  floatingCss.includes('.dockOpen .log {min-height:0'),
  'On iPhone the chat header and composer must remain visible as the software keyboard opens',
);
assert.ok(
  floatingChat.includes('const CHAT_EMOJIS = [') &&
  floatingChat.includes('function insertEmoji(emoji:string)') &&
  floatingChat.includes('const start=textarea?.selectionStart??current.length') &&
  floatingChat.includes('const end=textarea?.selectionEnd??start') &&
  floatingChat.includes('const next=current.slice(0,start)+emoji+current.slice(end)') &&
  floatingChat.includes('if(next.length>2000)return') &&
  floatingChat.includes('setSelectionRange(caret,caret)') &&
  floatingChat.includes('aria-label="Escolha um emoji"') &&
  floatingChat.includes("emojiOpen?'Fechar opções de emoji':'Escolher emoji'") &&
  floatingChat.includes('aria-expanded={emojiOpen}') &&
  floatingChat.includes("setEmojiOpen(value=>!value)") &&
  floatingCss.includes('.emojiPopover {') &&
  floatingCss.includes('.emojiChoice {') &&
  floatingCss.includes('.emojiToggle {'),
  'Composer emoji picker must work with existing drafts and preserve caret and character limit',
);
console.log('PASS: iOS keyboard-aware chat viewport and accessible emoji picker');

// Historical reservations with the same instructor must not generate a photo
// gallery at the top of one active chat. Only unread OR explicitly opened
// conversations are eligible; different reservations with one person still
// show a single portrait in the switcher.
const {chatSwitcherThreads}=await import('../src/lib/chat-dock.ts');
const denilsonHistory=[
  {id:'denilson-selected',peerId:'denilson',name:'Denilson',lastAt:'2026-11-06T11:00:00Z',unread:0},
  {id:'denilson-older-1',peerId:'denilson',name:'Denilson',lastAt:'2026-11-04T11:00:00Z',unread:0},
  {id:'denilson-older-2',peerId:'denilson',name:'Denilson',lastAt:'2026-11-03T11:00:00Z',unread:0},
  {id:'denilson-older-3',peerId:'denilson',name:'Denilson',lastAt:'2026-11-02T11:00:00Z',unread:0},
];
assert.deepEqual(
  chatSwitcherThreads(denilsonHistory,'denilson-selected',['denilson-selected']).map(t=>t.id),
  ['denilson-selected'],
  'Opening one lesson must not show portraits of every older reservation with Denilson',
);
const newLucia={id:'lucia-new',peerId:'lucia',name:'Lucia',lastAt:'2026-11-07T11:00:00Z',unread:3};
assert.deepEqual(
  chatSwitcherThreads([...denilsonHistory,newLucia],'denilson-selected',['denilson-selected']).map(t=>t.id),
  ['denilson-selected','lucia-new'],
  'A new unread chat from a different person may appear beside the opened contact',
);
assert.deepEqual(
  chatSwitcherThreads([...denilsonHistory,newLucia],'denilson-selected',['denilson-selected'],{'lucia-new':newLucia.lastAt}).map(t=>t.id),
  ['denilson-selected'],
  'A dismissed unread bubble must not reappear in the open chat photo switcher',
);
assert.deepEqual(
  chatSwitcherThreads(denilsonHistory.map(t=>t.id==='denilson-older-1'?{...t,unread:5}:t),
    'denilson-selected',['denilson-selected','denilson-older-2']).map(t=>t.id),
  ['denilson-selected'],
  'Even new messages on another booking with the same person cannot duplicate their portrait',
);
assert.ok(
  floatingChat.includes('const [openedIds,setOpenedIds] = useState<string[]>([])') &&
  floatingChat.includes('setOpenedIds(previous=>previous.includes(id)?previous:[...previous,id])') &&
  floatingChat.includes('const switcherThreads=chatSwitcherThreads(threads,selectedId,openedIds,hiddenUnread)') &&
  floatingChat.includes('selectedId && switcherThreads.length > 1 ? (') &&
  floatingChat.includes('switcherThreads.map(t => {') &&
  !floatingChat.includes('threads.map(t => {') &&
  floatingChat.includes("setOpenedIds([])"),
  'The photo row must be hidden for just one contact and never render all historical threads',
);
console.log('PASS: active chat photo row excludes duplicate historical reservations');

