import { Icon, type IconName } from '@/components/icon';

/**
 * Compact mobile campaign poster: real DOM text and an existing
 * high-resolution local lesson photograph. The supplied mockup is a reference, not a screenshot
 * baked into the page (so copy and layout can reflow on phones).
 */
const HIGHLIGHTS: readonly { label: string; icon: IconName }[] = [
  { label: 'Todos os níveis', icon: 'chart' },
  { label: 'Instrutores aprovados', icon: 'shield' },
  { label: 'Agenda flexível', icon: 'calendar' },
  { label: 'Praias de Jeri e Preá', icon: 'pin' },
];

export function HomePosterHero({ firstName }: { firstName?: string }) {
  return (
    <>
    <section className="vento-home-poster relative -mx-4 overflow-hidden md:mx-0 md:mt-2 md:rounded-[26px] lg:hidden" aria-labelledby="vento-home-title">
      <img
        src="/images/kite-lesson.webp"
        alt=""
        aria-hidden="true"
        width={1254}
        height={1254}
        loading="eager"
        fetchPriority="high"
        decoding="async"
        className="vento-home-poster-photo absolute inset-0 h-full w-full object-cover"
      />
      <div className="vento-home-poster-shade absolute inset-0" aria-hidden="true" />
      <div className="vento-home-poster-glow pointer-events-none absolute inset-0" aria-hidden="true" />

      <div className="vento-home-poster-content relative z-10">
        <p className="vento-home-poster-brush">
          <Icon name="kite" className="!h-6 !w-6 shrink-0" />
          <span>Liberdade em cada rajada</span>
        </p>

        <h1 id="vento-home-title" className="vento-home-poster-title">
          <span className="vento-home-poster-intro">Seu próximo</span>
          <span className="vento-home-poster-titleline">
            <span className="vento-home-poster-bordo">BORDO</span>
            <span className="vento-home-poster-script">começa aqui!</span>
          </span>
        </h1>

        <p className="vento-home-poster-description">
          {firstName ? `${firstName}, viva` : 'Viva'} o melhor do kitesurf.
          Aulas para todos os níveis, no seu ritmo, com instrutores experientes.
        </p>

        <ul className="vento-home-poster-highlights" aria-label="Vantagens das aulas">
          {HIGHLIGHTS.map((highlight) => (
            <li key={highlight.label}>
              <span className="vento-home-poster-highlight-icon" aria-hidden="true">
                <Icon name={highlight.icon} className="!h-5 !w-5" />
              </span>
              <span>{highlight.label}</span>
            </li>
          ))}
        </ul>

      </div>

      <svg className="vento-home-poster-wave pointer-events-none absolute bottom-0 left-0 z-10 w-full" viewBox="0 0 1200 70" preserveAspectRatio="none" aria-hidden="true">
        <path d="M0 35C170 80 330 20 530 42S900 9 1200 35V70H0Z" fill="#ff8c16" />
        <path d="M0 45C170 88 330 28 530 52S900 18 1200 45V70H0Z" fill="#00bfcf" />
        <path d="M0 55C190 91 350 37 550 59S935 30 1200 56V70H0Z" fill="#001a30" />
      </svg>
    </section>
    <section aria-labelledby="vento-desktop-home-title" className="vento-desktop-home-hero relative hidden overflow-hidden rounded-[22px] lg:block">
      <img src="/images/prea-coast.webp" alt="" aria-hidden="true"
        width={1536} height={1024} loading="eager" fetchPriority="high"
        className="absolute inset-0 h-full w-full object-cover object-center" />
      <div className="absolute inset-0 bg-gradient-to-r from-[#00283b]/85 via-[#003f57]/45 to-transparent" aria-hidden="true" />
      <div className="relative z-10 flex min-h-[205px] max-w-[55%] flex-col justify-center px-8 py-8">
        <span className="mb-2 text-[13px] font-medium tracking-wide text-[#b6f5f6]">Preá e Jericoacoara</span>
        <h1 id="vento-desktop-home-title" className="font-display text-[32px] font-extrabold leading-[1.12] tracking-tight text-white">
          Seu próximo bordo começa aqui.
        </h1>
        <p className="mt-3 text-[14px] text-[#e7f6f9]">Escolha suas horas e encontre seu instrutor.</p>
      </div>
    </section>
    </>
  );
}
