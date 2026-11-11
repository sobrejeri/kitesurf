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
};
export const PARTNER_REQUIRED = [
  {key:'name',label:'Nome do afiliado ou da empresa'},
  {key:'beach',label:'Praia onde atua'},
  {key:'responsible',label:'Nome do responsável'},
  {key:'phone',label:'Telefone / WhatsApp'},
  {key:'city',label:'Cidade'},
  {key:'address',label:'Endereço'},
] as const;
export const PARTNER_OPTIONAL = [
  {key:'avatar',label:'Foto ou logo'},
  {key:'instagram',label:'Instagram'},
  {key:'payout',label:'Dados de recebimento'},
] as const;

export function parsePartnerProgress(value:unknown):PartnerProgress|null {
  if(!value || typeof value!=='object' || Array.isArray(value))return null;
  const o=value as Record<string,unknown>;
  const keys:readonly (keyof PartnerProgress)[]=[
    'name','beach','responsible','phone','city','address','instagram','avatar','payout',
  ];
  if(keys.some(key=>typeof o[key]!=='boolean'))return null;
  return o as PartnerProgress;
}
export function partnerCompletion(flags:PartnerProgress|null) {
  const requiredDone=PARTNER_REQUIRED.filter(item=>flags?.[item.key]).length;
  const optionalDone=PARTNER_OPTIONAL.filter(item=>flags?.[item.key]).length;
  const total=PARTNER_REQUIRED.length+PARTNER_OPTIONAL.length;
  return {
    requiredDone,optionalDone,total,
    percentage:flags?Math.round((requiredDone+optionalDone)/total*100):null,
    ready:flags!==null&&requiredDone===PARTNER_REQUIRED.length,
  };
}
