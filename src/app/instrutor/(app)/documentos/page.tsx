import type { Metadata } from 'next';

import { uploadInstructorDocument } from '@/app/actions/documents';
import { ActionForm } from '@/components/action-form';
import { Card, Note, PageHeader, inputClass } from '@/components/ui';
import { requireRole } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const metadata:Metadata={title:'Meus documentos'};
type Doc={id:string;kind:string;original_name:string;status:string;review_notes:string|null;uploaded_at:string};
const KINDS:Record<string,string>={identity:'Documento de identidade',certification:'Certificação profissional',
  insurance:'Seguro / responsabilidade',other:'Outro documento'};
const STATUS:Record<string,string>={pending:'Aguardando análise',approved:'Aprovado',rejected:'Rejeitado'};

export default async function InstructorDocumentsPage() {
  const viewer=await requireRole(['instructor']);
  const db=await createSupabaseServerClient();
  const {data,error}=await db.from('instructor_documents')
    .select('id,kind,original_name,status,review_notes,uploaded_at')
    .eq('instructor_id',viewer.id).order('uploaded_at',{ascending:false}).limit(50).returns<Doc[]>();
  return (
    <>
      <PageHeader eyebrow="Documentação profissional" title="Meus documentos"
        lead="Envie seus comprovantes para análise. Os arquivos ficam privados e só podem ser acessados por você e pela administração."/>
      {error?<Note tone="warning">O cadastro documental depende da migração 17 no Supabase.</Note>:(
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <h2 className="text-[17px] font-bold text-ink">Enviar documento</h2>
            <ActionForm action={uploadInstructorDocument} submitLabel="Enviar para análise" className="mt-4 grid gap-4">
              <label htmlFor="doc-kind" className="text-[13px] font-semibold">Tipo de documento</label>
              <select id="doc-kind" name="kind" required className={inputClass}>
                {Object.entries(KINDS).map(([value,label])=><option key={value} value={value}>{label}</option>)}
              </select>
              <label htmlFor="doc-file" className="text-[13px] font-semibold">Arquivo</label>
              <input id="doc-file" name="document" type="file" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
                required className="w-full min-w-0 text-[12px] text-ink"/>
              <p className="text-[12px] text-muted">PDF, JPG ou PNG · máximo 8 MB. Evite compartilhar esses arquivos em conversas.</p>
            </ActionForm>
          </Card>
          <Card>
            <h2 className="text-[17px] font-bold text-ink">Histórico de envios</h2>
            {(data??[]).length===0?<p className="mt-4 text-[13px] text-muted">Nenhum documento enviado.</p>:(
              <ul className="mt-4 divide-y divide-line">
                {(data??[]).map(d=>(
                  <li key={d.id} className="py-3">
                    <strong className="block break-words text-[13px] text-ink">{KINDS[d.kind]??d.kind} · {d.original_name}</strong>
                    <span className="mt-1 block text-[12px] text-brand">{STATUS[d.status]??d.status}</span>
                    {d.review_notes?<p className="mt-2 text-[12px] text-muted">Análise: {d.review_notes}</p>:null}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      )}
    </>
  );
}
