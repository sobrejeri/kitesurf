import Link from 'next/link';

export type LegalSection = { title: string; body: string[] };

/**
 * Public legal text (terms, privacy). The wording is a DRAFT based on how the app really behaves today; it must be
 * reviewed by the business owner/lawyer before it is treated as a contract. The notice below says so on screen.
 */
export function LegalPage({ title, updated, sections, other }: {
  title: string; updated: string; sections: LegalSection[]; other: { href: string; label: string };
}) {
  return (
    <main className="theme-pro mx-auto w-full max-w-3xl bg-canvas px-5 py-8 text-ink">
      <Link href="/" className="inline-flex min-h-11 items-center text-[14px] font-semibold text-brand">← Voltar ao início</Link>
      <h1 className="mt-2 text-[28px] font-bold leading-tight">{title}</h1>
      <p className="mt-1 text-[13px] text-muted">Última atualização: {updated}</p>
      <p role="note" className="mt-4 rounded-2xl border border-line bg-surface p-4 text-[13px] leading-relaxed text-label">
        <strong className="text-ink">Rascunho para revisão jurídica.</strong> Este texto descreve como o Vento funciona hoje, mas ainda não é o contrato definitivo.
        Cobranças reais estão desativadas nesta fase.
      </p>
      <div className="mt-6 space-y-6">
        {sections.map((section) => (
          <section key={section.title} aria-labelledby={`legal-${section.title}`}>
            <h2 id={`legal-${section.title}`} className="text-[18px] font-semibold">{section.title}</h2>
            {section.body.map((paragraph) => (
              <p key={paragraph} className="mt-2 text-[15px] leading-relaxed text-label">{paragraph}</p>
            ))}
          </section>
        ))}
      </div>
      <p className="mt-8 border-t border-line pt-4 text-[14px]">
        Veja também: <Link href={other.href} className="font-semibold text-brand underline">{other.label}</Link>
      </p>
    </main>
  );
}
