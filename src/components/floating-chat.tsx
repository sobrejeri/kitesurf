'use client';

import { useCallback, useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import { createPortal } from 'react-dom';
import { chatBookingId, chatBubbles, chatSessionBubbles, chatSwitcherThreads, mergeChatMessages, chatWasRead, presenceLabel, chatThreadTag, type ChatRead, type ChatArea, type ChatMessage, type ChatThread } from '@/lib/chat-dock';
import {CHAT_FILE_TYPES,MAX_CHAT_FILE} from '@/lib/chat-files';
import { initials } from '@/lib/people';
import { Icon } from './icon';
import {ChatMessageExtras} from './chat-message-extras';
import styles from './floating-chat.module.css';

const CHAT_EMOJIS = [
  '😀','😄','😁','😂','🤣','😊','🥰','😍','😘','😎',
  '😉','😢','😭','🥹','🤔','😮','😴','🥳','🤩','😡',
  '👍','👏','🙌','🙏','🤝','👋','❤️','💚','💙','🔥',
  '🎉','✨','🌊','🏄','🪁','☀️','💪','✅','🚀','💯',
] as const;

type BubbleGlowStyle = CSSProperties & {
  '--bubble-ring-alpha': string;
  '--bubble-glow-alpha': string;
  '--bubble-shadow-alpha': string;
};

function Photo({thread}: {thread:ChatThread}) {
  const [failed,setFailed] = useState<string|null>(null);
  return <span className={styles.photo}>
    <span aria-hidden="true">{initials(thread.name)}</span>
    {thread.photoUrl && failed!==thread.photoUrl ? <img src={thread.photoUrl} alt={`Foto de ${thread.name}`}
      onError={()=>setFailed(thread.photoUrl ?? null)} /> : null}
  </span>;
}

export function FloatingChat({area,viewerId}: {area:ChatArea;viewerId:string}) {
  const [mounted,setMounted] = useState(false);
  const [threads,setThreads] = useState<ChatThread[]>([]);
  // Dismissing an avatar hides only the current unread batch. A newer
  // incoming message brings the bubble back without deleting messages.
  const [hiddenUnread,setHiddenUnread] = useState<Record<string,string>>({});
  const [bubblePosition,setBubblePosition] = useState<{x:number;y:number}|null>(null);
  const [draggingBubble,setDraggingBubble] = useState(false);
  const [trashHot,setTrashHot] = useState(false);
  const bubbleDrag = useRef<{id:number;x:number;y:number;left:number;top:number;moved:boolean}|null>(null);
  const suppressBubbleClick = useRef(false);
  const bubbleSide = useRef<'left'|'right'>('right');
  const [open,setOpen] = useState(false);
  const [attachmentsOpen,setAttachmentsOpen] = useState(false);
  const [emojiOpen,setEmojiOpen] = useState(false);
  const [visibleViewport,setVisibleViewport] = useState<{top:number;height:number;keyboard:boolean}|null>(null);
  const [selectedId,setSelectedId] = useState<string|null>(null);
  // Never show the full booking history as a row of repeated contact photos.
  // Only sessions the user opened, or new unread conversations, get a tab.
  const [openedIds,setOpenedIds] = useState<string[]>([]);
  const [detail,setDetail] = useState<ChatThread|null>(null);
  const [messages,setMessages] = useState<ChatMessage[]>([]);
  const [hasOlder,setHasOlder] = useState(false);
  const [loadingOlder,setLoadingOlder] = useState(false);
  const [drafts,setDrafts] = useState<Record<string,string>>({});
  const [sending,setSending] = useState(false);
  const [error,setError] = useState('');
  const [inboxError,setInboxError] = useState('');
  const [connectionError,setConnectionError] = useState('');
  const [featuresReady,setFeaturesReady] = useState(false);
  const [showOnline,setShowOnline] = useState(true);
  const [peerLastSeen,setPeerLastSeen] = useState<string|null>(null);
  const [peerRead,setPeerRead] = useState<ChatRead|null>(null);
  const [locating,setLocating] = useState(false);
  const [locationDraft,setLocationDraft] = useState<{latitude:number;longitude:number;accuracy:number}|null>(null);
  const [uploading,setUploading] = useState(false);
  const photoInput=useRef<HTMLInputElement>(null);
  const fileInput=useRef<HTMLInputElement>(null);
  const lastRead=useRef('');
  const visibilityBusy=useRef(false);
  const box = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const viewportRaf = useRef<number|null>(null);
  const follow = useRef(true);
  const historyLoaded = useRef(false);
  const restoreScroll = useRef<{height:number;top:number}|null>(null);
  const marking = useRef(false);
  const selectedRef = useRef<string|null>(null);
  const endpoint = `/${area}/chat-live`;
  const visibleUnread=threads.filter(t=>t.unread>0 && hiddenUnread[t.id]!==t.lastAt);
  const bubbleList=chatSessionBubbles(threads,openedIds,hiddenUnread);
  const switcherThreads=chatSwitcherThreads(threads,selectedId,openedIds,hiddenUnread);
  // Latest unread conversation (index zero) is always the topmost avatar.
  // Each older conversation remains half-visible behind it, extending
  // inward from the chosen screen edge (right -> left, left -> right).
  const bubbleStep=29;
  const stackWidth=58+Math.max(0,bubbleList.length-1)*bubbleStep;
  const stackHeight=58;
  const extraUnreadThreads=Math.max(0,threads.filter(t=>
    openedIds.includes(t.id) || (t.unread>0 && hiddenUnread[t.id]!==t.lastAt)
  ).length-bubbleList.length);
  const last = messages.at(-1);
  const first = messages[0];
  const thread = detail?.id === selectedId ? detail : threads.find(t=>t.id===selectedId);

  const refreshInbox = useCallback(async (signal?:AbortSignal) => {
    const response = await fetch(endpoint,{cache:'no-store',signal});
    const clear = () => {setThreads([]);setMessages([]);setDrafts({});setDetail(null);setOpen(false);setSelectedId(null);setOpenedIds([]);setHiddenUnread({});setLocationDraft(null);selectedRef.current=null;};
    if (response.status===401 || response.status===403 || response.redirected) {
      clear();throw new Error('Entre novamente para abrir as conversas.');
    }
    if (!response.ok) throw new Error('As conversas estão temporariamente indisponíveis.');
    const data = await response.json();
    if(data.viewerId!==viewerId){clear();throw new Error('Sua conta mudou. Atualize a página.');}
    setFeaturesReady(data.featuresReady);if(!visibilityBusy.current)setShowOnline(data.showOnline);
    setThreads(data.threads);setInboxError('');
  },[endpoint,viewerId]);

  useEffect(()=>{
    setMounted(true);
    const controller = new AbortController();let timer:ReturnType<typeof setTimeout>;
    let busy=false;
    const update = async () => {
      if (busy || controller.signal.aborted) return;
      busy=true;
      try { if (document.visibilityState==='visible') await refreshInbox(controller.signal); }
      catch { if (!controller.signal.aborted) setInboxError('Não foi possível atualizar as conversas. Vamos tentar novamente.'); }
      finally { busy=false; }
    };
    const poll = async () => { await update();if (!controller.signal.aborted) timer=setTimeout(poll,3000); };
    void poll();
    window.addEventListener('focus',update);document.addEventListener('visibilitychange',update);
    return ()=>{controller.abort();clearTimeout(timer);window.removeEventListener('focus',update);document.removeEventListener('visibilitychange',update);};
  },[refreshInbox]);

  const show = useCallback((id:string) => {
    // A conversation enters the photo switcher only once it was opened.
    setOpenedIds(previous=>previous.includes(id)?previous:[...previous,id]);
    selectedRef.current=id;
    if (selectedId!==id) {
      setMessages([]);setDetail(null);setHasOlder(false);historyLoaded.current=false;follow.current=true;
      setPeerLastSeen(null);setPeerRead(null);setLocationDraft(null);lastRead.current='';
    }
    setError('');setConnectionError('');setAttachmentsOpen(false);setEmojiOpen(false);setSelectedId(id);setOpen(true);
  },[selectedId]);

  // Existing "Conversar" links open the dock; modified clicks keep full-page navigation.
  useEffect(()=>{
    const click = (event:MouseEvent) => {
      if (event.defaultPrevented || event.button!==0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      const anchor = event.target instanceof Element ? event.target.closest('a') : null;
      if (!anchor || anchor.target==='_blank' || anchor.hasAttribute('download') || anchor.dataset.chatNavigation==='page') return;
      const url = new URL(anchor.href,window.location.href);
      if (url.origin!==window.location.origin || url.search || url.hash) return;
      const id=chatBookingId(url.pathname,area);
      if (id) {event.preventDefault();show(id);return;}
      // Menu > Conversas opens the same floating inbox without creating a
      // permanent launcher. Modified clicks can still open the full page.
      if (url.pathname.replace(/\/$/, '') === `/${area}/atendimento`) {
        event.preventDefault();
        selectedRef.current=null;
        setSelectedId(null);
        setOpen(true);
      }
    };
    // Capture before Next Link handles the click at the React root.
    document.addEventListener('click',click,true);
    return ()=>document.removeEventListener('click',click,true);
  },[area,show]);

  useEffect(()=>{
    if (!open || !selectedId) return;
    const controller = new AbortController();let timer:ReturnType<typeof setTimeout>;
    const update = async () => {
      try {
        if (document.visibilityState==='visible') {
          const response=await fetch(`${endpoint}?bookingId=${selectedId}`,{cache:'no-store',signal:controller.signal});
          const data=await response.json();
          if (!response.ok) throw new Error(data.error);
          if (!controller.signal.aborted && data.viewerId===viewerId) {
            setConnectionError('');setDetail(data.thread);setMessages(previous=>mergeChatMessages(previous,data.messages));
            setFeaturesReady(data.featuresReady);setPeerLastSeen(data.peerLastSeen);setPeerRead(data.peerRead);
            if (!historyLoaded.current) setHasOlder(data.hasOlder);
          }
        }
      } catch (cause) {if (!controller.signal.aborted) setConnectionError(cause instanceof Error?cause.message:'Não foi possível abrir a conversa.');}
      finally {if (!controller.signal.aborted) timer=setTimeout(update,3000);}
    };
    void update();
    // On iPhone, focusing on open summons the keyboard and scrolls the
    // fixed window under the status bar before it can measure VisualViewport.
    // The user decides when to focus the composer.
    if (window.innerWidth >= 768) input.current?.focus();
    return ()=>{controller.abort();clearTimeout(timer);};
  },[endpoint,open,selectedId,viewerId]);

  // iOS WebKit keeps fixed portals relative to the layout viewport while
  // the keyboard shrinks/pans its *visual* viewport. Follow both resize and
  // scroll; this keeps the header visible and the composer above the keyboard.
  useEffect(()=>{
    if(!open)return;
    const vv=window.visualViewport;
    if(!vv)return;
    const sync=()=>{
      if(window.innerWidth>=768)return;
      const top=Math.max(0,vv.offsetTop);
      const height=Math.max(230,vv.height);
      const keyboard=window.innerHeight-(vv.height+vv.offsetTop)>110;
      setVisibleViewport(previous=>
        previous && Math.abs(previous.top-top)<1 && Math.abs(previous.height-height)<1 &&
        previous.keyboard===keyboard ? previous : {top,height,keyboard});
    };
    const schedule=()=>{
      if(viewportRaf.current!==null)window.cancelAnimationFrame(viewportRaf.current);
      viewportRaf.current=window.requestAnimationFrame(()=>{
        viewportRaf.current=null;
        sync();
      });
    };
    sync();
    vv.addEventListener('resize',schedule);
    vv.addEventListener('scroll',schedule);
    window.addEventListener('resize',schedule);
    window.addEventListener('orientationchange',schedule);
    return ()=>{
      vv.removeEventListener('resize',schedule);
      vv.removeEventListener('scroll',schedule);
      window.removeEventListener('resize',schedule);
      window.removeEventListener('orientationchange',schedule);
      if(viewportRaf.current!==null)window.cancelAnimationFrame(viewportRaf.current);
      viewportRaf.current=null;
    };
  },[open]);

  useEffect(()=>{
    const el=box.current;
    if (!el) return;
    if (restoreScroll.current) {
      el.scrollTop=el.scrollHeight-restoreScroll.current.height+restoreScroll.current.top;
      restoreScroll.current=null;
    } else if (follow.current) el.scrollTop=el.scrollHeight;
  },[first?.id,last?.id,open,selectedId]);

  useEffect(()=>{
    const notifications=threads.find(t=>t.id===selectedId)?.notificationIds.slice(0,100) ?? [];
    const readKey=`${selectedId}:${last?.id}:${featuresReady}`;
    if (!open || !selectedId || !last || (!notifications.length && lastRead.current===readKey) || marking.current
      || !follow.current || document.visibilityState!=='visible' || !document.hasFocus()) return;
    const el=box.current;
    if(!el || el.scrollHeight-el.scrollTop-el.clientHeight>=70)return;
    marking.current=true;
    void fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json','x-vento-chat':'1'},
      body:JSON.stringify({type:'read',bookingId:selectedId,ids:notifications,through:last.created_at,lastMessageId:last.id})})
      .then(async response=>{if(response.ok){const data=await response.json();const read=new Set<string>(data.ids);
        lastRead.current=readKey;
        if(read.size)setThreads(previous=>previous.map(t=>t.id!==selectedId?t:{...t,
          notificationIds:t.notificationIds.filter(id=>!read.has(id)),unread:Math.max(0,t.unread-read.size)}));}})
      .catch(()=>{}).finally(()=>{marking.current=false;});
  },[endpoint,last,open,selectedId,threads,featuresReady]);

  function insertEmoji(emoji:string){
    if(!selectedId)return;
    const textarea=input.current;
    const current=drafts[selectedId]??'';
    const start=textarea?.selectionStart??current.length;
    const end=textarea?.selectionEnd??start;
    const next=current.slice(0,start)+emoji+current.slice(end);
    if(next.length>2000)return;
    const caret=start+emoji.length;
    setDrafts(previous=>({...previous,[selectedId]:next}));
    setEmojiOpen(false);
    window.requestAnimationFrame(()=>{
      textarea?.focus({preventScroll:true});
      textarea?.setSelectionRange(caret,caret);
    });
  }

  async function send(event:React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();if (!selectedId || sending) return;
    const id=selectedId;const original=drafts[id] ?? '';const body=original.trim();
    if (!body) return;
    setSending(true);setError('');
    try {
      const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json','x-vento-chat':'1'},
        body:JSON.stringify({type:'send',bookingId:id,body})});
      const data=await response.json();if(!response.ok)throw new Error(data.error);
      setDrafts(previous=>({...previous,[id]:previous[id]===original?'':(previous[id] ?? '')}));
      follow.current=true;
      // Delivery was confirmed above. A refresh failure must not report a
      // failed send or encourage the user to send the same message twice.
      try {
        const updated=await fetch(`${endpoint}?bookingId=${id}`,{cache:'no-store'});
        if(updated.ok){const next=await updated.json();if(selectedRef.current===id && next.viewerId===viewerId)setMessages(previous=>mergeChatMessages(previous,next.messages));}
        await refreshInbox();
      } catch { /* The active conversation retries automatically. */ }
    } catch(cause){if(selectedRef.current===id)setError(cause instanceof Error?cause.message:'Não foi possível enviar. Sua mensagem foi preservada.');}
    finally{setSending(false);input.current?.focus();}
  }
  async function older() {
    if (!first || !selectedId || loadingOlder) return;
    const id=selectedId;setLoadingOlder(true);
    try {
      const response=await fetch(`${endpoint}?bookingId=${id}&before=${encodeURIComponent(first.created_at)}&messageId=${first.id}`,{cache:'no-store'});
      const data=await response.json();if(!response.ok)throw new Error(data.error);
      if(selectedRef.current!==id || data.viewerId!==viewerId)return;
      if(box.current)restoreScroll.current={height:box.current.scrollHeight,top:box.current.scrollTop};
      historyLoaded.current=true;follow.current=false;
      setMessages(previous=>mergeChatMessages(data.messages,previous));setHasOlder(data.hasOlder);
    }catch{setError('Não foi possível carregar as mensagens anteriores.');}
    finally{setLoadingOlder(false);}
  }
  function closeOutside(){
    // A backdrop tap only collapses the window. Leave the opened session
    // list and bubblePosition intact so avatars return to the same edge/height.
    selectedRef.current=null;
    setSelectedId(null);
    setAttachmentsOpen(false);
    setEmojiOpen(false);
    setOpen(false);
  }
  function minimize(){
    // X closes only this conversation session. Other opened/unread chats
    // remain available, and no server-side messages are deleted or marked.
    if(selectedId){
      const current=threads.find(t=>t.id===selectedId);
      if(current) setHiddenUnread(previous=>({...previous,[current.id]:current.lastAt}));
      setOpenedIds(previous=>previous.filter(id=>id!==selectedId));
    }
    closeOutside();
  }
  async function visibility(visible:boolean){
    if(visibilityBusy.current)return;visibilityBusy.current=true;setShowOnline(visible);
    try{const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json','x-vento-chat':'1'},body:JSON.stringify({type:'visibility',visible})});
      if(!response.ok)throw new Error();
    }catch{setShowOnline(!visible);setInboxError('Não foi possível alterar seu status.');}
    finally{visibilityBusy.current=false;}
  }
  async function upload(file:File|undefined){
    if(!file || !selectedId || sending || uploading)return;
    if(!file.size || file.size>MAX_CHAT_FILE){setError('Escolha um arquivo de até 10 MB.');return;}
    const id=selectedId;setUploading(true);setError('');
    const form=new FormData();form.set('bookingId',id);form.set('file',file);
    try{const response=await fetch(endpoint,{method:'POST',headers:{'x-vento-chat':'1'},body:form});
      const data=await response.json();if(!response.ok)throw new Error(data.error);
      follow.current=true;try{await refreshInbox();}catch{setInboxError('Mensagem enviada. A lista será atualizada automaticamente.');}
    }catch(cause){if(selectedRef.current===id)setError(cause instanceof Error?cause.message:'Não foi possível enviar o arquivo.');}
    finally{setUploading(false);}
  }
  function locate(){
    if(!selectedId || locating)return;
    if(!navigator.geolocation){setError('Localização indisponível neste navegador.');return;}
    const id=selectedId;setLocating(true);setError('');
    navigator.geolocation.getCurrentPosition(position=>{
      if(selectedRef.current===id)setLocationDraft({latitude:position.coords.latitude,longitude:position.coords.longitude,accuracy:position.coords.accuracy});
      setLocating(false);
    },()=>{setLocating(false);setError('Não foi possível obter a localização. Verifique a permissão do aparelho.');},
    {enableHighAccuracy:true,timeout:10000,maximumAge:0});
  }
  async function shareLocation(){
    if(!selectedId || !locationDraft || sending)return;
    const id=selectedId;setSending(true);setError('');
    try{const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json','x-vento-chat':'1'},
      body:JSON.stringify({type:'location',bookingId:id,latitude:locationDraft.latitude,longitude:locationDraft.longitude})});
      const data=await response.json();if(!response.ok)throw new Error(data.error);
      setLocationDraft(null);follow.current=true;try{await refreshInbox();}catch{setInboxError('Mensagem enviada. A lista será atualizada automaticamente.');}
    }catch(cause){if(selectedRef.current===id)setError(cause instanceof Error?cause.message:'Não foi possível compartilhar a localização.');}
    finally{setSending(false);}
  }
  const dismissAllBubbles=useCallback(()=>{
    setHiddenUnread(previous=>{
      const next={...previous};
      for(const t of threads) if(t.unread>0) next[t.id]=t.lastAt;
      return next;
    });
    setDraggingBubble(false);setTrashHot(false);setBubblePosition(null);
  },[threads]);

  const onBubbleDown=(event:ReactPointerEvent<HTMLDivElement>)=>{
    if(event.button!==0 || bubbleDrag.current || !bubbleList.length)return;
    const box=event.currentTarget.getBoundingClientRect();
    bubbleDrag.current={id:event.pointerId,x:event.clientX,y:event.clientY,left:box.left,top:box.top,moved:false};
  };
  const onBubbleMove=(event:ReactPointerEvent<HTMLDivElement>)=>{
    const drag=bubbleDrag.current;
    if(!drag || drag.id!==event.pointerId)return;
    const dx=event.clientX-drag.x,dy=event.clientY-drag.y;
    if(!drag.moved && Math.hypot(dx,dy)<7)return;
    if(!drag.moved) event.currentTarget.setPointerCapture(event.pointerId);
    drag.moved=true;
    setDraggingBubble(true);
    const width=window.innerWidth,height=window.innerHeight;
    setBubblePosition({
      x:Math.max(8,Math.min(width-stackWidth-8,drag.left+dx)),
      y:Math.max(65,Math.min(height-stackHeight-30,drag.top+dy))
    });
    const targetY=height-(area==='aluno'?128:110);
    setTrashHot(Math.abs(event.clientX-width/2)<73 && Math.abs(event.clientY-targetY)<73);
  };
  const onBubbleUp=(event:ReactPointerEvent<HTMLDivElement>)=>{
    const drag=bubbleDrag.current;
    if(!drag || drag.id!==event.pointerId)return;
    bubbleDrag.current=null;
    if(event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
    setDraggingBubble(false);
    setTrashHot(false);
    if(!drag.moved)return;
    suppressBubbleClick.current=true;
    window.setTimeout(()=>{suppressBubbleClick.current=false;},100);
    const width=window.innerWidth,height=window.innerHeight;
    const targetY=height-(area==='aluno'?128:110);
    if(Math.abs(event.clientX-width/2)<73 && Math.abs(event.clientY-targetY)<73){
      dismissAllBubbles();return;
    }
    const dx=event.clientX-drag.x,dy=event.clientY-drag.y;
    const x=Math.max(8,Math.min(width-stackWidth-8,drag.left+dx));
    const side=x+stackWidth/2<width/2?'left':'right';
    bubbleSide.current=side;
    setBubblePosition({
      x:side==='left'?12:Math.max(12,width-stackWidth-12),
      y:Math.max(65,Math.min(height-stackHeight-95,drag.top+dy))
    });
  };
  useEffect(()=>{
    const reposition=()=>{
      // When a new message changes the stack width, keep its leading avatar
      // snapped to the SAME edge and vertical position without drifting.
      if(bubbleDrag.current)return;
      setBubblePosition(previous=>{
        if(!previous)return null;
        const x=bubbleSide.current==='left'?12:Math.max(12,window.innerWidth-stackWidth-12);
        const y=Math.max(65,Math.min(window.innerHeight-stackHeight-95,previous.y));
        return previous.x===x&&previous.y===y?previous:{x,y};
      });
    };
    reposition();
    window.addEventListener('resize',reposition);
    return ()=>window.removeEventListener('resize',reposition);
  },[stackWidth,stackHeight]);

  if (!mounted) return null;
  const unread=threads.reduce((sum,t)=>sum+t.unread,0);
  return createPortal(<>
    {open ? <button type="button" className={styles.scrim} onClick={closeOutside} aria-label="Recolher bate-papo e restaurar bolinhas" /> : null}
    <aside
      className={`${styles.dock} ${area === 'aluno' ? styles.studentDock : ''} ${open?styles.dockOpen:''} ${open&&visibleViewport?.keyboard?styles.dockKeyboard:''}`}
      style={open&&visibleViewport ? ({
        '--chat-vv-top':`${visibleViewport.top}px`,
        '--chat-vv-height':`${visibleViewport.height}px`
      } as CSSProperties) : undefined}
      aria-label="Chat flutuante Vento">
    <span className={styles.sr} aria-live="polite">{unread?`${unread} mensagens não lidas no chat.`:''}</span>
    {open && switcherThreads.length ? (
      <nav className={styles.floatingThreadTabs} aria-label="Conversas novas ou abertas">
        {switcherThreads.map(t => {
          const selected = selectedId === t.id;
          return <button type="button" key={t.id}
            className={styles.floatingThreadTab}
            aria-label={`Abrir conversa com ${t.name}, reserva ${t.code}`}
            aria-pressed={selected}
            title={chatThreadTag(t)}
            onClick={()=>show(t.id)}>
            <Photo thread={t}/>
            {selected ? <span className={styles.activeTabMarker} aria-hidden="true"/> : null}
            {!selected && t.unread>0 && hiddenUnread[t.id]!==t.lastAt
              ? <b className={styles.badge}>{t.unread>99?'99+':t.unread}</b>
              : null}
          </button>;
        })}
      </nav>
    ) : null}
    {open ? <section className={styles.panel} role="dialog" aria-modal="false"
      aria-label={thread?`Conversa com ${thread.name}`:'Minhas conversas'}
      onKeyDown={event=>{if(event.key==='Escape')closeOutside();}}>
      <header className={styles.head}>
        {selectedId ? <button type="button" onClick={()=>{selectedRef.current=null;setSelectedId(null);setError('');}} aria-label="Todas as conversas"><Icon name="back" /></button> : <Icon name="chat" />}
        {thread ? <Photo thread={thread}/> : null}
        <div><strong>{selectedId?(thread?.name ?? 'Carregando conversa…'):'Minhas conversas'}</strong>
          <small>{selectedId?thread?chatThreadTag(thread):'Reserva':'Mensagens das suas aulas'}</small></div>
        <button type="button" aria-label="Fechar conversa" title="Fechar conversa" onClick={minimize}><Icon name="close" /></button>
      </header>

      {!selectedId ? <div className={styles.list}>
        <label className={styles.visibility}><input type="checkbox" checked={showOnline} disabled={!featuresReady} onChange={event=>visibility(event.target.checked)}/> Mostrar quando estou online</label>
        {!featuresReady?<p>Os novos recursos de presença, arquivos e localização aguardam ativação.</p>:null}
        {inboxError ? <p role="status">{inboxError}</p> : null}
        {!threads.length && !inboxError ? <p>Suas conversas aparecem aqui depois da confirmação de uma aula.</p> : null}
        {threads.map(t=><button type="button" key={t.id} onClick={()=>show(t.id)} className={styles.thread}>
          <Photo thread={t}/><span><strong>{t.name}</strong><small>{chatThreadTag(t)}</small><span>{t.preview}</span></span>
          {t.unread?<b className={styles.count}>{t.unread>99?'99+':t.unread}</b>:null}
        </button>)}
      </div> : <>
        {featuresReady?<p className={`${styles.presence} ${presenceLabel(peerLastSeen)==='Online'?styles.online:''}`}>{presenceLabel(peerLastSeen)}</p>:null}
        <div className={styles.log} ref={box} onScroll={()=>{const el=box.current;if(el)follow.current=el.scrollHeight-el.scrollTop-el.clientHeight<70;}}>
          {hasOlder ? <button type="button" className={styles.older} onClick={older} disabled={loadingOlder}>{loadingOlder?'Carregando…':'Mensagens anteriores'}</button>:null}
          {!messages.length ? <p className={styles.empty}>{detail?'Envie sua primeira mensagem.':'Carregando mensagens…'}</p>:null}
          <ol aria-label="Mensagens da reserva">{messages.map(message=><li key={message.id} className={message.sender_id===viewerId?styles.mine:styles.theirs}>
            <span>{message.body}<ChatMessageExtras message={message}/><time dateTime={message.created_at}>{new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Fortaleza',hour:'2-digit',minute:'2-digit'}).format(new Date(message.created_at))}
              {message.sender_id===viewerId?` · ${chatWasRead(message,peerRead)?'Visualizada':'Enviada'}`:''}</time></span>
          </li>)}</ol>
        </div>
        <p className={styles.context}>{thread?chatThreadTag(thread):'Conversa da reserva selecionada'}. <a href={`/${area}/atendimento/${selectedId}`} target="_blank" rel="noopener noreferrer">Abrir histórico completo</a></p>
        {connectionError?<p className={styles.error} role="status">{connectionError}</p>:null}
        {error?<p className={styles.error} role="alert">{error}</p>:null}
        <input ref={photoInput} type="file" accept="image/jpeg,image/png,image/webp,image/gif,image/heic,image/heif" hidden onChange={event=>{void upload(event.target.files?.[0]);event.target.value='';setAttachmentsOpen(false);}}/>
        <input ref={fileInput} type="file" accept={CHAT_FILE_TYPES.join(',')} hidden onChange={event=>{void upload(event.target.files?.[0]);event.target.value='';setAttachmentsOpen(false);}}/>
        {locationDraft?<div className={styles.locationConfirm}>
          <p>Compartilhar sua localização atual com {thread?.name}? Precisão aproximada: {Math.round(locationDraft.accuracy)} m.</p>
          <button type="button" disabled={sending} onClick={shareLocation}>Enviar localização</button>
          <button type="button" onClick={()=>setLocationDraft(null)}>Cancelar</button>
        </div>:null}
        <form className={styles.compose} onSubmit={send}>
          {emojiOpen ? (
            <div id="vento-chat-emojis" className={styles.emojiPopover} role="group" aria-label="Escolha um emoji">
              {CHAT_EMOJIS.map(emoji=>(
                <button type="button" key={emoji} className={styles.emojiChoice}
                  aria-label={`Inserir emoji ${emoji}`}
                  onClick={()=>insertEmoji(emoji)}>{emoji}</button>
              ))}
            </div>
          ) : null}
          <button type="button" className={styles.emojiToggle}
            aria-label={emojiOpen?'Fechar opções de emoji':'Escolher emoji'}
            aria-expanded={emojiOpen} aria-controls="vento-chat-emojis"
            onClick={()=>{setAttachmentsOpen(false);setEmojiOpen(value=>!value);}}>
            <span aria-hidden="true">😊</span>
          </button>
          <textarea ref={input} rows={2} maxLength={2000} value={drafts[selectedId] ?? ''}
            aria-label="Sua mensagem no chat flutuante" placeholder="Escreva sua mensagem…"
            onChange={event=>setDrafts(previous=>({...previous,[selectedId]:event.target.value}))}/>
          <div className={styles.attachWrap}>
            <button type="button" className={styles.attachToggle} aria-label="Anexar foto, arquivo ou localização"
              aria-expanded={attachmentsOpen} aria-controls="vento-chat-anexos" disabled={!featuresReady || uploading || sending}
              onClick={()=>{setEmojiOpen(false);setAttachmentsOpen(v=>!v);}}>
              <Icon name={attachmentsOpen?'minus':'plus'}/>
            </button>
            {attachmentsOpen ? <div id="vento-chat-anexos" className={styles.attachPopover} role="group" aria-label="Opções de anexo">
              <button type="button" disabled={!featuresReady || uploading || sending} onClick={()=>photoInput.current?.click()}><Icon name="image" />Foto</button>
              <button type="button" disabled={!featuresReady || uploading || sending} onClick={()=>fileInput.current?.click()}><Icon name="file" />Arquivo</button>
              <button type="button" disabled={!featuresReady || uploading || sending || locating} onClick={()=>{setAttachmentsOpen(false);locate();}}><Icon name="pin" />{locating?'Localizando…':'Localização'}</button>
            </div>:null}
          </div>
          <button type="submit" aria-label="Enviar mensagem" disabled={sending || uploading || !detail || !(drafts[selectedId] ?? '').trim()}><Icon name={sending?'clock':'arrow'}/></button>
        </form>
      </>}
    </section>:null}
    {!open && bubbleList.length ? (
      <div className={`${styles.bubbles} ${bubbleSide.current==='left'?styles.bubblesLeft:''} ${draggingBubble?styles.bubblesDragging:''}`} role="group"
        aria-label="Conversas com mensagens não lidas. Arraste para uma lateral ou até o X para ocultar."
        style={{width:stackWidth,height:stackHeight,...(bubblePosition?{left:bubblePosition.x,top:bubblePosition.y,right:'auto',bottom:'auto'}:{})}}
        onPointerDown={onBubbleDown} onPointerMove={onBubbleMove} onPointerUp={onBubbleUp}
        onPointerCancel={()=>{bubbleDrag.current=null;setDraggingBubble(false);setTrashHot(false);setBubblePosition(null);}}>
        {[...bubbleList].reverse().map((t, reversedIndex) => {
          const index = bubbleList.length - 1 - reversedIndex;
          return (
            <button type="button" key={t.id} className={styles.bubble}
              data-depth={index}
              style={{
                ...(bubbleSide.current==='left'
                  ? {left:`${index*bubbleStep}px`}
                  : {right:`${index*bubbleStep}px`}),
                bottom:0,
                zIndex:10-index,
                '--bubble-ring-alpha':Math.max(.02,.10-index*.02).toFixed(2),
                '--bubble-glow-alpha':Math.max(.05,.25-index*.05).toFixed(2),
                '--bubble-shadow-alpha':Math.max(.28,.65-index*.09).toFixed(2)
              } as BubbleGlowStyle}
              onClick={()=>{if(suppressBubbleClick.current)return;show(t.id);}}
              title={`${t.name} · ${t.unread} mensagens não lidas · ${chatThreadTag(t)}`}
              aria-label={`Abrir conversa com ${t.name}, ${t.unread} mensagens não lidas`}>
              <Photo thread={t}/>
              {t.unread>0 && hiddenUnread[t.id]!==t.lastAt
                ? <b className={styles.badge}>{t.unread>99?'99+':t.unread}</b>
                : null}
            </button>
          );
        })}
        {extraUnreadThreads > 0 ? (
          <button type="button" className={styles.moreUnread}
            onClick={()=>{if(suppressBubbleClick.current)return;selectedRef.current=null;setSelectedId(null);setOpen(true);}}
            aria-label={`Abrir mais ${extraUnreadThreads} conversas disponíveis`}>+${extraUnreadThreads}</button>
        ) : null}
      </div>
    ) : null}
  </aside>
  {draggingBubble ? (
    <div className={`${styles.trashTarget} ${trashHot?styles.trashTargetHot:''} ${area==='aluno'?styles.trashStudent:''}`}
      role="status" aria-label="Solte aqui para fechar todas as bolinhas de conversa">
      <Icon name="close" /><span>Solte para fechar todas</span>
    </div>
  ) : null}
  </>,document.body);
}
