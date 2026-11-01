import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { setInstructorStatus } from '@/app/actions/admin';
import { ActionForm } from '@/components/action-form';
import { Panel } from '@/components/admin/kit';
import { AdminProfilePhoto } from '@/components/admin/profile-photo';
import { INSTRUCTOR_STATUS } from '@/components/admin/labels';
import { Icon, type IconName } from '@/components/icon';
import { Badge, Note, inputClass } from '@/components/ui';
import { InstructorCompletionPanel } from '@/components/instructor/completion-panel';
import { VerifiedInstructorBadge } from '@/components/instructor/verified-badge';
import { requireRole } from '@/lib/auth';
import { getAdminAvatarUrls } from '@/lib/admin-avatars';
import { listAllBookings, listAllInstructors, listQueue } from '@/lib/data';
import { initials } from '@/lib/people';
import { computeInstructorCompletion, readProgressFlags, type DocumentRecord } from '@/lib/instructor-completion';
import { createSupabaseServerClient } from '@/lib/supabase/server';

 
export const metadata: Metadata = { title: 'Instrutor' };

function InfoRow({
  icon,label,value,filled,optional=false,
}:{
  icon:IconName;label:string;value:React.ReactNode;
  filled?:boolean|null;optional?:boolean;
}) {
  return (
    <div className="flex items-start gap-3 border-b border-line py-3 last:border-b-0">
      <Icon name={icon} className="mt-0.5 !h-5 !w-5 shrink-0 text-label" />
      <dt className="flex-1 text-[13px] text-label">{label}</dt>
      <dd className="flex min-w-0 flex-1 flex-col items-end gap-1.5 text-right text-[13px] text-ink">
        <span className="break-words">{value}</span>
        {optional
          ? <Badge tone="quiet">Opcional · informado</Badge>
          : filled===undefined?null:
            <Badge tone={filled===null?'quiet':filled?'success':'warning'}>
              {filled===null?'Não verificado':filled?'Preenchido':'Pendente'}
            </Badge>}
      </dd>
    </div>
  );
}

