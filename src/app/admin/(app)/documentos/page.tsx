import type { Metadata } from 'next';

import { reviewInstructorDocument } from '@/app/actions/documents';
import { ActionForm } from '@/components/action-form';
import { Card, Note, PageHeader, inputClass } from '@/components/ui';
import { requireRole } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const metadata:Metadata={title:'Documentos dos instrutores'};
type Doc={id:string;kind:string;status:string;storage_path:string;original_name:string;
  instructor_id:string;review_notes:string|null};
const KINDS:Record<string,string>={identity:'Identidade',certification:'Certificação',
  insurance:'Seguro',other:'Outro'};

export default async function AdminDocumentsPage() {
  const viewer=await requireRole(['admin']);
  if(viewer.role!=='admin')return <Note tone="warning">Área restrita à administração.</Note>;
  const db=await createSupabaseServerClient();
  const {data,error}=await db.from('instructor_documents')
    .select('id,kind,status,storage_path,original_name,instructor_id,review_notes')
    .order('uploaded_at',{ascending:false}).limit(80).returns<Doc[]>();
  if(error)return <Note tone="warning">O painel de documentos depende da migração 17.</Note>;
  const files=await Promise.all((data??[]).map(async doc=>{
    const signed=await db.storage.from('vento-instructor-documents')
      .createSignedUrl(doc.storage_path,10*60);
    return {...doc,href:signed.error?null:signed.data?.signedUrl??null};
  }));
  return (
    <>
      <PageHeader eyebrow="Verificação administrativa" title="Documentos dos instrutores"
        lead="Analise cada documento. A aprovação é uma decisão operacional registrada no histórico."/>
      <Card>
        {files.length===0?<p className="text-[13px] text-muted">Nenhum documento recebido.</p>:(
          <div className="grid gap-4">
            {files.map(d=>(
              <section key={d.id} className="rounded-xl border border-line p-4">
                <strong className="text-[14px] text-ink">{KINDS[d.kind]??d.kind} · {d.original_name}</strong>
                <p className="mt-1 break-all text-[11px] text-muted">Instrutor: {d.instructor_id}</p>
                <p className="mt-1 text-[12px] text-brand">Situação: {d.status}</p>
                {d.href?<a href={d.href} target="_blank" rel="noopener noreferrer"
                  className="mt-2 inline-block text-[13px] font-semibold text-brand underline">Visualizar arquivo privado</a>:
                  <p className="text-[12px] text-muted">Arquivo indisponível nesta sessão.</p>}
                <details className="mt-4">
                  <summary className="cursor-pointer text-[13px] font-semibold text-brand">Registrar decisão</summary>
                  <ActionForm action={reviewInstructorDocument} submitLabel="Salvar análise" className="mt-3 grid gap-3">
                    <input type="hidden" name="id" value={d.id}/>
                    <select name="status" defaultValue="approved" className={inputClass}>
                      <option value="approved">Aprovar</option>
                      <option value="rejected">Rejeitar</option>
                    </select>
                    <textarea name="notes" rows={3} maxLength={1000} className={inputClass}
                      placeholder="Motivo da rejeição ou observação da análise"/>
                  </ActionForm>
                </details>
              </section>
            ))}
          </div>
        )}
      </Card>
    </>
  );
}
