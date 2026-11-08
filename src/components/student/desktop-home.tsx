import Link from 'next/link';
import type {CSSProperties,ReactNode} from 'react';
import { Icon } from '@/components/icon';
import type { StudentBooking } from '@/lib/data';
import type { StudentKiteLevel } from '@/lib/student-kite-level';
import { studentHomeSummary } from '@/lib/student-home';
import { KITE_LEVEL_BADGES } from '@/lib/kite-steps';
import { formatDateLong,formatTime,formatMinutes } from '@/lib/format';
import { lessonEvolutionHref } from '@/lib/student-lesson-links';

export function DesktopStudentHome({bookings,level,firstName,children}:{
  bookings:StudentBooking[];
  level:StudentKiteLevel|null;
  firstName?:string;
  children?:ReactNode;
}) {
  const summary=studentHomeSummary(bookings);
  const current=summary.current;
  const studentLevel=level?KITE_LEVEL_BADGES[level.effective].label:'Acompanhe sua evolução';
  const instructor=current?.booking.instructor?.full_name ?? 'Instrutor a confirmar';
  return <div className="vento-pc-page vento-pc-home">
    <div className="vento-pc-page-heading">
      <span className="vento-pc-overline">SEU ESPAÇO NO KITE</span>
      <h1>Explore, agende e evolua <em>no kitesurf.</em></h1>
      <p>Acompanhe suas aulas, progresso e próximos encontros.</p>
    </div>
    <div className="vento-pc-home-grid">
      <section className="vento-pc-next-hero" aria-labelledby="vento-pc-next-heading">
        <div className="vento-pc-next-shade"/>
        <div className="vento-pc-next-content">
          <span className="vento-pc-level-pill"><Icon name="kite"/> Kitesurf — {studentLevel}</span>
          <h2 id="vento-pc-next-heading">Próxima <em>aula</em></h2>
          {current ? <>
            <dl className="vento-pc-next-fields">
              <div><Icon name="calendar"/><dt>Dia</dt><dd>{formatDateLong(current.meeting.starts_at)}</dd></div>
              <div><Icon name="clock"/><dt>Horário</dt><dd>{formatTime(current.meeting.starts_at)} · {formatMinutes(current.meeting.minutes)}</dd></div>
              <div><Icon name="pin"/><dt>Local</dt><dd>{current.booking.beach?.name ?? 'Local a confirmar'}</dd></div>
            </dl>
            <div className="vento-pc-next-instructor">
              <Icon name="user"/>
              <span>Seu instrutor <strong>{instructor}</strong></span>
            </div>
            <Link className="vento-pc-primary" href={current.meeting.status==='in_progress'?
              lessonEvolutionHref(current.booking.id,current.meeting.id):`/aluno/reserva/${current.booking.id}`}>
              Ver detalhes <Icon name="arrow"/>
            </Link>
          </>:<>
            <p className="vento-pc-no-lesson">Sua próxima conquista começa com uma aula. Escolha seus dias e suas horas.</p>
            <Link href="/aluno/reservar" className="vento-pc-primary">Agendar minha aula <Icon name="arrow"/></Link>
          </>}
        </div>
      </section>
      <aside className="vento-pc-welcome-card">
        <h2>Olá, {firstName||'aluno'}! <span aria-hidden="true">👋</span></h2>
        <p>Bom ter você de volta ao VentoKite.</p>
        <div className="vento-pc-progress-panel">
          <h3><Icon name="chart"/> Seu progresso no kite</h3>
          <div className="vento-pc-progress-row">
            <div className="vento-pc-ring" style={{'--vento-progress':`${summary.percent}%`} as CSSProperties}
              role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={summary.percent}
              aria-label="Percentual de horas registradas na reserva">
              <strong>{summary.percent}%</strong><span>da reserva</span>
            </div>
            <div className="vento-pc-level-list">
              <strong>Nível atual</strong>
              <span><Icon name="check"/> {studentLevel}</span>
              {summary.booking ? <small>{formatMinutes(summary.recordedMinutes)} de {formatMinutes(summary.totalMinutes)} registradas</small>
              : <small>O progresso aparece quando suas aulas forem registradas.</small>}
              <Link href="/aluno/evolucao">Ver minha evolução <Icon name="arrow"/></Link>
            </div>
          </div>
        </div>
        {summary.pending.length ? <div className="vento-pc-pending">
          <Icon name="clock"/> {summary.pending.length} reserva(s) aguardando confirmação
          <Link href={`/aluno/reserva/${summary.pending[0].id}`}>Revisar</Link>
        </div>:null}
        {summary.unrecorded.length ? <Link className="vento-pc-unrecorded" href="/aluno/aulas?aba=anteriores">
          {summary.unrecorded.length} encontro(s) aguardam registro do instrutor <Icon name="arrow"/>
        </Link>:null}
      </aside>
    </div>
    {children ? <section className="vento-pc-first-booking" aria-label="Escolher e reservar uma aula">
      <h2>Encontre sua primeira aula</h2>{children}
    </section>:null}
    <section className="vento-pc-explore-section" aria-labelledby="vento-pc-explore-title">
      <div className="vento-pc-section-head">
        <h2 id="vento-pc-explore-title">Explorar <em>aulas</em></h2>
        <Link href="/aluno/reservar">Agendar uma aula <Icon name="arrow"/></Link>
      </div>
      <div className="vento-pc-explore-grid">
        <Link href="/aluno/reservar" className="vento-pc-explore-tile">
          <img src="/images/kite-lesson.webp" alt="" loading="lazy"/>
          <span><Icon name="book"/><strong>Aulas de kitesurf</strong><small>Escolha o nível e comece no seu ritmo.</small><Icon name="arrow"/></span>
        </Link>
        <Link href="/aluno/evolucao" className="vento-pc-explore-tile">
          <img src="/images/prea-coast.webp" alt="" loading="lazy"/>
          <span><Icon name="chart"/><strong>Minha evolução</strong><small>Veja suas habilidades e próximas etapas.</small><Icon name="arrow"/></span>
        </Link>
        <Link href="/aluno/aulas" className="vento-pc-explore-tile">
          <img src="/images/vento-ocean-hero.webp" alt="" loading="lazy"/>
          <span><Icon name="calendar"/><strong>Meus encontros</strong><small>Consulte os horários e o histórico.</small><Icon name="arrow"/></span>
        </Link>
      </div>
    </section>
  </div>;
}
