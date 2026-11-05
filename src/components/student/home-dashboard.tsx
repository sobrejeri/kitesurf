import Link from 'next/link';
import {Icon} from '@/components/icon';
import type {StudentBooking} from '@/lib/data';
import type {StudentKiteLevel} from '@/lib/student-kite-level';
import {studentHomeSummary} from '@/lib/student-home';
import {formatDateLong,formatMinutes,formatTime} from '@/lib/format';
import {KITE_LEVEL_BADGES} from '@/lib/kite-steps';
import {lessonEvolutionHref} from '@/lib/student-lesson-links';
import styles from './home-dashboard.module.css';

export function HomeDashboard({bookings,level,firstName}:{bookings:StudentBooking[];level:StudentKiteLevel|null;firstName?:string}){
  const summary=studentHomeSummary(bookings);
  const {current,booking}=summary;
  // The next lesson is featured in the card above, so the agenda lists only the
  // meetings after it — no duplication of the same encounter.
  const agendaUpcoming=summary.upcoming.filter(e=>e.meeting.id!==current?.meeting.id);
  const currentLabel=current?.meeting.status==='in_progress'?'Aula em andamento':
    current && summary.upcoming.some(e=>e.meeting.id===current.meeting.id)?'Sua próxima aula':'Encontro aguardando registro';
  return <section className={styles.dashboard} aria-labelledby="student-dashboard-title">
    <header className={styles.welcome}>
      <img src="/images/prea-real-1600.webp" alt="" width={1600} height={941}/>
      <div><span className={styles.eyebrow}>SEU ESPAÇO NO KITE</span>
        <h1 id="student-dashboard-title">Bons ventos, {firstName || 'aluno'}.</h1>
        <p>Seu próximo encontro e cada conquista, no seu ritmo.</p>
        <a href="#buscar-aula" className={styles.searchLink}>Agendar nova aula <Icon name="arrow"/></a>
      </div>
      <a className={styles.credit} href="https://commons.wikimedia.org/wiki/File:Praia_do_prea_-_cruz_-_ceara.jpg" target="_blank" rel="noopener noreferrer">Foto: Fabiobarros · CC BY-SA 4.0</a>
    </header>
    {summary.pending.map(p=><div className={styles.pending} key={p.id}><span><strong>Confirme sua aula</strong> · Reserva {p.code}</span><Link href={`/aluno/reserva/${p.id}`}>Revisar reserva <Icon name="arrow"/></Link></div>)}
    <div className={styles.cards}>
      <article className={`${styles.card} ${styles.next}`}>
        <span className={styles.label}><Icon name="calendar"/>{current?currentLabel:'Seu próximo encontro'}</span>
        {current?<>
          <p className={styles.nextWhen}><strong>{formatDateLong(current.meeting.starts_at)}</strong><span>{formatTime(current.meeting.starts_at)} · {formatMinutes(current.meeting.minutes)}</span></p>
          <p className={styles.nextMeta}>{current.booking.beach?.name ?? 'Praia da reserva'} · {current.booking.instructor?.full_name ?? 'Seu instrutor'} · {current.booking.code}</p>
          <div className={styles.actions}><Link className={styles.primary} href={current.meeting.status==='in_progress'?lessonEvolutionHref(current.booking.id,current.meeting.id):`/aluno/reserva/${current.booking.id}`}>Ver minha aula <Icon name="arrow"/></Link>
            <Link href={`/aluno/atendimento/${current.booking.id}`} aria-label="Conversar com meu instrutor"><Icon name="chat"/> Conversar</Link></div>
        </>:<><h2>O mar espera por você.</h2><p>Escolha um novo dia para continuar sua jornada.</p><a href="#buscar-aula" className={styles.primary}>Encontrar minha aula <Icon name="arrow"/></a></>}
      </article>
      <article className={styles.card}>
        <span className={styles.label}><Icon name="clock"/>Suas horas nesta reserva</span>
        {booking?<><h2>{formatMinutes(summary.recordedMinutes)} <span>de {formatMinutes(summary.totalMinutes)}</span></h2>
          <p>Registradas pelo instrutor</p>
          <div className={styles.progress} role="progressbar" aria-label={`Horas registradas na reserva ${booking.code}`} aria-valuenow={summary.percent} aria-valuemin={0} aria-valuemax={100}><span style={{width:`${summary.percent}%`}}/></div>
          <small>Reserva {booking.code}</small>
          <p>{formatMinutes(summary.remainingMinutes)} ainda não registradas.</p>
          <Link className={styles.textLink} href={`/aluno/evolucao?reserva=${booking.id}#reserva-${booking.id}`}>Acompanhar evolução <Icon name="arrow"/></Link>
        </>:<><h2>Vamos começar?</h2><p>Seu progresso aparece após a confirmação da primeira aula.</p></>}
      </article>
      <article className={styles.card}>
        <span className={styles.label}><Icon name="chart"/>Seu nível no kite</span>
        <h2>{level?.assessed?KITE_LEVEL_BADGES[level.assessed].label:'Em acompanhamento'}</h2>
        <p>{level?.assessed?'Nível avaliado pelo instrutor.':'Seu instrutor registra suas habilidades e avalia seu nível ao longo das aulas.'}</p>
        {level?.assessedAt?<small>Avaliação de {formatDateLong(level.assessedAt)}</small>:null}
        <Link href="/aluno/evolucao" className={styles.textLink}>Ver minhas conquistas <Icon name="arrow"/></Link>
      </article>
    </div>
    {agendaUpcoming.length?<>
    <div className={styles.agendaHeading}><h2>Na sua agenda</h2><Link href="/aluno/aulas">Ver todas as aulas <Icon name="arrow"/></Link></div>
    <ul className={styles.agenda}>{agendaUpcoming.slice(0,3).map(({booking:b,meeting:m})=><li key={m.id}><span className={styles.date}><Icon name="calendar"/>{formatDateLong(m.starts_at)}</span><span><strong>{b.beach?.name ?? 'Sua praia'}</strong><small>{formatTime(m.starts_at)} · {formatMinutes(m.minutes)} · {b.code}</small></span><Link href={`/aluno/reserva/${b.id}`} aria-label={`Ver reserva ${b.code} em ${formatDateLong(m.starts_at)}`}><Icon name="arrow"/></Link></li>)}</ul>
    </>:null}
    {summary.unrecorded.length?<p className={styles.footnote}>{summary.unrecorded.length} encontro(s) com data passada ainda aguardam registro do instrutor. <Link href="/aluno/aulas?aba=anteriores">Consultar histórico</Link></p>:null}
    <div className={styles.searchHeading}><span className={styles.eyebrow}>CONTINUE NO SEU RITMO</span><h2>Seu próximo bordo</h2></div>
  </section>;
}
