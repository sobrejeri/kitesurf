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
  floatingChat.includes('const bubbleList=chatSessionBubbles(threads,openedIds,hiddenUnread)') &&
  floatingChat.includes('const extraUnreadThreads=') &&
  floatingChat.includes('onClick={()=>{if(suppressBubbleClick.current)return;show(t.id);}}') &&
  floatingChat.includes('onPointerDown={onBubbleDown}') &&
  floatingChat.includes('onPointerMove={onBubbleMove}') &&
  floatingChat.includes('onPointerUp={onBubbleUp}') &&
  floatingChat.includes("event.currentTarget.setPointerCapture(event.pointerId)") &&
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
  floatingChat.includes("'Solte aqui para fechar todas as bolinhas de conversa'") &&
  floatingChat.includes('setHiddenUnread(previous=>({...previous,[current.id]:current.lastAt}))') &&
  floatingChat.includes('aria-label="Fechar conversa"') &&
  lineIcons.includes('close: <path'),
  'Dismiss all must preserve unread messages for reappearance on a new message, while X closes one chat',
);
assert.ok(
  floatingChat.includes('aria-label="Conversas novas ou abertas"') &&
  floatingChat.includes('draggedTopTab?.id===t.id?styles.floatingThreadTabDragging') &&
  floatingChat.includes('aria-pressed={selected}') &&
  floatingChat.includes('onClick={()=>show(t.id)}') &&
  floatingChat.includes("url.pathname.replace(/\\/$/, '') ===") &&
  floatingCss.includes('.floatingThreadTabs') &&
  floatingCss.includes('.floatingThreadTab[aria-pressed="true"]') &&
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
  floatingChat.includes('const switcherThreads=chatStableTabs(threads,selectedId,openedIds,hiddenUnread,tabSequence)') &&
  floatingChat.includes('open && switcherThreads.length ? (') &&
  floatingChat.includes('switcherThreads.map(t => {') &&
  !floatingChat.includes('threads.map(t => {') &&
  floatingChat.includes("setOpenedIds([])"),
  'The photo row must be hidden for just one contact and never render all historical threads',
);
console.log('PASS: active chat photo row excludes duplicate historical reservations');


assert.ok(
  floatingCss.includes('Approved halo: a soft teal/lime glow sits BEHIND the portrait') &&
  floatingCss.includes('rgba(186,255,8,var(--bubble-ring-alpha,.10))') &&
  floatingCss.includes('rgba(36,211,197,var(--bubble-glow-alpha,.25))') &&
  floatingCss.includes('rgba(0,19,35,var(--bubble-shadow-alpha,.65))') &&
  floatingCss.includes('.bubbles .badge {') &&
  floatingCss.includes('background:#e6334e;') &&
  floatingCss.includes('touch-action:none;'),
  'Unread profile bubbles must have their approved soft shadow while preserving the red badge and touch drag',
);
console.log('PASS: subtle avatar bubble halo remains visible without changing unread badge or drag');


// The avatars should form a single side-by-side row instead of a descending
// staircase. Depth is expressed only in fading shadows, never dimming photos.
assert.ok(
  floatingChat.includes('const bubbleStep=29;') &&
  floatingChat.includes('const stackWidth=58+Math.max(0,bubbleList.length-1)*bubbleStep;') &&
  floatingChat.includes('const stackHeight=58;') &&
  floatingChat.includes("bubbleSide.current==='left'?styles.bubblesLeft:''") &&
  floatingChat.includes('left:\`\${index*bubbleStep}px\`') &&
  floatingChat.includes('right:\`\${index*bubbleStep}px\`') &&
  floatingChat.includes('bottom:0,') &&
  floatingChat.includes("'--bubble-ring-alpha':Math.max(.02,.10-index*.02).toFixed(2)") &&
  floatingChat.includes("'--bubble-glow-alpha':Math.max(.05,.25-index*.05).toFixed(2)") &&
  floatingChat.includes("'--bubble-shadow-alpha':Math.max(.28,.65-index*.09).toFixed(2)") &&
  !floatingChat.includes("bottom:\`\${index*10}px\`") &&
  floatingCss.includes('.bubbles::before {') &&
  floatingCss.includes('.bubblesLeft::before {') &&
  floatingCss.includes('filter:blur(14px);') &&
  floatingCss.includes('rgba(36,211,197,0) 100%') &&
  floatingCss.includes('.bubbles .badge {') &&
  floatingChat.includes('onPointerDown={onBubbleDown}'),
  'Unread avatars must sit in one horizontal row, with progressively softer halo and unchanged badges and drag gestures',
);
console.log('PASS: horizontally aligned avatar notifications with fading background glow');

