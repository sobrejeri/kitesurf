import Link from 'next/link';

import { STORE, UNITS } from '@/lib/business/demo';
import { ACCENT } from '@/lib/business/shop';

export const metadata = { title: 'Página pública da escola' };

export default function PublicPage() {
  const a = ACCENT[STORE.accent];
  return (
    <div className="grid gap-4">
      <section style={{ background: a.bg, color: a.fg }} className="rounded-[18px] p-6 sm:p-8">
        <h2 className="text-[26px] font-bold leading-tight">{STORE.name}</h2>
        <p className="mt-1 text-[15px] opacity-90">{STORE.slogan}</p>
        <Link href="/admin/business/lojinha/vitrine/catalogo" className="press mt-4 inline-flex min-h-11 items-center rounded-full bg-white px-5 text-[14px] font-semibold text-ink">Ver aulas e produtos</Link>
      </section>
      <section aria-label="Unidades" className="grid gap-3 sm:grid-cols-3">
        {UNITS.filter((u) => u.active).map((u) => (
          <Link key={u.id} href={`/admin/business/lojinha/vitrine/catalogo?unidade=${u.id}`} className="press rounded-[14px] border border-line bg-surface p-4 shadow-card">
            <p className="text-[15px] font-semibold text-ink">{u.name}</p><p className="mt-1 text-[12.5px] text-muted">{u.city} · {u.opens} às {u.closes}</p><p className="text-[12.5px] text-muted">{u.address}</p>
          </Link>))}
      </section>
    </div>
  );
}
