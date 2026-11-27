import { createBusinessCompany } from '@/app/actions/business-company';
import { ActionForm } from '@/components/action-form';
import { Card, Field, Note, inputClass } from '@/components/ui';
import { readCompanyWorkspace } from '@/lib/business/core-data';
import type { AppArea } from '@/lib/app-areas';

const STATUS={pending:'Em análise',active:'Ativa',suspended:'Suspensa'} as const;
const ACCESS={owner:'Proprietário',member:'Membro da equipe',admin:'Supervisão Admin'} as const;
const ROLE={owner:'Proprietário',admin:'Admin',manager:'Gerente',finance:'Financeiro',attendant:'Atendente'} as const;

export async function BusinessCompanyWorkspace({ area }: { area?: AppArea } = {}) {
  const result=await readCompanyWorkspace();
  if(result.kind==='disabled')return <Note>O módulo de empresas ainda não está disponível.</Note>;
  if(result.kind==='unauthenticated' || result.kind==='denied')return <Note tone="warning">Entre com uma conta autorizada para consultar suas empresas.</Note>;
  if(result.kind!=='ready')return <Note tone="warning">As empresas estão temporariamente indisponíveis. Tente novamente mais tarde.</Note>;
  return <div className="grid gap-4">
    <header><h1 className="text-[26px] font-extrabold text-ink">Empresas</h1><p className="mt-1 text-[14px] text-label">Seu vínculo e suas unidades de trabalho.</p></header>
    {result.companies.length===0?<Card><p>Nenhuma empresa vinculada à sua conta.</p></Card>:result.companies.map(company=><Card key={company.id}>
      <h2 className="break-words text-[19px] font-bold text-ink">{company.name}</h2>
      <p className="mt-1 text-[13px] text-label">{STATUS[company.status]} · {ACCESS[company.access]}</p>
      {area && process.env.NEXT_PUBLIC_VENTO_BUSINESS_PAYMENTS_ENABLED === 'true' ? <a className="mt-3 inline-block text-sm font-semibold text-brand underline" href={`/${area}/${area === 'admin' ? 'empresas' : 'empresa'}/${encodeURIComponent(company.id)}/pagamentos`}>Consultar pagamentos externos</a> : null}
      {company.units.length===0?<p className="mt-3 text-[13px] text-muted">Nenhuma unidade disponível para seu acesso.</p>:<ul className="mt-3 divide-y divide-line">{company.units.map(unit=><li key={unit.id} className="py-3">
        <strong className="block break-words text-[14px]">{unit.name}</strong><span className="text-[12px] text-muted">{unit.city} · {ROLE[unit.role]}{!unit.active?' · Inativa':''}</span>
      </li>)}</ul>}
    </Card>)}
    {result.hasMore?<Note>A lista atingiu o limite de consulta. Algumas empresas ou unidades podem não aparecer.</Note>:null}
    {result.canCreate?<Card>
      <h2 className="text-[19px] font-bold">Cadastrar empresa</h2>
      <p className="mt-1 text-[13px] text-label">O cadastro guarda razão social, nome fantasia e CNPJ. A empresa inicia em análise; o responsável é a conta conectada.</p>
      <ActionForm action={createBusinessCompany} submitLabel="Cadastrar empresa" className="mt-4 grid gap-4">
        <Field label="Razão social"><input name="legalName" required minLength={5} maxLength={120} className={inputClass}/></Field>
        <Field label="Nome fantasia"><input name="tradeName" required minLength={3} maxLength={60} className={inputClass}/></Field>
        <Field label="CNPJ"><input name="cnpj" required maxLength={30} autoComplete="off" className={inputClass}/></Field>
      </ActionForm>
    </Card>:null}
  </div>;
}