// Half-width overlap on both sides; newer unread messages must always take
// the top z-index and reposition the row without changing its edge anchoring.
const chatNewestFirst = [
  {id:'earlier',peerId:'student-a',lastAt:'2026-11-08T13:00:00Z',unread:1},
  {id:'latest',peerId:'student-b',lastAt:'2026-11-08T14:00:00Z',unread:1},
  {id:'middle',peerId:'student-c',lastAt:'2026-11-08T13:30:00Z',unread:2},
];
assert.deepEqual(chatBubbles(chatNewestFirst).map(t=>t.id),['latest','middle','earlier']);
const withReply = chatNewestFirst.map(t=>t.id==='earlier'
  ? {...t,lastAt:'2026-11-08T15:00:00Z'}:t);
assert.deepEqual(chatBubbles(withReply).map(t=>t.id),['earlier','latest','middle'],
  'The most recent message must move its avatar to the front regardless of previous order');
assert.ok(
  floatingChat.includes('const bubbleStep=29;') &&
  floatingChat.includes('const stackWidth=58+Math.max(0,bubbleList.length-1)*bubbleStep;') &&
  floatingChat.includes('const stackHeight=58;') &&
  floatingChat.includes("bubbleSide.current==='left'") &&
  floatingChat.includes('left:\`\${index*bubbleStep}px\`') &&
  floatingChat.includes('right:\`\${index*bubbleStep}px\`') &&
  floatingChat.includes('zIndex:10-index') &&
  floatingChat.includes('[...bubbleList].reverse().map') &&
  floatingChat.includes('const index = bubbleList.length - 1 - reversedIndex;') &&
  floatingChat.includes('const reposition=()=>{') &&
  floatingChat.includes('if(bubbleDrag.current)return;') &&
  floatingChat.includes('reposition();') &&
  floatingCss.includes('.bubbles:not(.bubblesLeft) .bubble .badge') &&
  floatingCss.includes('left:-8px;') &&
  floatingCss.includes('transition:left .22s ease,right .22s ease,box-shadow .22s ease;') &&
  floatingCss.includes('.bubbles,.bubbles .bubble,.threadSwitchButton .photo {transition:none;}'),
  'Bubbles must be 50%-overlapped, sorted by recency, mirrored on the left/right, with visible badges and reduced-motion support',
);
console.log('PASS: 50% overlapping unread portraits reorder with newest message in front');



// New Messenger-style overlay: selected and recent avatars float outside
// the TOP border from left to right, not inside the message list.
const {chatSessionBubbles}=await import('../src/lib/chat-dock.ts');
const demoChats=[
  {id:'one',peerId:'one',lastAt:'2026-11-08T21:00:00Z',unread:0},
  {id:'new',peerId:'new',lastAt:'2026-11-08T21:14:00Z',unread:3},
  {id:'old',peerId:'old',lastAt:'2026-11-07T18:00:00Z',unread:0},
];
assert.deepEqual(
  chatSessionBubbles(demoChats,['one']).map(t=>t.id),['new','one'],
  'An opened conversation should remain available after backdrop close even if read',
);
assert.deepEqual(
  chatSessionBubbles(demoChats,[]).map(t=>t.id),['new'],
  'A chat closed via X should stop appearing unless a new unread message arrives',
);
assert.deepEqual(
  chatSessionBubbles(demoChats,[],{'new':'2026-11-08T21:14:00Z'}).map(t=>t.id),[],
  'Closing a current unread bubble should not reappear until a newer unread message',
);
assert.deepEqual(
  chatSessionBubbles(demoChats.map(t=>t.id==='new'?{...t,lastAt:'2026-11-08T21:18:00Z'}:t),
    [],{'new':'2026-11-08T21:14:00Z'}).map(t=>t.id),['new'],
  'New unread messages must reappear even if earlier notifications were closed',
);
assert.ok(
  floatingChat.includes('function closeOutside(){') &&
  floatingChat.includes('function minimize(){') &&
  floatingChat.includes('setOpenedIds(previous=>previous.filter(id=>id!==closingId))') &&
  floatingChat.includes('setOpenedIds([]);\n    setDraggingBubble(false);setTrashHot(false);setBubblePosition(null);') &&
  floatingChat.includes('onClick={closeOutside}') &&
  floatingChat.includes('aria-label="Recolher bate-papo e restaurar bolinhas"') &&
  floatingChat.includes('onClick={minimize}') &&
  floatingChat.includes('onKeyDown={event=>{if(event.key===\u0027Escape\u0027)closeOutside();}}') &&
  floatingChat.includes('const bubbleList=chatSessionBubbles(threads,openedIds,hiddenUnread)') &&
  floatingChat.includes('style={{width:stackWidth,height:stackHeight,...(bubblePosition?') &&
  floatingChat.includes('open && switcherThreads.length ? (') &&
  floatingChat.includes('className={styles.floatingThreadTabs}') &&
  floatingChat.includes('draggedTopTab?.id===t.id?styles.floatingThreadTabDragging') &&
  floatingChat.includes('className={styles.activeTabMarker}') &&
  floatingChat.includes('onClick={()=>show(t.id)}') &&
  floatingCss.includes('background:rgba(0,13,27,.70);') &&
  floatingCss.includes('top:-54px;') &&
  floatingCss.includes('justify-content:flex-start;') &&
  floatingCss.includes('.floatingThreadTab[aria-pressed="true"]') &&
  floatingCss.includes('.activeTabMarker {') &&
  floatingCss.includes('padding:7px 10px 8px;') &&
  floatingCss.includes('.dockOpen.dockKeyboard .panel'),
  'Chat must show external left-to-right selection tabs, a 70% backdrop and return avatars to the same position after outside close',
);
console.log('PASS: external chat tabs, active ring, 70% background and avatar restoration');


