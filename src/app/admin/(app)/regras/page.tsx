import type { Metadata } from 'next';

import { publishPrice } from '@/app/actions/admin';
import { ActionForm } from '@/components/action-form';
import { Card, Eyebrow, Field, Note, PageHeader, inputClass } from '@/components/ui';
import { requireRole } from '@/lib/auth';
import { listPriceVersions } from '@/lib/data';
import { formatBps, formatDateShort, formatMoney } from '@/lib/format';

export const metadata: Metadata = { title: 'Regras da operação' };

export default async function OperationRulesPage() {
  await requireRole(['admin'], '/admin/regras');
  const versions = await listPriceVersions();
  const current = versions[0];
  return (
    <>
      <PageHeader eyebrow="Valores e operação" title="Valor por hora e regras" lead="Defina o preço da aula e a comissão das novas reservas." />
      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <Eyebrow>Preço das aulas</Eyebrow>
          <h2 className="mt-2 text-[16px]">Um valor por hora. O aluno escolhe a duração.</h2>
          <p className="mt-1 text-[12px] text-muted">Vale para novas reservas. Reservas existentes mantêm o preço contratado.</p>
          {current ? (
            <p className="tabular mt-4 text-[13px]">
              Atual: <strong className="text-brand">{formatMoney(current.hourly_rate_cents)}/hora</strong> · comissão {formatBps(current.platform_commission_bps)}
            </p>
          ) : null}
          <ActionForm action={publishPrice} submitLabel="Publicar novo valor" className="mt-5 grid gap-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Valor da hora (R$, inteiro)">
                <input name="hourlyRateReais" type="number" min={10} max={10000} step={1} required defaultValue={current ? current.hourly_rate_cents / 100 : 300} className={inputClass} />
              </Field>
              <Field label="Comissão da plataforma (%)">
                <input name="commissionPercent" type="number" min={0} max={100} step={1} required defaultValue={current ? current.platform_commission_bps / 100 : 15} className={inputClass} />
              </Field>
              <Field label="Transporte de apoio (R$/h)" hint="Vai inteiro para o instrutor. 0 desliga a opção.">
                <input name="transportRateReais" type="number" min={0} max={10000} step={1} required defaultValue={current ? current.transport_hourly_cents / 100 : 100} className={inputClass} />
              </Field>
            </div>
            <Field label="Motivo" hint="Fica registrado no histórico de auditoria.">
              <input name="reason" required minLength={3} maxLength={500} className={inputClass} />
            </Field>
          </ActionForm>
        </Card>
        <Card>
          <h2 className="text-[16px]">Histórico de preços</h2>
          <ul className="mt-4 divide-y divide-line text-[12px]">
            {versions.map((version) => (
              <li key={version.id} className="flex items-center justify-between gap-3 py-3">
                <span>
                  <strong className="tabular block font-[550]">{formatMoney(version.hourly_rate_cents)}/hora · {formatBps(version.platform_commission_bps)} · transporte {formatMoney(version.transport_hourly_cents)}/h</strong>
                  <span className="text-muted">{version.reason ?? '—'}</span>
                </span>
                <span className="text-muted">{formatDateShort(version.created_at)}</span>
              </li>
            ))}
          </ul>
          <Note className="mt-4">Versões de preço são imutáveis: cada mudança cria uma nova e cada reserva guarda a versão usada.</Note>
        </Card>
      </div>
    </>
  );
}
