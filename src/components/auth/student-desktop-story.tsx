import { OfficialLogo } from '@/components/official-logo';

type Kind = 'login' | 'signup' | 'recover' | 'reset';

/** Decorative desktop column. The accessible forms remain in their existing
 * components, and the column is hidden entirely on mobile. */
export function StudentDesktopAuthStory({kind}: {kind:Kind}) {
  const copy:Record<Kind,{eyebrow:string;lead:string;highlight:string;body:string}>={
    login:{
      eyebrow:'SEU ESPAÇO NO KITE',
      lead:'Bons ventos,',
      highlight:'de volta.',
      body:'Acesse suas aulas, converse com o instrutor e acompanhe cada conquista.',
    },
    signup:{
      eyebrow:'SEU PRIMEIRO BORDO',
      lead:'Liberdade',
      highlight:'em cada rajada.',
      body:'Sua jornada no kitesurf começa com um encontro inesquecível no mar.',
    },
    recover:{
      eyebrow:'ACESSO SEGURO',
      lead:'Sua jornada',
      highlight:'continua aqui.',
      body:'Recupere seu acesso para voltar às suas aulas, reservas e mensagens.',
    },
    reset:{
      eyebrow:'ACESSO SEGURO',
      lead:'Novo acesso,',
      highlight:'mesma liberdade.',
      body:'Defina uma nova senha e continue sua jornada com tranquilidade.',
    },
  };
  const item=copy[kind];
  return <aside className="vento-pc-auth-story" aria-label="VentoKite — Aulas de kitesurf">
    <img className="vento-pc-auth-photo" src="/images/kite-lesson.webp" alt="" aria-hidden="true"/>
    <div className="vento-pc-auth-shade" aria-hidden="true"/>
    <div className="vento-pc-auth-story-content">
      <div className="vento-pc-auth-brand"><OfficialLogo/></div>
      <span className="vento-pc-auth-overline">{item.eyebrow}</span>
      <h2>{item.lead}<br/><em>{item.highlight}</em></h2>
      <p>{item.body}</p>
    </div>
    <div className="vento-pc-auth-waves" aria-hidden="true"/>
  </aside>;
}