// S-shaped and circular drags follow the same sampled *curved* route at a
// 29px arc-distance delay, not an X-only rigid group translation.
const {seedBubbleTrail,pointBehindBubbleTrail,appendBubbleTrail} =
  await import('../src/lib/chat-bubble-motion.ts');
assert.deepEqual(
  seedBubbleTrail({x:200,y:120},2,'right'),[
    {x:142,y:120},{x:171,y:120},{x:200,y:120}
  ],
  'Right-anchored stack must pre-seed its follower path toward the left',
);
assert.deepEqual(
  seedBubbleTrail({x:30,y:120},2,'left'),[
    {x:88,y:120},{x:59,y:120},{x:30,y:120}
  ],
  'Left-anchored stack must pre-seed its follower path toward the right',
);
const sCurve=[
  {x:30,y:150},{x:60,y:140},{x:90,y:110},
  {x:120,y:140},{x:150,y:180},{x:180,y:140}
];
const sFollower=pointBehindBubbleTrail(sCurve,29);
assert.ok(sFollower.x<180 && sFollower.y>140,
  'Second bubble must follow the last rising bend rather than move horizontally');
const circle=[
  {x:200,y:120},{x:230,y:130},{x:250,y:160},
  {x:240,y:190},{x:210,y:210},{x:180,y:195},{x:165,y:165}
];
const follower=pointBehindBubbleTrail(circle,55);
assert.ok(follower.x>165 && follower.y>165,
  'An older bubble must be located on the earlier part of a circular path');
const last=circle.at(-1);
assert.deepEqual(pointBehindBubbleTrail(circle,0),last);
const path=seedBubbleTrail({x:50,y:40},2,'left');
const initialLength=path.length;
appendBubbleTrail(path,{x:50,y:40}); // duplicate coordinates do not grow forever
assert.equal(path.length,initialLength);
appendBubbleTrail(path,{x:52,y:42});
assert.equal(path.length,initialLength+1);
for(let i=0;i<100;i++)appendBubbleTrail(path,{x:55+i,y:60},30);
assert.ok(path.length<=30,'Drag route history must have a bounded size');

