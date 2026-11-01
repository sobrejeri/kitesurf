import type { Metadata } from 'next';

import { InstructorDocumentUploader } from '@/components/instructor/document-uploader';
import { Badge, Card, Note, PageHeader } from '@/components/ui';
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
  const essential=['identity','certification'].map(kind=>{
    const rows=(data??[]).filter(doc=>doc.kind===kind);
    return {
      kind,
      name:KINDS[kind],
      status:rows.find(doc=>doc.status==='approved')?.status
        ??rows.find(doc=>doc.status==='pending')?.status
        ??rows[0]?.status
        ??'missing',
    };
  });
  return (
    <>
      <PageHeader eyebrow="Documentação profissional" title="Meus documentos"
        lead="Envie seus comprovantes para análise. Os arquivos ficam privados e só podem ser acessados por você e pela administração."/>
      {error?<Note tone="warning">O cadastro documental depende da migração 17 no Supabase.</Note>:(
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="lg:col-span-2 rounded-[20px] border border-line bg-surface p-4">
            <h2 className="text-[15px] font-bold text-ink">Documentos necessários para aprovação</h2>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {essential.map(doc=>(
                <div key={doc.kind} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line px-3 py-3">
                  <span className="text-[13px] text-ink">{doc.name}</span>
                  <Badge tone={doc.status==='approved'?'success':doc.status==='rejected'?'danger':'warning'}>
                    {STATUS[doc.status]??'Não enviado'}
                  </Badge>
                </div>
              ))}
            </div>
            <p className="mt-2 text-[12px] text-muted">Depois de enviar, acompanhe a análise aqui. Somente a administração pode aprovar os arquivos.</p>
          </div>
          <Card>
            <h2 className="text-[17px] font-bold text-ink">Enviar documento</h2>
            <InstructorDocumentUploader/>
          </Card>
          <Card>
            <h2 className="text-[17px] font-bold text-ink">Histórico de envios</h2>
            {(data??[]).length===0?<p className="mt-4 text-[13px] text-muted">Nenhum documento enviado.</p>:(
              <ul className="mt-4 divide-y divide-line">
                {(data??[]).map(d=>(
                  <li key={d.id} className="py-3">
                    <strong className="block break-words text-[13px] text-ink">{KINDS[d.kind]??d.kind} · {d.original_name}</strong>
                    <Badge tone={d.status==='approved'?'success':d.status==='rejected'?'danger':'warning'}>{STATUS[d.status]??d.status}</Badge>
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
