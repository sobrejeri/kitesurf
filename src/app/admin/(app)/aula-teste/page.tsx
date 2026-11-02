import type { Metadata } from 'next';

import { createAdminTestLesson, cancelAdminTestLesson } from '@/app/actions/admin-test-lesson';
import { ActionForm } from '@/components/action-form';
import { AdminTestMeetingFields } from '@/components/admin/test-meeting-fields';
import { ButtonLink, Card, Note, PageHeader, inputClass } from '@/components/ui';
import { requireRole } from '@/lib/auth';
import { listActiveBeaches, listAllInstructors } from '@/lib/data';
import { lessonDate } from '@/lib/dates';
import { formatDateLong, formatTime } from '@/lib/format';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const metadata: Metadata={title:'Agendar aula de teste'};
type Profile={id:string;full_name:string};
type TestBooking={id:string;code:string;instructor_id:string;student_id:string;status:string;booking_meetings:{id:string;position:number;starts_at:string;minutes:number;status:string;done_minutes:number}[]};

export default async function AdminTestLessonPage() {
  await requireRole(['admin']);
  const db=await createSupabaseServerClient();
  const [instructors,beaches,students,tests]=await Promise.all([
    listAllInstructors(),
    listActiveBeaches(),
    db.from('profiles').select('id,full_name').eq('role','student').order('full_name').limit(100).returns<Profile[]>(),
    db.from('bookings').select('id,code,instructor_id,student_id,status,booking_meetings(id,position,starts_at,minutes,status,done_minutes)')
      .eq('is_test',true).order('created_at',{ascending:false}).limit(20).returns<TestBooking[]>(),
  ]);
  const studentNames=new Map((students.data??[]).map(p=>[p.id,p.full_name]));
  const instructorNames=new Map(instructors.map(p=>[p.id,p.profile?.full_name??p.id.slice(0,8)]));
  const instructorData=new Map(instructors.map(p=>[p.id,p]));
  const ready=!students.error&&!tests.error;

  return <>
    <PageHeader eyebrow="Homologação interna" title="Agendar uma aula teste"
      lead="Crie uma reserva demonstrativa com 1 a 4 encontros para testar agenda, evolução, avaliações e conclusão da reserva."/>
    <Note tone="warning" className="mb-4">
      Esta é uma reserva demonstrativa: não cobra o aluno e não gera pagamento nem repasse.
      Apenas contas existentes podem participar. O Instrutor verá o compromisso real na agenda.
      Escolha horários livres; os encontros já concluídos permanecem no histórico.
    </Note>
    {!ready?<Note tone="warning">Este painel depende da migração 20 do Supabase e de permissão administrativa.</Note>:(
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="text-[18px] font-bold text-ink">Nova reserva de demonstração</h2>
          {students.data?.length&&instructors.length&&beaches.length?(
            <ActionForm action={createAdminTestLesson} submitLabel="Criar reserva teste" className="mt-4 grid gap-3">
              <label htmlFor="test-instructor" className="text-[13px] font-semibold">Instrutor para verificar</label>
              <select id="test-instructor" name="instructorId" className={inputClass} required>
                {instructors.map(i=><option key={i.id} value={i.id}>
                  {i.profile?.full_name??'Instrutor'} · {i.status==='approved'?'Aprovado':'Em análise / pausado'}
                </option>)}
              </select>
              <label htmlFor="test-student" className="text-[13px] font-semibold">Conta de aluno de teste</label>
              <select id="test-student" name="studentId" className={inputClass} required>
                {(students.data??[]).map(p=><option key={p.id} value={p.id}>
                  {p.full_name||'Aluno'} · {p.id.slice(0,8)}
                </option>)}
              </select>
              <label htmlFor="test-beach" className="text-[13px] font-semibold">Praia</label>
              <select id="test-beach" name="beachId" className={inputClass} required>
                {beaches.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
              <AdminTestMeetingFields
                suggestedDates={[lessonDate(1),lessonDate(3),lessonDate(5),lessonDate(7)]
                  .map(day=>day+'T11:00')}
                minDate={lessonDate()+'T00:00'}
                maxDate={lessonDate(60)+'T23:59'}
              />
              <p className="text-[12px] text-muted">
                As datas sugeridas são alternadas, às 11h no Ceará. Elas não garantem disponibilidade.
                A reserva só é criada se cada encontro estiver dentro da agenda semanal do instrutor,
                sem bloqueios ou outras aulas sobrepostas. Confira a{' '}
                <a href="/admin/agenda" className="font-semibold text-brand underline">
                  agenda dos instrutores
                </a>{' '}
                antes de agendar. Máximo de 4 encontros e 8h no total, com uma hora de antecedência.
              </p>
            </ActionForm>
          ):<Note tone="warning" className="mt-4">Cadastre uma conta de Aluno e um Instrutor, e ative pelo menos uma praia antes de testar.</Note>}
        </Card>
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-[18px] font-bold text-ink">Reservas de teste registradas</h2>
            <ButtonLink href="/admin/aula-teste" variant="ghost" size="sm">Atualizar dados</ButtonLink>
          </div>
          {(tests.data??[]).length===0?<p className="mt-4 text-[13px] text-muted">Nenhuma aula teste registrada.</p>:(
            <ul className="mt-4 divide-y divide-line">
              {(tests.data??[]).map(b=><li key={b.id} className="py-4">
                <strong className="block text-[14px] text-ink">{b.code}</strong>
                <p className="mt-1 text-[12px] text-muted">
                  Instrutor: {instructorNames.get(b.instructor_id)??b.instructor_id.slice(0,8)}
                </p>
                {instructorData.get(b.instructor_id) ? (
                  <div className="mt-2 rounded-xl border border-line p-3 text-[12px] text-muted">
                    <strong className="block text-[12px] text-ink">Dados atuais do perfil</strong>
                    <p>Situação: {instructorData.get(b.instructor_id)?.status === 'approved' ? 'Aprovado' : 'Em análise/pausado'}</p>
                    <p>Experiência: {instructorData.get(b.instructor_id)?.years_experience ?? 0} ano(s)</p>
                    <p>Praias: {instructorData.get(b.instructor_id)?.beaches.map(beach=>beach.name).join(', ') || 'Nenhuma selecionada'}</p>
                    <p>Idiomas: {instructorData.get(b.instructor_id)?.languages.join(', ') || 'Nenhum informado'}</p>
                    <p>Equipamentos: {instructorData.get(b.instructor_id)?.has_equipment ? 'Sim' : 'Não'}</p>
                  </div>
                ) : null}
                <p className="text-[12px] text-muted">Aluno: {studentNames.get(b.student_id)??b.student_id.slice(0,8)}</p>
                <p className="text-[12px] text-muted">Status: {b.status}</p>
                <p className="mt-2 text-[12px] font-semibold text-ink">
                  {(b.booking_meetings??[]).length} encontros ·{' '}
                  {(b.booking_meetings??[]).reduce((total,m)=>total+m.minutes,0)/60}h
                </p>
                {[...(b.booking_meetings??[])]
                  .sort((a,b)=>a.position-b.position)
                  .map(m=><p key={m.id} className="text-[12px] text-muted">
                    Encontro {m.position} · {formatDateLong(m.starts_at)} · {formatTime(m.starts_at)}
                    {' · '}{m.minutes/60}h · {m.status==='done'
                      ? 'Realizado ('+m.done_minutes+'min)' : m.status==='scheduled'
                        ? 'Agendado' : m.status==='in_progress' ? 'Em aula' : 'Cancelado'}
                  </p>)}
                <div className="mt-3 flex flex-wrap gap-2">
                  <ButtonLink href={'/admin/reservas/'+b.id} variant="ghost" size="sm">Conferir detalhes</ButtonLink>
                  {b.status==='confirmed'?<ActionForm action={cancelAdminTestLesson} submitLabel="Encerrar teste" submitVariant="danger">
                    <input type="hidden" name="bookingId" value={b.id}/>
                  </ActionForm>:null}
                </div>
              </li>)}
            </ul>
          )}
        </Card>
      </div>
    )}
  </>;
}
