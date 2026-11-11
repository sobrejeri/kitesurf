export type PartnerProgress = {
  name:boolean;
  beach:boolean;
  responsible:boolean;
  phone:boolean;
  city:boolean;
  address:boolean;
  instagram:boolean;
  avatar:boolean;
  payout:boolean;
  /** Absent while the database does not track it yet (before migration 47). */
  taxId?:boolean;
};
export const PARTNER_REQUIRED = [
  {key:'name',label:'Nome do afiliado ou da empresa'},
  {key:'beach',label:'Praia onde atua'},
  {key:'responsible',label:'Nome do responsável'},
  {key:'phone',label:'Telefone / WhatsApp'},
  {key:'city',label:'Cidade'},
  {key:'address',label:'Endereço'},
] as const;
/** Required once the database has migration 47; not listed before it. */
export const PARTNER_TAX_ID = {key:'taxId',label:'CPF ou CNPJ'} as const;
export const PARTNER_OPTIONAL = [
  {key:'avatar',label:'Foto ou logo'},
  {key:'instagram',label:'Instagram'},
  {key:'payout',label:'Dados de recebimento'},
] as const;

/** Essential items for these flags: the CPF or CNPJ only when it is tracked. */
export function partnerRequired(flags:PartnerProgress|null) {
  return typeof flags?.taxId==='boolean'
    ? [...PARTNER_REQUIRED,PARTNER_TAX_ID] as const
    : PARTNER_REQUIRED;
}

export function parsePartnerProgress(value:unknown):PartnerProgress|null {
  if(!value || typeof value!=='object' || Array.isArray(value))return null;
  const o=value as Record<string,unknown>;
  const keys:readonly Exclude<keyof PartnerProgress,'taxId'>[]=[
    'name','beach','responsible','phone','city','address','instagram','avatar','payout',
  ];
  if(keys.some(key=>typeof o[key]!=='boolean'))return null;
  const flags={} as PartnerProgress;
  for(const key of keys)flags[key]=o[key] as boolean;
  if(typeof o.taxId==='boolean')flags.taxId=o.taxId;
  return flags;
}
export function partnerCompletion(flags:PartnerProgress|null) {
  const required=partnerRequired(flags);
  const requiredDone=required.filter(item=>flags?.[item.key]).length;
  const optionalDone=PARTNER_OPTIONAL.filter(item=>flags?.[item.key]).length;
  const total=required.length+PARTNER_OPTIONAL.length;
  return {
    requiredDone,requiredTotal:required.length,optionalDone,total,
    percentage:flags?Math.round((requiredDone+optionalDone)/total*100):null,
    ready:flags!==null&&requiredDone===required.length,
  };
}