export default async function InstructorDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireRole(['admin'], `/admin/instrutores/${id}`);
  const [instructors, queue, bookings, avatarUrls] = await Promise.all([
    listAllInstructors(), listQueue(), listAllBookings(500), getAdminAvatarUrls('instructor'),
  ]);
  const row = instructors.find((item) => item.id === id);
  if (!row) notFound();

  const name = row.profile?.full_name || 'Sem nome';
  const position = queue.findIndex((item) => item.id === row.id) + 1;
  const theirs = bookings.filter((booking) => booking.instructor_id === row.id);
  const next = row.status === 'approved' ? 'paused' : 'approved';
  const db = await createSupabaseServerClient();
  const [documents, previousApproval, completionResult] = await Promise.all([
    db.from('instructor_documents').select('kind,status').eq('instructor_id',row.id)
      .in('kind',['identity','certification']).returns<DocumentRecord[]>(),
    db.from('instructors').select('approved_at').eq('id',row.id)
      .maybeSingle<{approved_at:string|null}>(),
    db.rpc('get_instructor_profile_progress',{p_instructor_id:row.id}),
  ]);
  const flags = readProgressFlags(completionResult.data);
  const completion=computeInstructorCompletion(
    flags,documents.error?null:documents.data??[],
  );
  const initialApproval = next==='approved' && !previousApproval.data?.approved_at;
  // Until the new read-only RPC is installed, keep the previous documented
  // approval rule (approved documents). Do not label unknown fields as missing.
  const canApprove = !previousApproval.error &&
    (!initialApproval || (completion.documentsReady &&
      (flags===null || completion.essentialsReady)));
  const docsHref = `/admin/documentos?instrutor=${row.id}`;

  return (
    <>
      <Link href="/admin/instrutores" className="mb-4 inline-flex items-center gap-1.5 text-[13px] text-label">
        <Icon name="back" className="!h-4 !w-4" /> Instrutores
      </Link>

      <section className="relative overflow-hidden rounded-[22px] border border-line bg-[linear-gradient(135deg,#1d2a42,#3a2316)] p-5">
        <div className="flex items-center gap-4">
          <AdminProfilePhoto src={avatarUrls.get(row.id)} name={name} initials={initials(name)} size={84} />
          <div className="min-w-0">
            <div className="flex min-w-0 items-center gap-2">
              <h1 className="min-w-0 break-words text-[24px] font-bold leading-tight text-white">{name}</h1>
              <VerifiedInstructorBadge status={row.status} size="lg" />
            </div>
            <p className="mt-1 text-[13px] text-white/75">Instrutor</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Badge tone={INSTRUCTOR_STATUS[row.status].tone}>{INSTRUCTOR_STATUS[row.status].label}</Badge>
              {position > 0 ? <span className="text-[12px] text-label">{position}º na fila</span> : null}
            </div>
          </div>
        </div>
      </section>

      <div className="mt-4">
        <InstructorCompletionPanel completion={completion} audience="admin" instructorId={row.id} yearsExperience={row.years_experience}/>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Panel title="Informações">
          <dl>
            <InfoRow icon="user" label="Nome completo" value={name} filled={flags?.fullName??null} />
            <InfoRow icon="globe" label="Idiomas" value={row.languages.join(', ')||'Não informado'} filled={flags?.languages??null} />
            <InfoRow icon="clock" label="Anos de experiência" value={`${row.years_experience} anos`} filled={flags?.experience??null} />
            <InfoRow icon="kite" label="Equipamentos próprios" value={row.has_equipment ? 'Sim' : 'Não'} optional />
            <InfoRow icon="car" label="Veículo de apoio" value={row.has_support_vehicle ? 'Sim' : 'Não'} optional />
            <InfoRow icon="book" label="Reservas recebidas" value={String(theirs.length)} />
          </dl>
        </Panel>

        <div className="grid content-start gap-4">
          <Panel title="Praias de atendimento">
            {row.beaches.length === 0 ? (
              <p className="text-[13px] text-muted">Ainda não marcou nenhuma praia — não recebe pedidos.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {row.beaches.map((beach) => (
                  <span key={beach.id} className="flex items-center gap-1.5 rounded-full border border-brand/60 px-3 py-1.5 text-[13px] text-ink">
                    <Icon name="check" className="!h-4 !w-4 text-brand" /> {beach.name}
                  </span>
                ))}
              </div>
            )}
            <div className="mt-3 flex items-center gap-2 text-[12px] text-muted">
              <Badge tone={row.beaches.length?'success':'warning'}>{row.beaches.length?'Preenchido':'Pendente'}</Badge>
              O próprio instrutor marca as praias no perfil profissional.
            </div>
          </Panel>

          <Panel title="Validação documental">
            <p className="text-[12px] text-muted">
              Os dois documentos devem estar aprovados para liberar um instrutor pela primeira vez.
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Badge tone={completion.documentsReady?'success':'warning'}>
                {completion.documents.filter(doc=>doc.state==='approved').length} de 2 aprovados
              </Badge>
              <Link href={docsHref} className="text-[13px] font-semibold text-brand underline">
                Conferir documentos
              </Link>
            </div>
          </Panel>

          <Panel title={row.status === 'pending' ? 'Analisar cadastro' : row.status === 'paused' ? 'Reativar' : 'Pausar instrutor'}>
            {previousApproval.error ? (
              <Note tone="warning" className="mb-3">
                Falha ao verificar a situação da primeira aprovação. Atualize a página.
              </Note>
            ) : completionResult.error ? (
              <Note tone="warning" className="mb-3">
                A conferência dos dados privados ainda depende da migração 21. A regra documental antiga continua válida.
              </Note>
            ) : initialApproval && !completion.readyForApproval ? (
              <Note tone="warning" className="mb-3" title="Cadastro ainda incompleto">
                Faltam informações essenciais ou documentos aprovados. Confira a lista acima antes de validar.
              </Note>
            ) : null}
            {canApprove ? (
              <ActionForm
                action={setInstructorStatus}
                submitLabel={row.status === 'pending' ? 'Aprovar cadastro' : row.status === 'paused' ? 'Reativar' : 'Pausar'}
                submitVariant={next === 'approved' ? 'primary' : 'soft'}
                className="grid gap-3"
              >
                <input type="hidden" name="instructorId" value={row.id} />
                <input type="hidden" name="status" value={next} />
                <label className="grid gap-1.5 text-[12px] text-label">
                  Motivo (fica no histórico de auditoria)
                  <input name="reason" required minLength={3} className={inputClass}
                    placeholder="Ex.: documentos conferidos" />
                </label>
              </ActionForm>
            ) : null}
            <p className="mt-3 text-[12px] text-muted">
              A primeira aprovação coloca o instrutor no final da fila. Pausar e reativar preservam a posição.
              Foto e dados bancários são recomendados, não obrigatórios para essa etapa.
            </p>
          </Panel>
        </div>
      </div>
    </>
  );
}
