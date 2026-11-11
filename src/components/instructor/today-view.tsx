import Link from 'next/link';

import { AdminTitle, ListCard, Metric, Panel, PanelLink, QuickTile } from '@/components/admin/kit';
import { Icon } from '@/components/icon';
import { Badge, DateTile, EmptyState, Note } from '@/components/ui';
import type { Booking, InstructorStatus, Meeting } from '@/lib/data';
import { formatDateLong, formatDay, formatMinutes, formatMoney, formatMonthTag, formatTime } from '@/lib/format';

export interface TodayEntry {
  booking: Booking;
  meeting: Meeting;
}

const lessonHref = ({ meeting }: TodayEntry) =>
  '/instrutor/aula?aba=' + (meeting.status === 'in_progress' ? 'andamento' : 'proximas') + '&aula=' + meeting.id + '#detalhes-aula';

/** The lesson that needs the instructor first: the one running, else the next one. */
function NextLesson({ entry }: { entry: TodayEntry | undefined }) {
  if (!entry) {
    return (
      <section className="flex flex-col justify-center rounded-[16px] border border-dashed border-line-ghost bg-surface p-6">
        <span className="vk-tone-blue grid h-10 w-10 place-items-center rounded-[11px]" aria-hidden="true">
          <Icon name="calendar" className="!h-5 !w-5" />
        </span>
        <h2 className="mt-3 text-[17px] font-semibold text-ink">Nenhuma aula marcada</h2>
        <p className="mt-1 max-w-md text-[13px] leading-relaxed text-muted">
          Mantenha praias, idiomas e turnos atualizados para receber pedidos na sua vez da fila.
        </p>
        <Link href="/instrutor/disponibilidade" className="mt-4 inline-flex items-center gap-1 text-[13px] font-semibold text-brand hover:underline">
          Revisar dias e turnos <Icon name="chevron" className="!h-4 !w-4" />
        </Link>
      </section>
    );
  }
  const { booking, meeting } = entry;
  const running = meeting.status === 'in_progress';
  return (
    <section className="vk-chrome vk-next-lesson relative overflow-hidden rounded-[16px] p-5 sm:p-6" aria-labelledby="proxima-aula">
      <div className="flex flex-wrap items-center gap-2">
        <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[.12em] text-[#9fc0ff]">
          <span className={`h-2 w-2 rounded-full ${running ? 'bg-[#baff06]' : 'bg-[#5b9bff]'}`} aria-hidden="true" />
          {running ? 'Aula em andamento' : 'Próxima aula'}
        </p>
        {booking.is_test ? <Badge tone="warning">AULA TESTE</Badge> : null}
        {booking.with_transport ? <Badge tone="warning">Com transporte</Badge> : null}
      </div>
      <h2 id="proxima-aula" className="mt-3 break-words text-[22px] font-bold leading-tight text-white sm:text-[24px]">
        {booking.student?.full_name ?? 'Aluno'}
      </h2>
      <dl className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-[13.5px] text-label">
        <div className="flex items-center gap-1.5">
          <Icon name="calendar" className="!h-4 !w-4 text-muted" />
          <dt className="sr-only">Data</dt>
          <dd>{formatDateLong(meeting.starts_at)}</dd>
        </div>
        <div className="flex items-center gap-1.5">
          <Icon name="clock" className="!h-4 !w-4 text-muted" />
          <dt className="sr-only">Horário e duração</dt>
          <dd className="tabular">{formatTime(meeting.starts_at)} · {formatMinutes(meeting.minutes)}</dd>
        </div>
        <div className="flex items-center gap-1.5">
          <Icon name="pin" className="!h-4 !w-4 text-muted" />
          <dt className="sr-only">Praia</dt>
          <dd>{booking.beach?.name ?? '—'}</dd>
        </div>
      </dl>
      <div className="mt-5 flex flex-wrap items-center gap-2.5">
        <Link href={lessonHref(entry)} className="btn-primary press inline-flex min-h-11 items-center gap-2 rounded-full px-5 text-[14px]">
          {running ? 'Continuar aula' : 'Abrir aula'} <Icon name="arrow" className="!h-4 !w-4" />
        </Link>
        <Link href={'/instrutor/atendimento/' + booking.id} className="press inline-flex min-h-11 items-center gap-2 rounded-full border border-line-ghost px-4 text-[14px] font-medium text-white hover:bg-[#ffffff12]">
          <Icon name="chat" className="!h-4 !w-4" /> Conversa
        </Link>
      </div>
    </section>
  );
}

function QueueCard({ status, position, queueSize }: { status: InstructorStatus | undefined; position: number; queueSize: number }) {
  if (status !== 'approved') {
    return (
      <Note tone="warning" className="h-full !items-start" title={status === 'paused' ? 'Perfil pausado' : 'Cadastro em análise'}>
        {status === 'paused'
          ? 'Você não recebe pedidos enquanto estiver pausado. Sua posição na fila está guardada.'
          : 'Complete seu perfil profissional e marque suas praias. A operação libera os pedidos depois da análise.'}{' '}
        <Link href="/instrutor/cadastro" className="font-semibold underline">Abrir perfil</Link>
      </Note>
    );
  }
  return (
    <Link href="/instrutor/fila" className="press group flex h-full flex-col justify-between rounded-[16px] border border-line bg-surface p-5 shadow-card transition-colors hover:border-brand-focus">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[13px] font-medium text-muted">Sua posição na fila</p>
        <span className="vk-tone-blue grid h-[34px] w-[34px] place-items-center rounded-[11px]" aria-hidden="true">
          <Icon name="list" className="!h-5 !w-5" />
        </span>
      </div>
      <p className="mt-1 flex items-baseline gap-2">
        <span className="tabular text-[40px] font-bold leading-none tracking-[-1px] text-brand">{position > 0 ? `${position}º` : '—'}</span>
        {queueSize > 0 ? <span className="text-[13px] text-muted">de {queueSize}</span> : null}
      </p>
      <p className="mt-3 text-[12.5px] leading-relaxed text-muted">Recusar ou deixar expirar um pedido não muda a sua vez.</p>
      <span className="mt-3 inline-flex items-center gap-1 text-[13px] font-semibold text-brand group-hover:underline">
        Como funciona <Icon name="chevron" className="!h-4 !w-4" />
      </span>
    </Link>
  );
}

/**
 * Instrutor / Meu dia. Values arrive computed by the page; this only lays
 * them out: what needs attention first, then the numbers, then the list.
 */
export function InstructorTodayView({
  greeting,
  firstName,
  todayLabel,
  status,
  position,
  queueSize,
  upcoming,
  doneMinutes,
  expectedNet,
}: {
  greeting: string;
  firstName: string;
  todayLabel: string;
  status: InstructorStatus | undefined;
  position: number;
  queueSize: number;
  upcoming: readonly TodayEntry[];
  doneMinutes: number;
  expectedNet: number;
}) {
  const [next, ...later] = upcoming;
  return (
    <>
      <AdminTitle title={`${greeting}${firstName ? `, ${firstName}` : ''}`} subtitle={`Hoje é ${todayLabel}.`} />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.9fr)_minmax(0,1fr)]">
        <NextLesson entry={next} />
        <QueueCard status={status} position={position} queueSize={queueSize} />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-3 lg:gap-4">
        <Metric label="Aulas agendadas" value={String(upcoming.length)} hint="Próximos encontros" icon="calendar" tone="blue" />
        <Metric label="Horas realizadas" value={formatMinutes(doneMinutes)} hint="Tempo registrado" icon="clock" tone="sky" />
        <div className="col-span-2 lg:col-span-1">
          <Metric label="Líquido previsto" value={formatMoney(expectedNet)} hint="Reservas confirmadas" hintTone="success" icon="wallet" tone="green" />
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1.9fr)_minmax(0,1fr)]">
        <Panel title="Em seguida" action={<PanelLink href="/instrutor/agenda" label="Ver agenda" />}>
          {later.length === 0 ? (
            <EmptyState>
              {next ? 'Nenhum outro encontro marcado depois deste.' : 'Seus próximos encontros aparecem aqui assim que um aluno confirmar.'}
            </EmptyState>
          ) : (
            <ul className="grid gap-2.5">
              {later.slice(0, 7).map((entry) => (
                <li key={entry.meeting.id}>
                  <ListCard href={lessonHref(entry)}>
                    <div className="flex items-center gap-3">
                      <DateTile day={formatDay(entry.meeting.starts_at)} month={formatMonthTag(entry.meeting.starts_at)} />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <Badge tone={entry.meeting.status === 'in_progress' ? 'warning' : 'success'}>
                            {entry.meeting.status === 'in_progress' ? 'Em aula' : 'Confirmada'}
                          </Badge>
                          {entry.booking.is_test ? <Badge tone="warning">AULA TESTE</Badge> : null}
                          {entry.booking.with_transport ? <Badge tone="warning">Com transporte</Badge> : null}
                        </div>
                        <p className="mt-1 truncate text-[15px] font-semibold text-ink">{entry.booking.student?.full_name ?? 'Aluno'}</p>
                        <p className="tabular text-[12.5px] text-muted">
                          {formatTime(entry.meeting.starts_at)} · {formatMinutes(entry.meeting.minutes)} · {entry.booking.beach?.name ?? '—'}
                        </p>
                      </div>
                    </div>
                  </ListCard>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Atalhos" className="self-start">
          <div className="grid grid-cols-4 gap-2 lg:grid-cols-2">
            <QuickTile href="/instrutor/solicitacao" label="Solicitações" icon="bell" tone="blue" />
            <QuickTile href="/instrutor/agenda" label="Agenda" icon="calendar" tone="slate" />
            <QuickTile href="/instrutor/disponibilidade" label="Turnos" icon="clock" tone="sky" />
            <QuickTile href="/instrutor/atendimento" label="Conversas" icon="chat" tone="green" />
          </div>
        </Panel>
      </div>
    </>
  );
}
