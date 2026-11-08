'use client';
import { useState } from 'react';
import Link from 'next/link';
import { Icon } from '@/components/icon';
import { StudentInstructorPhoto } from '@/components/student/instructor-photo';
import type { LessonCard } from '@/components/student/my-lessons';

type Filter='todas'|'agendadas'|'andamento'|'concluidas'|'historico';
const options:{id:Filter;label:string}[]=[
  {id:'todas',label:'Todas'},{id:'agendadas',label:'Agendadas'},
  {id:'andamento',label:'Em andamento'},{id:'concluidas',label:'Concluídas'}
];
export function DesktopStudentLessons({lessons,initialTab}:{
  lessons:readonly LessonCard[];
  initialTab:0|1;
}) {
  const [filter,setFilter]=useState<Filter>(initialTab===1?'historico':'todas');
  const finished=(lesson:LessonCard)=>lesson.statusLabel==='Concluída';
  const running=(lesson:LessonCard)=>lesson.statusLabel==='Em andamento';
  const upcoming=lessons.filter(l=>!l.past&&!finished(l));
  const done=lessons.filter(finished);
  const visible=lessons.filter(l=>filter==='todas'||(filter==='historico'&&l.past)||
    (filter==='agendadas'&&!l.past&&!running(l)&&!finished(l))||
    (filter==='andamento'&&running(l))||(filter==='concluidas'&&finished(l)));
  const next=upcoming.find(l=>!running(l))??upcoming[0];
  return <div className="vento-pc-page vento-pc-lessons">
    <header className="vento-pc-banner" style={{backgroundImage:"linear-gradient(90deg,#00223ded 3%,#002c4292 46%,transparent),url('/images/kite-lesson.webp')"}}>
      <span className="vento-pc-overline">SEU ESPAÇO NO KITE</span>
      <h1>Minhas <em>Aulas</em></h1>
      <p>Acompanhe seus encontros, horários e conquistas no mar.</p>
      <Link className="vento-pc-primary" href="/aluno/reservar">Agendar nova aula <Icon name="arrow"/></Link>
    </header>
    <div className="vento-pc-lesson-highlights">
      <div><Icon name="calendar"/><span>Próxima aula<strong>{next?`${next.day} ${next.month} • ${next.time}`:'Não agendada'}</strong></span></div>
      <div><Icon name="book"/><span>Total de encontros<strong>{lessons.length}</strong></span></div>
      <div><Icon name="check"/><span>Aulas concluídas<strong>{done.length}</strong></span></div>
      <div><Icon name="pin"/><span>Local<strong>{next?.beach??'A definir'}</strong></span></div>
      <div><Icon name="user"/><span>Instrutor<strong>{next?.instructorName??'A definir'}</strong></span></div>
    </div>
    <div className="vento-pc-lessons-grid">
      <section className="vento-pc-lessons-list">
        <header className="vento-pc-list-header">
          <h2><Icon name="calendar"/> Minhas aulas</h2>
          <div className="vento-pc-list-filters" role="group" aria-label="Filtrar aulas">
            {options.map(option=><button type="button" key={option.id}
              aria-pressed={filter===option.id}
              onClick={()=>setFilter(option.id)}>
              {option.label}{option.id==='todas'?` (${lessons.length})`:null}
            </button>)}
            {initialTab===1||filter==='historico'?<button type="button"
              aria-pressed={filter==='historico'} onClick={()=>setFilter('historico')}>Histórico</button>:null}
          </div>
        </header>
        {visible.length ? <ul className="vento-pc-lesson-rows">
          {visible.map(lesson=><li key={lesson.meetingId}>
            <Link href={lesson.evolutionHref??`/aluno/reserva/${lesson.bookingId}`} className="vento-pc-lesson-row">
              <span className="vento-pc-lesson-date"><strong>{lesson.day}</strong>{lesson.month}</span>
              <img className="vento-pc-lesson-thumbnail" src="/images/kite-lesson.webp" alt="" loading="lazy"/>
              <span className="vento-pc-lesson-detail"><strong>{lesson.title}</strong>
                <small><Icon name="pin"/>{lesson.beach} <Icon name="clock"/>{lesson.time} · {lesson.durationLabel}</small>
                <small className="vento-pc-lesson-instructor"><StudentInstructorPhoto name={lesson.instructorName} url={lesson.instructorPhotoUrl} size={24}/>{lesson.instructorName}</small>
              </span>
              <span className={`vento-pc-status vento-pc-status--${lesson.statusTone}`}>{lesson.statusLabel}</span>
              <span className="vento-pc-row-arrow"><Icon name="chevron"/></span>
            </Link>
          </li>)}
        </ul>:<div className="vento-pc-empty-lessons">
          <Icon name="calendar"/><strong>Nenhuma aula nessa categoria.</strong>
          <p>Seus encontros aparecerão aqui conforme forem agendados e registrados.</p>
          <Link href="/aluno/reservar">Agendar uma aula <Icon name="arrow"/></Link>
        </div>}
      </section>
      <div className="vento-pc-lessons-aside">
        <section className="vento-pc-aside-progress">
          <span className="vento-pc-overline">SUA JORNADA</span>
          <h2>Seu caminho no kite</h2>
          <p>Descubra as etapas que você já trabalhou com seu instrutor.</p>
          <div className="vento-pc-learning-steps">
            <span><Icon name="check"/> Iniciante</span>
            <span><Icon name="chart"/> Intermediário</span>
            <span><Icon name="flag"/> Avançado</span>
          </div>
          <Link href="/aluno/evolucao">Ver minha evolução <Icon name="arrow"/></Link>
        </section>
        <section className="vento-pc-tips">
          <h2><Icon name="sun"/> Pronto para o mar?</h2>
          <ul>
            <li><Icon name="check"/>Chegue 15 minutos antes.</li>
            <li><Icon name="check"/>Leve água e protetor solar.</li>
            <li><Icon name="check"/>Respeite seu ritmo.</li>
            <li><Icon name="check"/>Tire dúvidas com seu instrutor.</li>
          </ul>
          <p>Menos pressa. Mais mar.</p>
        </section>
      </div>
    </div>
  </div>;
}
