export const PROFILE_REQUIRED = [
  {key:'fullName',label:'Nome completo',group:'Pessoal',anchor:'#cadastro-pessoais'},
  {key:'phone',label:'Telefone / WhatsApp',group:'Pessoal',anchor:'#cadastro-pessoais'},
  {key:'city',label:'Cidade de residência',group:'Pessoal',anchor:'#cadastro-pessoais'},
  {key:'bio',label:'Apresentação profissional',group:'Pessoal',anchor:'#cadastro-pessoais'},
  {key:'beaches',label:'Praias de atendimento',group:'Atendimento',anchor:'#cadastro-atendimento'},
  {key:'languages',label:'Idiomas das aulas',group:'Atendimento',anchor:'#cadastro-atendimento'},
] as const;
/** Required once the database has migration 47; not listed before it. */
export const PROFILE_TAX_ID = {key:'taxId',label:'CPF ou CNPJ',group:'Documento',anchor:'#cadastro-documento'} as const;
export const PROFILE_RECOMMENDED = [
  {key:'photo',label:'Foto de perfil',anchor:'#cadastro-foto'},
  {key:'payout',label:'Dados de recebimento',anchor:'#cadastro-recebimento'},
] as const;

export type ProgressFlags = {
  fullName:boolean;
  photo:boolean;
  phone:boolean;
  city:boolean;
  bio:boolean;
  beaches:boolean;
  languages:boolean;
  experience:boolean;
  equipment:boolean;
  supportVehicle:boolean;
  payout:boolean;
  /** Absent while the database does not track it yet (before migration 47). */
  taxId?:boolean;
};
export type DocumentRecord = {
  kind:string;
  status:'pending'|'approved'|'rejected';
};
export type DocumentState = 'approved'|'pending'|'rejected'|'missing'|'unavailable';
export type ProfileField = {
  key:string;
  label:string;
  group:string;
  anchor:string;
  state:'done'|'missing'|'unavailable';
};

export function readProgressFlags(raw:unknown):ProgressFlags|null {
  if(!raw || typeof raw!=='object' || Array.isArray(raw))return null;
  const source=raw as Record<string,unknown>;
  const keys:readonly (keyof ProgressFlags)[]=[
    'fullName','photo','phone','city','bio','beaches','languages',
    'experience','equipment','supportVehicle','payout',
  ];
  if(!keys.every(k=>typeof source[k]==='boolean'))return null;
  const flags={} as ProgressFlags;
  for(const key of keys)flags[key]=source[key] as boolean;
  if(typeof source.taxId==='boolean')flags.taxId=source.taxId;
  return flags;
}

function documentState(documents:DocumentRecord[]|null,kind:string):DocumentState {
  if(documents===null)return 'unavailable';
  const found=documents.filter(d=>d.kind===kind);
  // The database requires at least one approved document for each kind.
  if(found.some(d=>d.status==='approved'))return 'approved';
  if(found.some(d=>d.status==='pending'))return 'pending';
  if(found.some(d=>d.status==='rejected'))return 'rejected';
  return 'missing';
}
export function computeInstructorCompletion(flags:ProgressFlags|null,documents:DocumentRecord[]|null) {
  const required:ProfileField[]=PROFILE_REQUIRED.map(item=>({
    ...item,
    state: flags===null?'unavailable':flags[item.key]?'done':'missing',
  }));
  if(flags!==null&&typeof flags.taxId==='boolean'){
    required.push({...PROFILE_TAX_ID,state:flags.taxId?'done':'missing'});
  }
  const recommended:ProfileField[]=PROFILE_RECOMMENDED.map(item=>({
    ...item,group:'Complementar',
    state:flags===null?'unavailable':flags[item.key]?'done':'missing',
  }));
  const documentsStatus=[
    {key:'identity',label:'Documento de identidade',state:documentState(documents,'identity')},
    {key:'certification',label:'Certificação profissional',state:documentState(documents,'certification')},
  ];
  const essentialCount=required.filter(x=>x.state==='done').length;
  const recommendedCount=recommended.filter(x=>x.state==='done').length;
  const completed=essentialCount+recommendedCount;
  const total=required.length+recommended.length;
  const essentialsReady=flags!==null&&essentialCount===required.length;
  const documentsReady=documentsStatus.every(x=>x.state==='approved');
  return {
    required,recommended,documents:documentsStatus,
    declarations:flags===null?null:{
      experience:flags.experience,
      equipment:flags.equipment,
      supportVehicle:flags.supportVehicle,
    },
    essentialCount,recommendedCount,completed,total,
    profileAvailable:flags!==null,
    percentage:flags===null?null:Math.round(completed/total*100),
    essentialsReady,documentsReady,readyForApproval:essentialsReady&&documentsReady,
  };
}
export type InstructorCompletion = ReturnType<typeof computeInstructorCompletion>;
