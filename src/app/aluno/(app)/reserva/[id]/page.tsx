import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { confirmTestPayment, confirmValidationLesson } from '@/app/actions/booking';
import { requestBookingBalance } from '@/app/actions/booking-balance';
import { VALIDATION_WITHOUT_CHECKOUT } from '@/lib/booking-mode';
import { rateInstructor } from '@/app/actions/ratings';
import { ActionForm } from '@/components/action-form';
import { Icon } from '@/components/icon';
import { StudentHero } from '@/components/student/sunset';
import { StudentInstructorPhoto } from '@/components/student/instructor-photo';
import { Badge, ButtonLink, Card, Eyebrow, Field, Note, ProgressBar, inputClass } from '@/components/ui';
import { requireRole } from '@/lib/auth';
import { BOOKING_STATUS_LABELS, LEVEL_LABELS, MEETING_STATUS_LABELS, getBookingForViewer, learningBalance } from '@/lib/data';
import { formatDateLong, formatMinutes, formatMoney, formatTime } from '@/lib/format';
import { getStudentBookingInstructorAvatar } from '@/lib/student-booking-avatar';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { listMeetingChanges } from '@/lib/meeting-changes';
import { MeetingChangePanel } from '@/components/meeting-change-panel';

export const metadata: Metadata = { title: 'Sua reserva' };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Reservation actions share a full-width, thumb-friendly button style on mobile.
// Keep the Vento UI kit's pill shape; only the primary chat action is filled.
const reservationActionClass =
  'w-full min-w-0 !min-h-12 !px-4 !py-3 text-center !text-[13px] !font-semibold leading-snug sm:!text-[14px]';

