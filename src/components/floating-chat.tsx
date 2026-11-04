'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { chatBookingId, chatBubbles, mergeChatMessages, type ChatArea, type ChatMessage, type ChatThread } from '@/lib/chat-dock';
import { initials } from '@/lib/people';
import { Icon } from './icon';
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
  const [selectedId,setSelectedId] = useState<string|null>(null);
  const [detail,setDetail] = useState<ChatThread|null>(null);
  const [messages,setMessages] = useState<ChatMessage[]>([]);
  const [hasOlder,setHasOlder] = useState(false);
  const [loadingOlder,setLoadingOlder] = useState(false);
  const [drafts,setDrafts] = useState<Record<string,string>>({});
  const [sending,setSending] = useState(false);
  const [error,setError] = useState('');
  const [inboxError,setInboxError] = useState('');
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
    const clear = () => {setThreads([]);setMessages([]);setDrafts({});setDetail(null);setOpen(false);setSelectedId(null);selectedRef.current=null;};
    if (response.status===401 || response.status===403 || response.redirected) {
      clear();throw new Error('Entre novamente para abrir as conversas.');
    }
    if (!response.ok) throw new Error('As conversas estão temporariamente indisponíveis.');
    const data = await response.json();
    if(data.viewerId!==viewerId){clear();throw new Error('Sua conta mudou. Atualize a página.');}
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
    }
    setError('');setSelectedId(id);setOpen(true);
  },[selectedId]);

  // Existing "Conversar" links open the dock; modified clicks keep full-page navigation.
  useEffect(()=>{
    const click = (event:MouseEvent) => {
      if (event.defaultPrevented || event.button!==0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      const anchor = event.target instanceof Element ? event.target.closest('a') : null;
      if (!anchor || anchor.target==='_blank' || anchor.hasAttribute('download')) return;
      const url = new URL(anchor.href,window.location.href);
      if (url.origin!==window.location.origin || url.search || url.hash) return;
      const id=chatBookingId(url.pathname,area);
      if (id) {event.preventDefault();show(id);}
    };
    document.addEventListener('click',click);
    return ()=>document.removeEventListener('click',click);
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
            setDetail(data.thread);setMessages(previous=>mergeChatMessages(previous,data.messages));
            if (!historyLoaded.current) setHasOlder(data.hasOlder);
          }
        }
      } catch (cause) {if (!controller.signal.aborted) setError(cause instanceof Error?cause.message:'Não foi possível abrir a conversa.');}
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
    if (!open || !selectedId || !last || !notifications.length || marking.current
      || !follow.current || document.visibilityState!=='visible' || !document.hasFocus()) return;
    marking.current=true;
    void fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json','x-vento-chat':'1'},
      body:JSON.stringify({type:'read',bookingId:selectedId,ids:notifications,through:last.created_at})})
      .then(async response=>{if(response.ok){const data=await response.json();const read=new Set<string>(data.ids);
        if(read.size)setThreads(previous=>previous.map(t=>t.id!==selectedId?t:{...t,
          notificationIds:t.notificationIds.filter(id=>!read.has(id)),unread:Math.max(0,t.unread-read.size)}));}})
      .catch(()=>{}).finally(()=>{marking.current=false;});
  },[endpoint,last,open,selectedId,threads]);

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
      const updated=await fetch(`${endpoint}?bookingId=${id}`,{cache:'no-store'});
      if(updated.ok){const next=await updated.json();if(selectedRef.current===id && next.viewerId===viewerId)setMessages(previous=>mergeChatMessages(previous,next.messages));}
      await refreshInbox();
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
  function minimize(){setOpen(false);launcher.current?.focus();}
  if (!mounted) return null;
  const unread=threads.reduce((sum,t)=>sum+t.unread,0);
  return createPortal(<aside className={styles.dock} aria-label="Chat flutuante Vento">
    <span className={styles.sr} aria-live="polite">{unread?`${unread} mensagens não lidas no chat.`:''}</span>
    {open ? <section className={styles.panel} role="dialog" aria-modal="false"
      aria-label={thread?`Conversa com ${thread.name}`:'Minhas conversas'}
      onKeyDown={event=>{if(event.key==='Escape')minimize();}}>
      <header className={styles.head}>
        {selectedId ? <button type="button" onClick={()=>{selectedRef.current=null;setSelectedId(null);setError('');}} aria-label="Todas as conversas"><Icon name="back" /></button> : <Icon name="chat" />}
        {thread ? <Photo thread={thread}/> : null}
        <div><strong>{selectedId?(thread?.name ?? 'Carregando conversa…'):'Minhas conversas'}</strong>
          <small>{selectedId?`${area==='aluno'?'Instrutor':'Aluno'} · ${thread?.code ?? 'Reserva'}`:'Mensagens das suas aulas'}</small></div>
        <button type="button" aria-label="Minimizar conversa" onClick={minimize}><Icon name="minus" /></button>
      </header>
      {!selectedId ? <div className={styles.list}>
        {inboxError ? <p role="status">{inboxError}</p> : null}
        {!threads.length && !inboxError ? <p>Suas conversas aparecem aqui depois da confirmação de uma aula.</p> : null}
        {threads.map(t=><button type="button" key={t.id} onClick={()=>show(t.id)} className={styles.thread}>
          <Photo thread={t}/><span><strong>{t.name}</strong><small>{t.code}</small><span>{t.preview}</span></span>
          {t.unread?<b className={styles.count}>{t.unread>99?'99+':t.unread}</b>:null}
        </button>)}
      </div> : <>
        <div className={styles.log} ref={box} onScroll={()=>{const el=box.current;if(el)follow.current=el.scrollHeight-el.scrollTop-el.clientHeight<70;}}>
          {hasOlder ? <button type="button" className={styles.older} onClick={older} disabled={loadingOlder}>{loadingOlder?'Carregando…':'Mensagens anteriores'}</button>:null}
          {!messages.length ? <p className={styles.empty}>{detail?'Envie sua primeira mensagem.':'Carregando mensagens…'}</p>:null}
          <ol aria-label="Mensagens da reserva">{messages.map(message=><li key={message.id} className={message.sender_id===viewerId?styles.mine:styles.theirs}>
            <span>{message.body}<time dateTime={message.created_at}>{new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Fortaleza',hour:'2-digit',minute:'2-digit'}).format(new Date(message.created_at))}</time></span>
          </li>)}</ol>
        </div>
        <p className={styles.context}>Conversa da reserva {thread?.code ?? 'selecionada'}. <a href={`/${area}/atendimento/${selectedId}`} target="_blank" rel="noopener noreferrer">Abrir histórico completo</a></p>
        {error?<p className={styles.error} role="alert">{error}</p>:null}
        <form className={styles.compose} onSubmit={send}>
          <textarea ref={input} rows={2} maxLength={2000} value={drafts[selectedId] ?? ''}
            aria-label="Sua mensagem no chat flutuante" placeholder="Escreva sua mensagem…"
            onChange={event=>setDrafts(previous=>({...previous,[selectedId]:event.target.value}))}/>
          <button type="submit" aria-label="Enviar mensagem" disabled={sending || !detail || !(drafts[selectedId] ?? '').trim()}><Icon name={sending?'clock':'arrow'}/></button>
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
  </aside>,document.body);
}
