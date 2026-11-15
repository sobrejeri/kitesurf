'use client';

import { Button } from '@/components/ui';

export function PrintButton({ label = 'Imprimir' }: { label?: string }) {
  return <Button type="button" size="sm" icon="download" onClick={() => window.print()} className="print:hidden">{label}</Button>;
}