export default async function BookingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const viewer = await requireRole(['student'], `/aluno/reserva/${id}`);
  if (!UUID.test(id)) notFound();
  // Scoped to the viewer: someone else's booking id is a 404, not a page.
  const booking = await getBookingForViewer(id, viewer);
  if (!booking || booking.student_id !== viewer.id) notFound();

  const db = await createSupabaseServerClient();
  const { data: pointRecord } = await db.from('bookings')
    .select('meeting_point:meeting_points!bookings_meeting_point_id_fkey(title,details,latitude,longitude)')
    .eq('id',booking.id).eq('student_id',viewer.id)
    .maybeSingle<{
      meeting_point: {title:string;details:string;latitude:number;longitude:number}|null
    }>();
  const meetingPoint = pointRecord?.meeting_point ?? null;
  const changeRequests = await listMeetingChanges(booking.id);
  const {data:reassignmentState} = await db.from('booking_reassignments')
    .select('status').eq('booking_id',booking.id)
    .order('created_at',{ascending:false}).limit(1).maybeSingle<{status:string}>();

  const rated = booking.status === 'completed' ? await db.from('instructor_ratings')
    .select('stars,comment').eq('booking_id',booking.id).eq('student_id',viewer.id)
    .maybeSingle<{stars:number;comment:string}>() : null;
  const awaiting = booking.status === 'awaiting_payment';
  const balance = learningBalance([{ ...booking, status: awaiting ? 'confirmed' : booking.status }]);
  const donePercent = balance.contracted ? Math.round((balance.done / balance.contracted) * 100) : 0;
  const reservedPercent = balance.contracted ? Math.round((balance.scheduled / balance.contracted) * 100) : 0;
  const { data: balanceRequest, error: balanceRequestError } =
    booking.status === 'completed' && balance.available > 0
      ? await db.from('booking_balance_requests')
        .select('id,starts_at,minutes,status,expires_at')
        .eq('booking_id', booking.id).order('created_at', { ascending: false })
        .limit(1).maybeSingle<{
          id:string;starts_at:string;minutes:number;status:string;expires_at:string
        }>()
      : { data: null, error: null };
  const instructorName = booking.instructor?.full_name ?? 'Instrutor a confirmar';
  const avatarUrl = booking.instructor_id
    ? await getStudentBookingInstructorAvatar(booking.id)
    : null;

  // Do not announce cancelled/completed bookings as "confirmed".
  const heroCopy = booking.status==='confirmed' && booking.instructor_id===null
    ? {eyebrow:'Reserva mantida',title:'Buscando novo instrutor.',
        lead:'Seus encontros, valores e código de reserva foram preservados. Você receberá uma notificação quando outro profissional aceitar.'}
    : booking.status === 'awaiting_payment'
    ? {
      eyebrow: VALIDATION_WITHOUT_CHECKOUT ? 'Validação da aula' : 'Aguardando pagamento',
      title: VALIDATION_WITHOUT_CHECKOUT ? 'Confirme sua aula, sem cobrança.' : 'Falta só confirmar o pagamento.',
      lead: VALIDATION_WITHOUT_CHECKOUT ? 'O instrutor aceitou. Confirme para testar a aula, o chat e sua evolução.' : 'Confira os dados da reserva e conclua a etapa de pagamento para garantir a aula.',
    }
    : booking.status === 'cancelled'
      ? {
        eyebrow: 'Reserva cancelada',
        title: booking.is_test ? 'Aula teste cancelada.' : 'Sua reserva foi cancelada.',
        lead: 'Esta reserva não está mais ativa. Consulte os detalhes e as regras de cancelamento.',
      }
      : booking.status === 'completed'
        ? {
          eyebrow: booking.is_test ? 'Aula de demonstração' : 'Aula concluída',
          title: booking.is_test ? 'Aula teste concluída.' : 'Sua aula foi concluída.',
          lead: 'Confira os registros e acompanhe sua evolução no kite.',
        }
        : {
          eyebrow: booking.is_test ? 'Aula de demonstração' : 'Seu próximo bordo',
          title: booking.is_test ? 'Sua aula teste está agendada.' : 'Sua aula está confirmada.',
          lead: booking.is_test
            ? 'Esta aula é uma simulação sem cobrança. Confira os detalhes e o horário combinado.'
            : 'Tudo organizado. Confira os detalhes e encontre seu instrutor.',
        };

  const statusStyles: Record<typeof booking.status, string> = {
    awaiting_payment: 'border-[#b98b40] bg-[#423418] text-[#ffdfa0]',
    confirmed: 'border-[#3a9d8b] bg-[#0c514c] text-[#bcfff1]',
    completed: 'border-[#428da6] bg-[#104960] text-[#c0efff]',
    cancelled: 'border-[#a46c75] bg-[#4b2835] text-[#ffdce3]',
  };

  return (
    <>
      <StudentHero
        eyebrow={heroCopy.eyebrow}
        title={heroCopy.title}
        lead={heroCopy.lead}
        compact
        image="lesson"
      />

      <div className="mt-6 grid gap-5 lg:grid-cols-[1.5fr_1fr]">
        <div className="grid content-start gap-5">
          <Card>
            <div className="border-b border-[#16728a]/60 pb-4">
              <p className="text-[11px] font-bold uppercase tracking-[.18em] text-[#56dce7]">
                Detalhes da reserva
              </p>
              <h2 className="mt-2 text-[21px] font-extrabold leading-[1.2] tracking-[-.5px] text-ink sm:text-[23px]">
                Aula particular de kitesurf
              </h2>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span
                  className={'inline-flex min-h-8 items-center gap-1.5 rounded-full border px-3 py-1 text-[12px] font-bold ' + statusStyles[booking.status]}
                >
                  <Icon name={booking.status === 'confirmed' || booking.status === 'completed' ? 'check' : booking.status === 'cancelled' ? 'back' : 'clock'}
                    className="!h-3.5 !w-3.5" />
                  {VALIDATION_WITHOUT_CHECKOUT && awaiting ? 'Aguardando sua confirmação' : BOOKING_STATUS_LABELS[booking.status]}
                </span>
                {booking.is_test ? (
                  <span className="inline-flex min-h-8 items-center rounded-full border border-[#b97743] bg-[#382e29] px-3 py-1 text-[12px] font-semibold text-[#ffd1a9]">
                    Aula teste · sem cobrança
                  </span>
                ) : null}
              </div>
            </div>

            <div className="mt-5 flex items-center gap-3 rounded-[18px] border border-[#16748e] bg-[#063e59] p-3">
              <StudentInstructorPhoto name={instructorName} url={avatarUrl} />
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-medium text-[#bad5e3]">Seu instrutor</p>
                <p className="mt-0.5 truncate text-[17px] font-bold leading-tight text-white">
                  {instructorName}
                </p>
                <p className="mt-1 text-[12px] text-[#b9d5e5]">Idioma: {booking.language}</p>
              </div>
            </div>

            <dl className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {([
                ['Praia', booking.beach?.name ?? 'Não definida', 'pin'],
                ['Seu nível', LEVEL_LABELS[booking.level], 'kite'],
                ['Duração total', formatMinutes(booking.total_hours * 60), 'clock'],
                ['Equipamentos', 'Inclusos na aula', 'shield'],
              ] as const).map(([label, value, icon]) => (
                <div key={label}
                  className="flex min-w-0 items-center gap-3 rounded-[15px] border border-[#126887]/70 bg-[#053650]/70 px-3 py-3">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#0a526d] text-[#36d9e9]">
                    <Icon name={icon} className="!h-5 !w-5" />
                  </span>
                  <div className="min-w-0">
                    <dt className="text-[12px] font-medium text-[#bad0e1]">{label}</dt>
                    <dd className="mt-0.5 break-words text-[15px] font-bold leading-snug text-[#f6fbff]">{value}</dd>
                  </div>
                </div>
              ))}
            </dl>
            {booking.status==='confirmed' && booking.instructor_id===null ? (
              <Note tone="warning" className="mt-4">
                {reassignmentState?.status==='unfilled'
                  ? 'Ainda não encontramos instrutor disponível. A equipe precisa verificar a fila; sua reserva não foi cancelada.'
                  : 'Buscando outro instrutor na fila. Sua reserva permanece confirmada, mas os encontros só poderão acontecer após uma nova atribuição.'}
              </Note>
            ) : null}
            {!awaiting && meetingPoint ? (
              <div className="mt-5 rounded-xl border border-line bg-brand-tint p-4">
                <h3 className="text-[14px] font-bold text-ink">Ponto de encontro</h3>
                <p className="mt-2 text-[13px] font-semibold text-brand">{meetingPoint.title}</p>
                {meetingPoint.details ? <p className="mt-1 text-[12px] text-muted">{meetingPoint.details}</p> : null}
                <a href={`https://www.google.com/maps?q=${meetingPoint.latitude},${meetingPoint.longitude}`}
                  target="_blank" rel="noopener noreferrer" className="mt-2 inline-block text-[13px] font-semibold text-brand underline">
                  Abrir localização no mapa
                </a>
              </div>
            ) : null}
            <h3 className="mt-6 text-[14px]">Encontros</h3>
            <ul className="mt-3 grid gap-2">
              {booking.booking_meetings.map((meeting) => (
                <li key={meeting.id} className="rounded-search border border-line px-4 py-3 text-[12px]">
                  <div className="flex items-center justify-between gap-3">
                    <span>
                      <strong className="block font-[550]">{formatDateLong(meeting.starts_at)} · {formatTime(meeting.starts_at)}</strong>
                      <span className="text-muted">{formatMinutes(meeting.minutes)}{meeting.status === 'done' ? ` · ${formatMinutes(meeting.done_minutes)} realizados` : ''}</span>
                    </span>
                    <Badge tone={meeting.status === 'done' ? 'quiet' : 'brand'}>{MEETING_STATUS_LABELS[meeting.status]}</Badge>
                  </div>
                  {booking.status==='confirmed' && booking.instructor_id!==null && meeting.status==='scheduled' ? (
                    <MeetingChangePanel
                      bookingId={booking.id} meeting={meeting}
                      viewerId={viewer.id}
                      viewerRole="student" bookingStatus={booking.status}
                      changes={changeRequests}
                    />
                  ) : null}
                </li>
              ))}
            </ul>
            <nav aria-label="Ações da reserva" className="mt-5 grid w-full gap-2.5">
              {!awaiting && booking.status !== 'cancelled' ? (
                <ButtonLink
                  href={`/aluno/atendimento/${booking.id}`}
                  icon="chat"
                  className={reservationActionClass}
                >
                  Conversar com meu instrutor
                </ButtonLink>
              ) : null}
              {booking.status === 'completed' && booking.instructor_id && balance.available === 0 ? (
                <ButtonLink
                  href={`/aluno/reservar?instrutor=${booking.instructor_id}&praia=${booking.beach_id}&nivel=${booking.level}&idioma=${encodeURIComponent(booking.language)}&horas=${booking.total_hours}`}
                  variant="ghost"
                  icon="refresh"
                  className={reservationActionClass}
                >
                  Contratar este instrutor novamente
                </ButtonLink>
              ) : null}
              <Link
                href="/aluno/ocorrencias"
                className="mx-auto inline-flex min-h-11 items-center justify-center px-2 py-2 text-center text-[13px] font-medium leading-snug text-[#73e1eb] underline underline-offset-4 transition-colors hover:text-white focus-visible:rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#73e1eb]"
              >
                Imprevistos, cancelamento ou ausência
              </Link>
            </nav>
          </Card>

          <Card>
            <div className="flex items-center justify-between">
              <h2 className="text-[16px]">Seu saldo de aprendizado</h2>
              <span className="tabular font-[550]">{formatMinutes(balance.contracted)}</span>
            </div>
            <div className="mt-4">
              <ProgressBar donePercent={donePercent} reservedPercent={reservedPercent} />
            </div>
            <p className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-muted">
              <span>● {formatMinutes(balance.done)} realizadas</span>
              <span>● {formatMinutes(balance.scheduled)} agendadas</span>
              <span>○ {formatMinutes(balance.available)} disponíveis</span>
            </p>
            <Link href="/aluno/evolucao" className="mt-4 inline-flex items-center gap-1.5 text-[13px] font-[550] text-brand">
              <Icon name="arrow" className="!h-4 !w-4" /> Acompanhar minha evolução
            </Link>
            {booking.status === 'completed' && booking.instructor_id && balance.available > 0 ? (
              <div className="mt-5 border-t border-line pt-4">
                <h3 className="text-[15px] font-bold text-ink">Reagendar horas restantes</h3>
                <p className="mt-1 text-[12px] text-muted">
                  Você ainda tem {formatMinutes(balance.available)} desta reserva.
                  Solicite ao mesmo instrutor, sem fazer uma nova contratação.
                </p>
                {balanceRequestError ? (
                  <Note tone="warning" className="mt-3">
                    A reposição depende da atualização 38 do Supabase.
                  </Note>
                ) : balanceRequest?.status === 'pending' &&
                    Date.parse(balanceRequest.expires_at) > Date.now() ? (
                  <Note tone="warning" className="mt-3">
                    Pedido de {formatMinutes(balanceRequest.minutes)} para {formatDateLong(balanceRequest.starts_at)}
                    {' · '}{formatTime(balanceRequest.starts_at)} enviado ao instrutor. Prazo de resposta: 12 horas.
                  </Note>
                ) : (
                  <ActionForm action={requestBookingBalance}
                    submitLabel="Solicitar reposição" className="mt-3 grid gap-3">
                    <input type="hidden" name="bookingId" value={booking.id} />
                    <Field label="Novo dia e horário (mínimo 72 horas de antecedência)">
                      <input className={inputClass} type="datetime-local" name="proposedDate" required />
                    </Field>
                    <Field label="Minutos a utilizar do saldo">
                      <input className={inputClass} type="number" name="minutes"
                        min={1} max={Math.min(balance.available,480)}
                        defaultValue={Math.min(balance.available,480)} required />
                    </Field>
                    <p className="text-[12px] text-muted">
                      O encontro só aparecerá na agenda após a aceitação do instrutor.
                      Nenhuma nova cobrança será gerada.
                    </p>
                  </ActionForm>
                )}
              </div>
            ) : null}
          </Card>
        </div>

        <div className="grid content-start gap-5">
          {booking.status === 'completed' ? (
            <Card>
              <h2 className="text-[17px] font-bold text-ink">Avalie seu instrutor</h2>
              <p className="mt-1 text-[12px] text-muted">Sua experiência ajuda a melhorar o Vento.</p>
              {rated?.error ? (
                <Note tone="warning" className="mt-4">As avaliações precisam ser ativadas no Supabase.</Note>
              ) : rated?.data ? (
                <div className="mt-4">
                  <p className="text-[18px] font-semibold text-brand">{'★'.repeat(rated.data.stars)}{'☆'.repeat(5-rated.data.stars)}</p>
                  <p className="mt-2 text-[13px] text-muted">Sua avaliação já foi enviada. Obrigado!</p>
                </div>
              ) : (
              <ActionForm action={rateInstructor} submitLabel="Enviar avaliação" className="mt-4 grid gap-3">
                <input type="hidden" name="bookingId" value={booking.id}/>
                <label htmlFor="rating-stars" className="text-[13px] font-semibold text-ink">Sua nota</label>
                <select id="rating-stars" name="stars" defaultValue="5" required
                  className="min-h-12 rounded-xl border border-line bg-surface px-3 text-[13px] text-ink">
                  <option value="5">★★★★★ — Excelente</option>
                  <option value="4">★★★★☆ — Muito bom</option>
                  <option value="3">★★★☆☆ — Bom</option>
                  <option value="2">★★☆☆☆ — Regular</option>
                  <option value="1">★☆☆☆☆ — Ruim</option>
                </select>
                <label htmlFor="rating-comment" className="text-[13px] font-semibold text-ink">Comentário (opcional)</label>
                <textarea id="rating-comment" name="comment" maxLength={500} rows={3}
                  className="w-full rounded-xl border border-line bg-surface p-3 text-[13px] text-ink"
                  placeholder="Como foi sua aula?"/>
              </ActionForm>
              )}
            </Card>
          ) : null}
          {booking.status === 'confirmed' ? (
            <Card className="text-center">
              <Eyebrow>Na hora da aula</Eyebrow>
              <h2 className="mt-2 text-[16px]">Seu código de presença</h2>
              <p className="mt-1 text-[12px] text-muted">Mostre ao instrutor para iniciar o atendimento.</p>
              <p className="tabular mt-4 rounded-search border border-line bg-brand-tint py-5 text-[36px] font-semibold tracking-[4px] text-brand">
                {booking.presence_code}
              </p>
              <p className="mt-3 text-[11px] text-muted">Reserva {booking.code}</p>
            </Card>
          ) : null}
          <Card>
            <div className="flex items-center justify-between">
              <span className="text-[13px] text-label">{VALIDATION_WITHOUT_CHECKOUT ? 'Validação da plataforma' : booking.is_test ? 'Simulação' : 'Pagamento'}</span>
              <Badge tone={booking.is_test || awaiting || booking.status === 'cancelled' ? 'warning' : 'success'}>{VALIDATION_WITHOUT_CHECKOUT || booking.is_test ? 'Sem cobrança' : awaiting ? 'Pendente' : booking.status === 'cancelled' ? 'Reserva cancelada' : 'Confirmado'}</Badge>
            </div>
            <div className="mt-4 flex items-center justify-between">
              <span className="text-[13px] text-label">Total da reserva</span>
              <strong className="tabular text-[24px] font-semibold tracking-[-0.7px] text-brand">{formatMoney(booking.total_cents)}</strong>
            </div>
            {VALIDATION_WITHOUT_CHECKOUT ? <p className="mt-2 text-[12px] font-semibold text-brand">Valores de referência. Nesta fase não há checkout nem cobrança.</p> : booking.is_test ? <p className="mt-2 text-[12px] font-semibold text-brand">Demonstração sem cobrança, sem comissão e sem repasse.</p> : null}
            <p className="tabular mt-1 text-right text-[11px] text-muted">
              Aula: {booking.total_hours}h × {formatMoney(booking.hourly_rate_cents)}/hora
              {booking.with_transport ? (
                <>
                  <br />
                  Transporte de apoio: {booking.total_hours}h × {formatMoney(booking.transport_hourly_cents)}/hora ={' '}
                  {formatMoney(booking.transport_cents)}
                </>
              ) : null}
            </p>
            {awaiting && VALIDATION_WITHOUT_CHECKOUT ? (
              <ActionForm action={confirmValidationLesson} submitLabel="Confirmar aula sem cobrança" className="mt-4 border-t border-line pt-4" wideSubmit>
                <input type="hidden" name="bookingId" value={booking.id} />
              </ActionForm>
            ) : awaiting ? (
              <div className="mt-4 border-t border-line pt-4">
                <ActionForm action={confirmTestPayment} submitLabel="Confirmar pagamento de teste" className="grid gap-3" wideSubmit>
                  <input type="hidden" name="bookingId" value={booking.id} />
                  <fieldset>
                    <legend className="mb-2 text-[13px] font-semibold text-ink">Forma de pagamento (simulação)</legend>
                    <div className="grid grid-cols-2 gap-2">
                      <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-line px-3 py-3 text-[13px]">
                        <input type="radio" name="method" value="pix" defaultChecked className="accent-cyan-500"/> PIX
                      </label>
                      <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-line px-3 py-3 text-[13px]">
                        <input type="radio" name="method" value="card" className="accent-cyan-500"/> Cartão de crédito
                      </label>
                    </div>
                  </fieldset>
                  <label htmlFor="test-outcome" className="text-[13px] font-semibold text-ink">Resultado do teste</label>
                  <select id="test-outcome" name="outcome" defaultValue="approved" className="min-h-12 rounded-xl border border-line bg-surface px-3 text-[13px] text-ink">
                    <option value="approved">Pagamento aprovado</option>
                    <option value="pending">Pagamento pendente</option>
                    <option value="declined">Pagamento recusado</option>
                  </select>
                </ActionForm>
                <Note tone="warning" className="mt-3">
                  Pagamento simulado: nenhuma cobrança é feita. A integração com o provedor de pagamento vem na próxima etapa.
                </Note>
              </div>
            ) : null}
          </Card>
        </div>
      </div>
    </>
  );
}
