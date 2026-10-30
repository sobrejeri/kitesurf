import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { setInstructorStatus } from '@/app/actions/admin';
import { ActionForm } from '@/components/action-form';
import { Panel, PhotoTile } from '@/components/admin/kit';
import { INSTRUCTOR_STATUS } from '@/components/admin/labels';
import { Icon, type IconName } from '@/components/icon';
import { Badge, inputClass } from '@/components/ui';
import { requireRole } from '@/lib/auth';
import { listAllBookings, listAllInstructors, listQueue } from '@/lib/data';
import { initials } from '@/lib/people';

export const metadata: Metadata = { title: 'Instrutor' };

function InfoRow({ icon, label, value }: { icon: IconName; label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 border-b border-line py-3 last:border-b-0">
      <Icon name={icon} className="mt-0.5 !h-5 !w-5 shrink-0 text-label" />
      <dt className="flex-1 text-[13px] text-label">{label}</dt>
      <dd className="text-right text-[13px] text-ink">{value}</dd>
    </div>
  );
}

export default async function InstructorDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireRole(['admin'], `/admin/instrutores/${id}`);
  const [instructors, queue, bookings] = await Promise.all([listAllInstructors(), listQueue(), listAllBookings(500)]);
  const row = instructors.find((item) => item.id === id);
  if (!row) notFound();

  const name = row.profile?.full_name || 'Sem nome';
  const position = queue.findIndex((item) => item.id === row.id) + 1;
  const theirs = bookings.filter((booking) => booking.instructor_id === row.id);
  const next = row.status === 'approved' ? 'paused' : 'approved';

  return (
    <>
      <Link href="/admin/instrutores" className="mb-4 inline-flex items-center gap-1.5 text-[13px] text-label">
        <Icon name="back" className="!h-4 !w-4" /> Instrutores
      </Link>

      <section className="relative overflow-hidden rounded-[22px] border border-line bg-[linear-gradient(135deg,#1d2a42,#3a2316)] p-5">
        <div className="flex items-center gap-4">
          <PhotoTile initials={initials(name)} size={84} />
          <div className="min-w-0">
            <h1 className="text-[24px] font-bold leading-tight text-white">{name}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Badge tone={INSTRUCTOR_STATUS[row.status].tone}>{INSTRUCTOR_STATUS[row.status].label}</Badge>
              {position > 0 ? <span className="text-[12px] text-label">{position}º na fila</span> : null}
            </div>
          </div>
        </div>
      </section>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Panel title="Informações">
          <dl>
            <InfoRow icon="user" label="Nome completo" value={name} />
            <InfoRow icon="globe" label="Idiomas" value={row.languages.join(', ')} />
            <InfoRow icon="clock" label="Anos de experiência" value={`${row.years_experience} anos`} />
            <InfoRow icon="kite" label="Equipamentos próprios" value={row.has_equipment ? 'Sim' : 'Não informado'} />
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
            <p className="mt-3 text-[12px] text-muted">O próprio instrutor marca as praias no perfil profissional.</p>
          </Panel>

          <Panel title={row.status === 'pending' ? 'Analisar cadastro' : row.status === 'paused' ? 'Reativar' : 'Pausar instrutor'}>
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
                <input name="reason" required minLength={3} className={inputClass} />
              </label>
            </ActionForm>
            <p className="mt-3 text-[12px] text-muted">
              A aprovação coloca o instrutor no final da fila. Pausar e reativar preservam a posição.
            </p>
          </Panel>
        </div>
      </div>
    </>
  );
}
