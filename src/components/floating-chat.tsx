'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { chatBookingId, chatBubbles, mergeChatMessages, chatWasRead, presenceLabel, chatThreadTag, type ChatRead, type ChatArea, type ChatMessage, type ChatThread } from '@/lib/chat-dock';
import {CHAT_FILE_TYPES,MAX_CHAT_FILE} from '@/lib/chat-files';
import { initials } from '@/lib/people';
import { Icon } from './icon';
import {ChatMessageExtras} from './chat-message-extras';
import styles from './floating-chat.module.css';

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
  const [open,setOpen] = useState(false);
  const [attachmentsOpen,setAttachmentsOpen] = useState(false);
  const [selectedId,setSelectedId] = useState<string|null>(null);
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
  const launcher = useRef<HTMLButtonElement>(null);
  const follow = useRef(true);
  const historyLoaded = useRef(false);
  const restoreScroll = useRef<{height:number;top:number}|null>(null);
  const marking = useRef(false);
  const selectedRef = useRef<string|null>(null);
  const endpoint = `/${area}/chat-live`;
  const last = messages.at(-1);
  const first = messages[0];
  const thread = detail?.id === selectedId ? detail : threads.find(t=>t.id===selectedId);

  const refreshInbox = useCallback(async (signal?:AbortSignal) => {
    const response = await fetch(endpoint,{cache:'no-store',signal});
    const clear = () => {setThreads([]);setMessages([]);setDrafts({});setDetail(null);setOpen(false);setSelectedId(null);setLocationDraft(null);selectedRef.current=null;};
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
    selectedRef.current=id;
    if (selectedId!==id) {
      setMessages([]);setDetail(null);setHasOlder(false);historyLoaded.current=false;follow.current=true;
      setPeerLastSeen(null);setPeerRead(null);setLocationDraft(null);lastRead.current='';
    }
    setError('');setConnectionError('');setAttachmentsOpen(false);setSelectedId(id);setOpen(true);
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
      if (id) {event.preventDefault();show(id);}
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
    input.current?.focus();
    return ()=>{controller.abort();clearTimeout(timer);};
  },[endpoint,open,selectedId,viewerId]);

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
  function minimize(){setAttachmentsOpen(false);setOpen(false);launcher.current?.focus();}
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
  if (!mounted) return null;
  const unread=threads.reduce((sum,t)=>sum+t.unread,0);
  return createPortal(<>
    {area==='aluno' && open ? <button type="button" className={styles.scrim} onClick={minimize} aria-label="Fechar conversa e voltar ao aplicativo" /> : null}
    <aside className={`${styles.dock} ${area === 'aluno' ? styles.studentDock : ''}`} aria-label="Chat flutuante Vento">
    <span className={styles.sr} aria-live="polite">{unread?`${unread} mensagens não lidas no chat.`:''}</span>
    {open ? <section className={styles.panel} role="dialog" aria-modal="false"
      aria-label={thread?`Conversa com ${thread.name}`:'Minhas conversas'}
      onKeyDown={event=>{if(event.key==='Escape')minimize();}}>
      <header className={styles.head}>
        {selectedId ? <button type="button" onClick={()=>{selectedRef.current=null;setSelectedId(null);setError('');}} aria-label="Todas as conversas"><Icon name="back" /></button> : <Icon name="chat" />}
        {thread ? <Photo thread={thread}/> : null}
        <div><strong>{selectedId?(thread?.name ?? 'Carregando conversa…'):'Minhas conversas'}</strong>
          <small>{selectedId?thread?chatThreadTag(thread):'Reserva':'Mensagens das suas aulas'}</small></div>
        <button type="button" aria-label="Minimizar conversa" onClick={minimize}><Icon name="minus" /></button>
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
          <textarea ref={input} rows={2} maxLength={2000} value={drafts[selectedId] ?? ''}
            aria-label="Sua mensagem no chat flutuante" placeholder="Escreva sua mensagem…"
            onChange={event=>setDrafts(previous=>({...previous,[selectedId]:event.target.value}))}/>
          <div className={styles.attachWrap}>
            <button type="button" className={styles.attachToggle} aria-label="Anexar foto, arquivo ou localização"
              aria-expanded={attachmentsOpen} aria-controls="vento-chat-anexos" disabled={!featuresReady || uploading || sending}
              onClick={()=>setAttachmentsOpen(v=>!v)}>
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
    <div className={styles.bubbles}>
      {chatBubbles(threads).filter(t=>!open || t.id!==selectedId).map(t=><button type="button" key={t.peerId} className={styles.bubble} onClick={()=>show(t.id)} title={`${t.name} · ${t.unread} mensagens não lidas`} aria-label={`Abrir mensagem de ${t.name}`}>
        <Photo thread={t}/><span className={styles.messageIcon}><Icon name="chat"/></span><b className={styles.badge}>{t.unread>99?'99+':t.unread}</b>
      </button>)}
      <button ref={launcher} type="button" className={styles.launcher} aria-label={open?'Minimizar chat':'Abrir minhas conversas'} aria-expanded={open}
        onClick={()=>open?minimize():setOpen(true)}><Icon name={open?'minus':'chat'}/>{unread?<b className={styles.badge}>{unread>99?'99+':unread}</b>:null}</button>
    </div>
  </aside>
  </>,document.body);
}
