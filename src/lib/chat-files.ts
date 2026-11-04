export const CHAT_FILE_TYPES = ['image/jpeg','image/png','image/webp','image/gif','image/heic','image/heif',
  'application/pdf','text/plain','text/csv','application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'] as const;
export const MAX_CHAT_FILE=10*1024*1024;
/** Verify the format before uploading; never execute or extract uploaded files. */
export function chatFileMatches(bytes:Uint8Array,mime:string):boolean {
  const ascii=(start:number,end:number)=>String.fromCharCode(...bytes.slice(start,end));
  if(!bytes.length || bytes.length>MAX_CHAT_FILE)return false;
  switch(mime){
    case 'image/jpeg':return bytes[0]===255 && bytes[1]===216 && bytes[2]===255;
    case 'image/png':return [137,80,78,71,13,10,26,10].every((b,i)=>bytes[i]===b);
    case 'image/webp':return ascii(0,4)==='RIFF' && ascii(8,12)==='WEBP';
    case 'image/gif':return ['GIF87a','GIF89a'].includes(ascii(0,6));
    case 'image/heic':case 'image/heif':return ascii(4,8)==='ftyp' && /^(heic|heix|hevc|hevx|mif1|msf1|heif)$/.test(ascii(8,12));
    case 'application/pdf':return ascii(0,5)==='%PDF-';
    case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
    case 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':return bytes[0]===80 && bytes[1]===75 && bytes[2]===3 && bytes[3]===4;
    case 'text/plain':case 'text/csv':
      try{new TextDecoder('utf-8',{fatal:true}).decode(bytes);return !bytes.includes(0);}catch{return false;}
    default:return false;
  }
}
