import Link from 'next/link';
import { notFound } from 'next/navigation';

import { readCatalog } from '@/lib/public-store-server';

import { StoreClient } from './store-client';

export const dynamic = 'force-dynamic';

export default async function StorePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const catalog = await readCatalog(slug);
  if (!catalog) notFound();
  return (
    <>
      <Link href="/escola" className="back">← Escolas</Link>
      <span className="eyebrow">Loja da escola</span>
      <h1>{catalog.store.name}</h1>
      {catalog.store.slogan && <p className="lead">{catalog.store.slogan}</p>}
      <StoreClient catalog={catalog} />
    </>
  );
}
