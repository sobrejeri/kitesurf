import { Note } from './ui';

/** The explanation every partner screen ends with. */
export function PartnerFootnote() {
  return (
    <div className="mt-6 grid gap-3">
      <Note title="Como a indicação gera comissão">
        A pousada recebe um percentual sobre as horas de aula realizadas por hóspedes que reservaram pelo link dela.
        A comissão sai da parte da plataforma: o preço do hóspede e o líquido do instrutor não mudam.
      </Note>
      <p className="text-[11px] leading-relaxed text-muted">
        Repasses de comissão ainda não são automáticos: dependem da integração de pagamento.
      </p>
    </div>
  );
}

export function PartnerHeading({ title, lead }: { title: string; lead: string }) {
  return (
    <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-[30px] font-bold leading-tight tracking-[-0.8px] text-ink md:text-[34px]">{title}</h1>
        <p className="mt-1 text-[14px] text-label">{lead}</p>
      </div>
    </header>
  );
}
