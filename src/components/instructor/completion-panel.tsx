'use client';

import Link from 'next/link';

import { Icon } from '@/components/icon';
import { Badge, type BadgeTone } from '@/components/ui';
import type { DocumentState, InstructorCompletion, ProfileField } from '@/lib/instructor-completion';

function FieldStatus({state}:{state:ProfileField['state']}) {
  const label=state==='done'?'Preenchido':state==='missing'?'Pendente':'Não verificado';
  const tone:BadgeTone=state==='done'?'success':state==='missing'?'warning':'quiet';
  return <Badge tone={tone}>{label}</Badge>;
}

function DocumentStatus({state}:{state:DocumentState}) {
  const labels:Record<DocumentState,string>={
    approved:'Aprovado',
    pending:'Em análise',
    rejected:'Rejeitado',
    missing:'Não enviado',
    unavailable:'Não verificado',
  };
  const tone:BadgeTone=state==='approved'?'success':state==='rejected'?'danger':
    state==='unavailable'?'quiet':'warning';
  return <Badge tone={tone}>{labels[state]}</Badge>;
}

function CheckRow({item,audience}:{item:ProfileField;audience:'admin'|'instructor'}) {
  return <li className="flex flex-wrap items-center gap-2 border-b border-line py-2.5 last:border-b-0">
    <Icon name={item.state==='done'?'check':'info'}
      className={`!h-4 !w-4 shrink-0 ${item.state==='done'?'text-success':'text-brand'}`}/>
    <span className="min-w-0 flex-1 text-[13px] text-ink">{item.label}</span>
    <FieldStatus state={item.state}/>
    {audience==='instructor'&&item.state==='missing'?(
      <a href={item.anchor} aria-label={`Abrir campo: ${item.label}`}
        onClick={()=>{
          const target=document.querySelector(item.anchor);
          const parent=target?.closest('details');
          if(parent)parent.open=true;
          target?.scrollIntoView({behavior:'smooth',block:'center'});
        }}
        className="text-[12px] font-semibold text-brand underline">Editar</a>
    ):null}
  </li>;
}

