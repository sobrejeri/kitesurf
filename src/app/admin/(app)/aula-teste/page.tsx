import type { Metadata } from 'next';

import { createAdminTestLesson, cancelAdminTestLesson } from '@/app/actions/admin-test-lesson';
import { ActionForm } from '@/components/action-form';
import { ButtonLink, Card, Note, PageHeader, inputClass } from '@/components/ui';
import { requireRole } from '@/lib/auth';
import { listActiveBeaches, listAllInstructors } from '@/lib/data';
import { formatDateLong, formatTime } from '@/lib/format';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const metadata: Metadata={title:'Agendar aula de teste'};
type Profile={id:string;full_name:string};
type TestBooking={id:string;code:string;instructor_id:string;student_id:string;status:string;booking_meetings:{starts_at:string;minutes:number}[]};

export default async function AdminTestLessonPage() {
  await requireRole(['admin']);
  const db=await createSupabaseServerClient();
  const [instructors,beaches,students,tests]=await Promise.all([
    listAllInstructors(),
    listActiveBeaches(),
    db.from('profiles').select('id,full_name').eq('role','student').order('full_name').limit(100).returns<Profile[]>(),
    db.from('bookings').select('id,code,instructor_id,student_id,status,booking_meetings(starts_at,minutes)')
      .eq('is_test',true).order('created_at',{ascending:false}).limit(20).returns<TestBooking[]>(),
  ]);
  const studentNames=new Map((students.data??[]).map(p=>[p.id,p.full_name]));
  const instructorNames=new Map(instructors.map(p=>[p.id,p.profile?.full_name??p.id.slice(0,8)]));
  const ready=!students.error&&!tests.error;

  return <>
    <PageHeader eyebrow="Homologação interna" title="Agendar uma aula teste"
      lead="Simule uma aula confirmada para conferir se ela aparece no Meu dia, Agenda, Registro de aulas e conta do aluno."/>
    <Note tone="warning" className="mb-4">
      Esta é uma aula de demonstração: não cobra o aluno, não gera comissão nem repasse.
      Apenas contas existentes podem participar. O Instrutor verá o compromisso real na agenda.
      Agende em um horário livre e cancele depois de testar.
    </Note>
    {!ready?<Note tone="warning">Este painel depende da migração 20 do Supabase e de permissão administrativa.</Note>:(
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="text-[18px] font-bold text-ink">Nova aula de demonstração</h2>
          {students.data?.length&&instructors.length&&beaches.length?(
            <ActionForm action={createAdminTestLesson} submitLabel="Agendar aula teste" className="mt-4 grid gap-3">
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
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label htmlFor="test-date" className="text-[13px] font-semibold">Data e horário (Ceará)</label>
                  <input id="test-date" name="start" type="datetime-local" required className={inputClass}/>
                </div>
                <div>
                  <label htmlFor="test-hours" className="text-[13px] font-semibold">Duração da aula</label>
                  <select id="test-hours" name="hours" defaultValue="2" className={inputClass}>
                    {[1,2,3,4,5,6,7,8].map(n=><option key={n} value={n}>{n}h</option>)}
                  </select>
                </div>
              </div>
              <p className="text-[12px] text-muted">Escolha pelo menos uma hora de antecedência e um horário sem conflito.</p>
            </ActionForm>
          ):<Note tone="warning" className="mt-4">Cadastre uma conta de Aluno e um Instrutor, e ative pelo menos uma praia antes de testar.</Note>}
        </Card>
        <Card>
          <h2 className="text-[18px] font-bold text-ink">Aulas de teste registradas</h2>
          {(tests.data??[]).length===0?<p className="mt-4 text-[13px] text-muted">Nenhuma aula teste registrada.</p>:(
            <ul className="mt-4 divide-y divide-line">
              {(tests.data??[]).map(b=><li key={b.id} className="py-4">
                <strong className="block text-[14px] text-ink">{b.code}</strong>
                <p className="mt-1 text-[12px] text-muted">
                  Instrutor: {instructorNames.get(b.instructor_id)??b.instructor_id.slice(0,8)}
                </p>
                <p className="text-[12px] text-muted">Aluno: {studentNames.get(b.student_id)??b.student_id.slice(0,8)}</p>
                <p className="text-[12px] text-muted">Status: {b.status}</p>
                {(b.booking_meetings??[]).map((m,i)=><p key={i} className="text-[12px] text-muted">
                  {formatDateLong(m.starts_at)} · {formatTime(m.starts_at)} · {m.minutes/60}h
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
