import type {ChatMessage} from '@/lib/chat-dock';
export function ChatMessageExtras({message}:{message:ChatMessage}){
  const file=message.attachment;const location=message.location;
  return <>
    {file?<a href={file.url} target="_blank" rel="noopener noreferrer" style={{display:'block',marginTop:8,color:'inherit'}}>
      {file.imageUrl?<img src={file.imageUrl} alt={file.name} loading="lazy" style={{display:'block',maxWidth:'100%',maxHeight:220,objectFit:'contain',borderRadius:10,marginBottom:6}}/>:null}
      <span style={{fontSize:12,textDecoration:'underline'}}>Baixar {file.name} · {Math.max(1,Math.round(file.bytes/1024))} KB</span>
    </a>:null}
    {location?<a href={`https://maps.google.com/?q=${location.latitude},${location.longitude}`} target="_blank" rel="noopener noreferrer"
      style={{display:'block',marginTop:8,padding:10,borderRadius:10,border:'1px solid currentColor',color:'inherit',fontSize:12}}>
      📍 Abrir localização no mapa
    </a>:null}
  </>;
}