export function InstructorCompletionPanel({
  completion,audience,instructorId,yearsExperience,
}:{
  completion:InstructorCompletion;
  audience:'admin'|'instructor';
  instructorId?:string;
  yearsExperience?:number;
}) {
  const progress=completion.percentage;
  return (
    <section className="rounded-[22px] border border-line bg-surface p-4 shadow-card sm:p-6">
      <details className="group" open={audience==='admin'}>
        <summary className="cursor-pointer list-none focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand [&::-webkit-details-marker]:hidden">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[11px] font-bold uppercase tracking-[1.4px] text-brand">Conferência do cadastro</p>
              <h2 className="mt-1 text-[20px] font-bold leading-tight text-ink">O que já está pronto?</h2>
              <p className="mt-1 text-[12px] leading-relaxed text-muted">
                {!completion.profileAvailable?'Dados ainda não verificados':completion.essentialsReady?'Dados essenciais completos':`${completion.essentialCount} de ${completion.required.length} dados essenciais preenchidos`}
                {' · '}
                {completion.documents.filter(d=>d.state==='approved').length} de 2 documentos aprovados
              </p>
            </div>
            <Icon name="chevronDown" className="mt-3 !h-5 !w-5 shrink-0 text-brand transition-transform group-open:rotate-180"/>
          </div>
          <div className="mt-4 flex items-center gap-3">
            <div className="h-2.5 min-w-0 flex-1 overflow-hidden rounded-full bg-sand" role="progressbar"
              aria-label="Preenchimento dos dados de perfil" aria-valuemin={0} aria-valuemax={100}
              aria-valuenow={progress??0}>
              <div className="h-full rounded-full bg-brand" style={{width:`${progress??0}%`}}/>
            </div>
            <span className="shrink-0 text-[15px] font-bold tabular-nums text-ink">
              {progress===null?'—':`${progress}%`}
            </span>
          </div>
          <p className="mt-2 text-[11px] text-muted">
            Progresso do perfil: {progress===null?'verificação indisponível':`${completion.completed} de ${completion.total} campos`}.
            Foto e recebimento são recomendados, não exigidos para a aprovação inicial.
          </p>
        </summary>
        <div className="mt-4 grid gap-4 border-t border-line pt-4 lg:grid-cols-2">
          <div>
            <h3 className="text-[13px] font-bold text-ink">Dados essenciais</h3>
            <ul className="mt-2">
              {completion.required.map(item=><CheckRow key={item.key} item={item} audience={audience}/>)}
            </ul>
          </div>
          <div>
            <h3 className="text-[13px] font-bold text-ink">Documentação para aprovação</h3>
            <ul className="mt-2">
              {completion.documents.map(doc=>(
                <li key={doc.key} className="flex flex-wrap items-center gap-2 border-b border-line py-2.5 last:border-b-0">
                  <Icon name={doc.state==='approved'?'check':'file'}
                    className={`!h-4 !w-4 shrink-0 ${doc.state==='approved'?'text-success':'text-brand'}`}/>
                  <span className="min-w-0 flex-1 text-[13px] text-ink">{doc.label}</span>
                  <DocumentStatus state={doc.state}/>
                </li>
              ))}
            </ul>
            <Link href={audience==='instructor'?'/instrutor/documentos':instructorId?`/admin/documentos?instrutor=${instructorId}`:'/admin/documentos'}
              className="mt-2 inline-flex items-center gap-1 text-[12px] font-semibold text-brand underline">
              {audience==='instructor'?'Enviar ou acompanhar documentos':'Analisar documentos'}
              <Icon name="chevron" className="!h-3.5 !w-3.5"/>
            </Link>
            <h3 className="mt-5 text-[13px] font-bold text-ink">Dados complementares</h3>
            <ul className="mt-2">
              {completion.recommended.map(item=><CheckRow key={item.key} item={item} audience={audience}/>)}
            </ul>
            <h3 className="mt-5 text-[13px] font-bold text-ink">Informações declaradas</h3>
          <ul className="mt-2">
            <li className="flex flex-wrap items-center justify-between gap-2 border-b border-line py-2.5">
              <span className="text-[13px] text-ink">Anos de experiência</span>
              <Badge tone="quiet">{yearsExperience==null?'Não verificado':`${yearsExperience} ano(s)`}</Badge>
            </li>
            <li className="flex flex-wrap items-center justify-between gap-2 border-b border-line py-2.5">
              <span className="text-[13px] text-ink">Equipamentos próprios</span>
              <Badge tone="quiet">{completion.declarations===null?'Não verificado':completion.declarations.equipment?'Sim':'Não'}</Badge>
            </li>
            <li className="flex flex-wrap items-center justify-between gap-2 py-2.5">
              <span className="text-[13px] text-ink">Veículo de apoio</span>
              <Badge tone="quiet">{completion.declarations===null?'Não verificado':completion.declarations.supportVehicle?'Sim':'Não'}</Badge>
            </li>
          </ul>
          <p className="mt-2 text-[11px] leading-relaxed text-muted">
            Zero anos de experiência é válido. Responder “Não” para equipamento ou veículo não deixa o cadastro pendente.
          </p>
          </div>
        </div>
        <div className="mt-4 rounded-[14px] border border-line bg-brand-wash p-3 text-[12px] leading-relaxed text-ink">
          {completion.readyForApproval
            ? audience==='admin'
              ? 'Dados essenciais e documentos em ordem. Você pode concluir a análise administrativa.'
              : 'Dados essenciais e documentos aprovados. Agora falta a decisão da administração.'
            : completion.essentialsReady&&!completion.documentsReady
              ? 'Seus dados essenciais estão completos. Falta concluir a análise dos documentos.'
              : 'Confira os dados essenciais e acompanhe os documentos antes de solicitar a validação.'}
        </div>
      </details>
    </section>
  );
}