assert.ok(
  floatingChat.includes('const animateBubbleTrail=()=>{') &&
  floatingChat.includes('appendBubbleTrail(drag.path,target)') &&
  floatingChat.includes('pointBehindBubbleTrail(drag.path,i*bubbleStep)') &&
  floatingChat.includes('Math.max(.16,.43-i*.055)') &&
  floatingChat.includes("window.requestAnimationFrame(animateBubbleTrail)") &&
  floatingChat.includes("avatar.node.style.transform=") &&
  floatingChat.includes("const pendingSnap=useRef<Map<string,BubblePoint>|null>(null)") &&
  floatingChat.includes("useLayoutEffect(()=>{") &&
  floatingChat.includes("const previousLocations=pendingSnap.current") &&
  floatingChat.includes('avatar.node.style.transition=reduced?') &&
  floatingChat.includes("bubbleSide.current=side") &&
  floatingChat.includes('onPointerCancel={onBubbleCancel}') &&
  floatingChat.includes('ref={bubbleGroup}') &&
  floatingChat.includes('ref={node=>{if(node)bubbleNodes.current.set(t.id,node);else bubbleNodes.current.delete(t.id);}}') &&
  floatingCss.includes('.bubblesDragging .bubble {transition:none!important;will-change:transform;}') &&
  floatingCss.includes('.bubblesDragging::before {opacity:0;}') &&
  floatingCss.includes('.bubbles:not(.bubblesLeft) .bubble .badge {') &&
  floatingCss.includes('.bubblesLeft .bubble .badge {') &&
  !floatingCss.includes('.bubble[data-depth]:not([data-depth="0"]) .badge'),
  'Trail animation must follow curved gestures with stagger and ensure EVERY right-edge counter is on the exposed left',
);
console.log('PASS: curved S/circle trailing motion, eased followers and mirrored unread counters');


// Real chat header tabs: only unread or explicitly opened reservations, but
// distinct unread bookings remain independently selectable even when the
// sender has the same profile photo and peer ID.
const {chatSelectableThreads}=await import('../src/lib/chat-dock.ts');
const samePeer=[
  {id:'lesson-a',code:'VNT-01',peerId:'denilson',name:'Denilson',unread:2,lastAt:'2026-11-08T21:30:00Z'},
  {id:'lesson-b',code:'VNT-02',peerId:'denilson',name:'Denilson',unread:1,lastAt:'2026-11-08T21:38:00Z'},
  {id:'old-lesson',code:'VNT-03',peerId:'denilson',name:'Denilson',unread:0,lastAt:'2026-11-01T10:00:00Z'},
  {id:'lesson-c',code:'VNT-04',peerId:'lucia',name:'Lucia',unread:4,lastAt:'2026-11-08T21:40:00Z'},
];
assert.deepEqual(
  chatSelectableThreads(samePeer,'lesson-a',['lesson-a']).map(t=>t.id),
  ['lesson-a','lesson-c','lesson-b'],
  'Selected reservation stays first, other unread reservations are switchable, historical read items stay hidden',
);
assert.deepEqual(
  chatSelectableThreads(samePeer,'lesson-a',['lesson-a'],{'lesson-c':'2026-11-08T21:40:00Z'}).map(t=>t.id),
  ['lesson-a','lesson-b'],
  'Individually discarded top portrait must not return before a new unread message',
);
assert.deepEqual(
  chatSelectableThreads(samePeer,null,[],{
    'lesson-a':'2026-11-08T21:30:00Z',
    'lesson-b':'2026-11-08T21:38:00Z',
    'lesson-c':'2026-11-08T21:40:00Z',
  }),
  [],
  'After selected chat is dismissed, remaining conversation bubbles reflect only undismissed active sessions',
);
assert.ok(
  floatingChat.includes('selectedId?styles.panelSelected') &&
  floatingCss.includes('.dockOpen .panelSelected,') &&
  floatingCss.includes('.studentDock.dockOpen .panelSelected') &&
  floatingCss.includes('border:2px solid #baff08') &&
  floatingChat.includes('onPointerDown={event=>onTopTabDown(event,t.id)}') &&
  floatingChat.includes('onPointerMove={onTopTabMove}') &&
  floatingChat.includes('onPointerUp={onTopTabUp}') &&
  floatingChat.includes('onPointerCancel={onTopTabCancel}') &&
  floatingChat.includes('function dismissTopConversation(id:string)') &&
  floatingChat.includes('setOpenedIds(previous=>previous.filter(threadId=>threadId!==id))') &&
  floatingChat.includes('if(selectedId===id)requestClose(id)') &&
  floatingChat.includes('aria-label={draggedTopTab?') &&
  floatingChat.includes("draggedTopTab?'Solte para fechar esta conversa':") &&
  floatingChat.includes('draggedTopThread ? <Photo thread={draggedTopThread}/> : null') &&
  floatingCss.includes('.floatingTabDragGhost {') &&
  floatingCss.includes('.floatingThreadTabDragging {'),
  'The selected chat gets a lime outline, nonselected photos dismiss one by one, and dragging the selected photo closes only its chat',
);
assert.ok(
  floatingChat.includes('setBubblePosition({') &&
  floatingChat.includes('function closeOutside(){') &&
  floatingChat.includes('if(selectedId===id)requestClose(id)') &&
  !floatingChat.includes('function dismissTopConversation(id:string){\\n    setOpenedIds([])'),
  'Dragging the selected chat to the X must restore the other bubbles to their previous side and height',
);
console.log('PASS: selected chat outline, all active tabs, independent photo dragging and restoring remaining bubbles');


