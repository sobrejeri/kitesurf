import Link from 'next/link';

import { Icon } from '@/components/icon';
import type { StudentBooking } from '@/lib/data';
import type { StudentKiteLevel } from '@/lib/student-kite-level';
import { studentHomeSummary } from '@/lib/student-home';
import { formatDateLong, formatMinutes, formatTime } from '@/lib/format';
import { KITE_LEVEL_BADGES } from '@/lib/kite-steps';
import { lessonEvolutionHref } from '@/lib/student-lesson-links';
import { initials } from '@/lib/people';
import styles from './home-dashboard.module.css';

/**
 * Aluno / Início — VentoKite.
 * Visual-only redesign. Existing booking, progress, support and search links
 * remain intact; figures and status are read from the student's own records.
 */
export function HomeDashboard({
  bookings,
  level,
  firstName,
  instructorPhotoUrl = null,
}: {
  bookings: StudentBooking[];
  level: StudentKiteLevel | null;
  firstName?: string;
  instructorPhotoUrl?: string | null;
}) {
  const summary = studentHomeSummary(bookings);
  const { current, booking } = summary;
  const agendaUpcoming = summary.upcoming.filter((item) => item.meeting.id !== current?.meeting.id);
  const currentLabel = current?.meeting.status === 'in_progress'
    ? 'Aula em andamento'
    : current && summary.upcoming.some((item) => item.meeting.id === current.meeting.id)
      ? 'Sua próxima aula'
      : 'Encontro aguardando registro';

  return (
    <section className={styles.dashboard} aria-labelledby="student-dashboard-title">
      <header className={styles.welcome}>
        <img
          src="/images/kite-lesson.webp"
          alt=""
          width={1254}
          height={1254}
          className={styles.heroPhoto}
          fetchPriority="high"
        />
        <div className={styles.heroShade} aria-hidden="true" />
        <div className={styles.heroContent}>
          <div className={styles.heroBrand} aria-label="VentoKite, aulas de kitesurf">
            <span className={styles.brandName}>Vento<span>Kite</span></span>
            <span className={styles.brandDescriptor}>AULAS DE KITESURF <Icon name="waves" /></span>
          </div>
          <span className={styles.eyebrow}>SEU ESPAÇO NO KITE</span>
          <h1 id="student-dashboard-title">Bons ventos,<br /><em>{firstName || 'aluno'}!</em></h1>
          <p>Seu próximo encontro e cada conquista, no seu ritmo.</p>
          <a href="#buscar-aula" className={styles.searchLink}>
            <Icon name="calendar" />
            Agendar nova aula
            <Icon name="arrow" />
          </a>
        </div>
      </header>

      {summary.pending.map((pending) => (
        <div className={styles.pending} key={pending.id} role="status">
          <span><strong>Confirme sua aula</strong> · Reserva {pending.code}</span>
          <Link href={'/aluno/reserva/' + pending.id}>Revisar reserva <Icon name="arrow" /></Link>
        </div>
      ))}

      <div className={styles.cards}>
        <article className={[styles.card, styles.next].join(' ')}>
          {current ? (
            <>
              <Link
                className={styles.nextLink}
                href={current.meeting.status === 'in_progress'
                  ? lessonEvolutionHref(current.booking.id, current.meeting.id)
                  : '/aluno/reserva/' + current.booking.id}
                aria-label={'Ver minha aula de ' + formatDateLong(current.meeting.starts_at)}
              />
              <span className={styles.status}>
                <Icon name={current.meeting.status === 'in_progress' ? 'clock' : 'check'} />
                {current.meeting.status === 'in_progress'
                  ? 'Em andamento'
                  : current.booking.status === 'confirmed'
                    ? 'Confirmada'
                    : 'Agendada'}
              </span>
              <div className={styles.nextBody}>
                <div className={styles.instructorCol}>
                  <div className={styles.instructorPhoto}>
                    {instructorPhotoUrl
                      ? <img src={instructorPhotoUrl} alt="" />
                      : <span className={styles.instructorInitials}>{initials(current.booking.instructor?.full_name)}</span>}
                    <span className={styles.seal} aria-hidden="true"><Icon name="check" /></span>
                  </div>
                  <span className={styles.instructorName}>{(current.booking.instructor?.full_name ?? 'Instrutor').split(' ')[0]}</span>
                </div>
                <div className={styles.nextDetails}>
                  <span className={styles.label}><Icon name="calendar" />{currentLabel}</span>
                  <strong className={styles.nextWhen}>{formatDateLong(current.meeting.starts_at)}</strong>
                  <p className={styles.nextMeta}>
                    <span className={styles.metaItem}><Icon name="clock" />{formatTime(current.meeting.starts_at)} · {formatMinutes(current.meeting.minutes)}</span>
                    <span className={styles.metaItem}><Icon name="pin" />{current.booking.beach?.name ?? 'Praia da reserva'}</span>
                  </p>
                  <span className={styles.bookingCode}>{current.booking.code}</span>
                </div>
              </div>
              <Link className={styles.chatBtn} href={'/aluno/atendimento/' + current.booking.id} aria-label="Conversar com meu instrutor">
                <Icon name="chat" />
              </Link>
            </>
          ) : (
            <>
              <div className={styles.nextHeading}>
                <span className={styles.label}><Icon name="calendar" />Seu próximo encontro</span>
              </div>
              <div className={styles.emptyLesson}>
                <h2>O mar espera por você.</h2>
                <p>Escolha um novo dia para continuar sua jornada.</p>
                <a href="#buscar-aula" className={styles.primary}>Encontrar minha aula <Icon name="arrow" /></a>
              </div>
            </>
          )}
        </article>

        <div className={styles.insights}>
          <article className={[styles.card, styles.insightCard].join(' ')}>
            <span className={styles.label}><Icon name="clock" />Horas da reserva</span>
            {booking ? (
              <>
                <h2 className={styles.progressTitle}>{formatMinutes(summary.recordedMinutes)} <span>de {formatMinutes(summary.totalMinutes)}</span></h2>
                <div
                  className={styles.progress}
                  role="progressbar"
                  aria-label={'Horas registradas na reserva ' + booking.code}
                  aria-valuenow={summary.percent}
                  aria-valuemin={0}
                  aria-valuemax={100}
                ><span style={{ width: summary.percent + '%' }} /></div>
                <p aria-label={formatMinutes(summary.remainingMinutes) + ' ainda não registradas pelo instrutor.'}><span className={styles.mobileSummary}>{formatMinutes(summary.remainingMinutes)} pendentes</span><span className={styles.desktopSummary}>{formatMinutes(summary.remainingMinutes)} ainda não registradas pelo instrutor.</span></p>
                <Link className={styles.cardArrow} href={'/aluno/evolucao?reserva=' + booking.id + '#reserva-' + booking.id} aria-label="Acompanhar evolução das horas">
                  <Icon name="arrow" />
                </Link>
              </>
            ) : (
              <><h2>Vamos começar?</h2><p>Seu progresso aparecerá após a primeira aula.</p></>
            )}
          </article>

          <article className={[styles.card, styles.insightCard, styles.levelCard].join(' ')}>
            <span className={styles.label}><Icon name="chart" />Seu nível no kite</span>
            <h2>{level?.assessed ? KITE_LEVEL_BADGES[level.assessed].label : 'Em acompanhamento'}</h2>
            <p><span className={styles.mobileSummary}>{level?.assessed ? 'Avaliado pelo instrutor' : 'Nível em avaliação'}</span><span className={styles.desktopSummary}>{level?.assessed ? 'Nível avaliado pelo instrutor.' : 'Seu instrutor acompanha seu nível ao longo das aulas.'}</span></p>
            {level?.assessedAt ? <small>Avaliação de {formatDateLong(level.assessedAt)}</small> : null}
            <Link href="/aluno/evolucao" className={styles.cardArrow} aria-label="Ver minhas conquistas"><Icon name="arrow" /></Link>
          </article>
        </div>
      </div>

      {summary.unrecorded.length ? (
        <p className={styles.footnote}>
          <Icon name="clock" />
          <span>{summary.unrecorded.length} encontro(s) com data passada ainda aguardam registro do instrutor.</span>
          <Link href="/aluno/aulas?aba=anteriores">Consultar histórico <Icon name="arrow" /></Link>
        </p>
      ) : null}

      {agendaUpcoming.length ? (
        <>
          <div className={styles.agendaHeading}>
            <h2>Na sua agenda</h2>
            <Link href="/aluno/aulas">Ver todas as aulas <Icon name="arrow" /></Link>
          </div>
          <ul className={styles.agenda}>
            {agendaUpcoming.slice(0, 3).map(({ booking: item, meeting }) => (
              <li key={meeting.id}>
                <span className={styles.date}><Icon name="calendar" />{formatDateLong(meeting.starts_at)}</span>
                <span>
                  <strong>{item.beach?.name ?? 'Sua praia'}</strong>
                  <small>{formatTime(meeting.starts_at)} · {formatMinutes(meeting.minutes)} · {item.code}</small>
                </span>
                <Link href={'/aluno/reserva/' + item.id} aria-label={'Ver reserva ' + item.code + ' em ' + formatDateLong(meeting.starts_at)}>
                  <Icon name="arrow" />
                </Link>
              </li>
            ))}
          </ul>
        </>
      ) : null}

      <div className={styles.searchHeading}>
        <img src="/images/prea-coast.webp" alt="" loading="lazy" />
        <div className={styles.promoShade} aria-hidden="true" />
        <div className={styles.promoContent}>
          <span className={styles.eyebrow}>CONTINUE NO SEU RITMO</span>
          <h2>Seu próximo<br />bordo começa aqui.</h2>
          <a href="#buscar-aula">Escolher uma aula <Icon name="arrow" /></a>
        </div>
      </div>
    </section>
  );
}
