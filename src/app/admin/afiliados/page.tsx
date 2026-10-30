import type { Metadata } from 'next';

import { Badge, Button, Card, Note, PageHeader } from '@/components/ui';
import { PARTNERS } from '@/data/demo';

export const metadata: Metadata = { title: 'Pousadas afiliadas' };

export default function PartnersAdminPage() {
  return (
    <>
      <PageHeader title="Pousadas afiliadas" lead="Aprovação, comissões e acompanhamento das indicações." />
      <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <Card>
          <ul className="divide-y divide-line">
            {PARTNERS.map((partner) => (
              <li key={partner.code} className="flex items-center justify-between gap-3 py-4 first:pt-0">
                <div>
                  <p className="text-[13px] font-[550]">{partner.name}</p>
                  <p className="text-[11px] text-muted">{partner.code} · {partner.commission} · {partner.bookings} contratação(ões)</p>
                </div>
                <Badge tone={partner.status === 'Aprovada' ? 'success' : 'warning'}>{partner.status}</Badge>
              </li>
            ))}
          </ul>
          <Button variant="soft" icon="plus" className="mt-4">Cadastrar pousada</Button>
        </Card>
        <div className="grid content-start gap-5">
          <Card>
            <h2 className="text-[16px]">Comissões de pousadas</h2>
            <p className="mt-1 text-[12px] text-muted">0 encontro(s)</p>
          </Card>
          <Note title="Como a indicação gera comissão">
            A pousada recebe um percentual sobre as horas de aula realizadas por hóspedes que reservaram pelo link dela. Transporte não entra na base.
          </Note>
        </div>
      </div>
    </>
  );
}