// A selected portrait never jumps to the first tab, even if a newer message
// arrives during a different open chat. New sessions append at the right edge.
const {chatStableTabs}=await import('../src/lib/chat-dock.ts');
const pinned=[
  {id:'first',code:'A',peerId:'p-a',name:'A',lastAt:'2026-11-08T21:01:00Z',unread:1},
  {id:'second',code:'B',peerId:'p-b',name:'B',lastAt:'2026-11-08T21:02:00Z',unread:1},
  {id:'third',code:'C',peerId:'p-c',name:'C',lastAt:'2026-11-08T21:03:00Z',unread:1},
];
const pinnedOrder=['first','second','third'];
assert.deepEqual(chatStableTabs(pinned,'first',pinnedOrder,{},pinnedOrder).map(t=>t.id),pinnedOrder);
assert.deepEqual(chatStableTabs(pinned,'second',pinnedOrder,{},pinnedOrder).map(t=>t.id),pinnedOrder);
assert.deepEqual(chatStableTabs(pinned.map(t=>t.id==='third'
  ? {...t,lastAt:'2026-11-08T23:45:00Z'}:t),
  'third',pinnedOrder,{},pinnedOrder).map(t=>t.id),pinnedOrder,
  'Newest message must NOT reorder portraits while the chat is open');
assert.deepEqual(chatStableTabs([
  ...pinned,{id:'fourth',code:'D',peerId:'p-d',name:'D',
    lastAt:'2026-11-08T23:46:00Z',unread:2}
],'second',pinnedOrder,{},pinnedOrder).map(t=>t.id),[...pinnedOrder,'fourth']);
assert.ok(
  floatingChat.includes('const [tabSequence,setTabSequence] = useState<string[]>([])') &&
  floatingChat.includes('setTabSequence(previous=>previous.includes(id)?previous:[...previous,id])') &&
  floatingChat.includes('const switcherThreads=chatStableTabs(threads,selectedId,openedIds,hiddenUnread,tabSequence)') &&
  floatingChat.includes('data-chat-id={t.id}') &&
  floatingChat.includes('photoStrip.current?.querySelectorAll<HTMLButtonElement>') &&
  floatingChat.includes('pendingClosedTab.current=dismissId'),
  'Open chat portrait order and close-session animation must retain stable photo identities',
);
assert.ok(
  floatingChat.includes('className={styles.borderTraceOverlay}') &&
  floatingChat.includes('className={styles.borderTracePath}') &&
  floatingChat.includes('pathLength={1000}') &&
  floatingChat.includes('M \u0024{cx} \u0024{cy-r}') &&
  floatingChat.includes('A \u0024{r} \u0024{r} 0 0 1') &&
  floatingCss.includes('@keyframes vento-border-trace') &&
  floatingCss.includes('stroke-dasharray:1000;') &&
  floatingCss.includes('stroke-dashoffset:1000;') &&
  floatingCss.includes('animation:vento-border-trace 1150ms') &&
  !floatingCss.includes('transform:translateY(-2px);'),
  'Lime selection border should start above the selected portrait and draw around the panel without shifting photos',
);
assert.ok(
  floatingChat.includes('function requestClose(dismissId:string|null=null)') &&
  floatingChat.includes('const targetX=selected?selected.left+selected.width/2') &&
  floatingChat.includes('pendingSnap.current=from;') &&
  floatingChat.includes('requestClose(selectedId)') &&
  floatingChat.includes('if(selectedId===id)requestClose(id)') &&
  floatingChat.includes('chatCloseTimer.current=window.setTimeout') &&
  floatingChat.includes('avatar.depth*95') &&
  floatingChat.includes('},[bubblePosition,draggingBubble,open]);') &&
  floatingChat.includes('selectedId?styles.panelSelected') &&
  floatingChat.includes('closingChat?styles.panelSucking') &&
  floatingCss.includes('@keyframes vento-chat-suction') &&
  floatingCss.includes('scale(.07)') &&
  floatingCss.includes('transform 490ms cubic-bezier') &&
  floatingCss.includes('@media(prefers-reduced-motion:reduce)'),
  'Closing must visibly suck the window into the selected avatar and send the rest back in a staggered chain',
);
console.log('PASS: stable photo selection, traced green border and chat suction with staggered avatar returns');
