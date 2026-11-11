import type { Metadata } from 'next';
import Link from 'next/link';

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
      <PageHeader eyebrow="Valores e operação" title="Valores por nível e regras" lead="Defina o valor por hora de cada nível e a comissão global para novas reservas." />
      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <Eyebrow>Preço das aulas</Eyebrow>
          <h2 className="mt-2 text-[16px]">Um valor por hora para cada nível da aula.</h2>
          <p className="mt-1 text-[12px] text-muted">Vale para novas reservas. Reservas existentes mantêm o preço contratado.</p>
          {current ? (
            <p className="tabular mt-4 text-[13px]">
              Iniciante: <strong className="text-brand">{formatMoney(current.hourly_rate_cents)}/h</strong><br />
              Intermediário: <strong className="text-brand">{formatMoney(current.intermediate_hourly_cents ?? current.hourly_rate_cents)}/h</strong><br />
              Avançado: <strong className="text-brand">{formatMoney(current.advanced_hourly_cents ?? current.hourly_rate_cents)}/h</strong>
            </p>
          ) : null}
          <p className="mt-3 text-[12px] text-muted">
            A comissão global vale para instrutores sem uma taxa individual.
            Ajustes específicos são feitos em{' '}
            <Link href="/admin/instrutores" className="font-semibold text-brand underline">Instrutores</Link>
            {' '}e{' '}
            <Link href="/admin/afiliados" className="font-semibold text-brand underline">Afiliados</Link>.
          </p>
          {!current?.level_prices_ready ? <Note tone="warning" className="mt-4">Os valores atuais continuam válidos. Para editar por nível, aplique a migração 36 no Supabase.</Note> : null}
          <ActionForm action={publishPrice} submitLabel="Publicar valores por nível" disabled={!current?.level_prices_ready} className="mt-5 grid gap-4">
            <input type="hidden" name="expectedVersionId" value={current?.id ?? ''} />
            <div className="grid gap-4 sm:grid-cols-3">
              {([
                ['beginnerRateReais', 'Iniciante · R$/hora', current?.hourly_rate_cents],
                ['intermediateRateReais', 'Intermediário · R$/hora', current?.intermediate_hourly_cents ?? current?.hourly_rate_cents],
                ['advancedRateReais', 'Avançado · R$/hora', current?.advanced_hourly_cents ?? current?.hourly_rate_cents],
              ] as const).map(([name, label, cents]) => (
                <Field key={name} label={label}>
                  <input name={name} type="number" min={10} max={10000} step="0.01" required
                    defaultValue={cents == null ? 300 : (cents / 100).toFixed(2)} className={inputClass} />
                </Field>
              ))}
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Comissão da plataforma (%)">
                <input name="commissionPercent" type="number" min={0} max={100} step={1} required defaultValue={current ? current.platform_commission_bps / 100 : 15} className={inputClass} />
              </Field>
              <Field label="Transporte de apoio (R$/h)" hint="Vai inteiro para o instrutor. 0 desliga a opção.">
                <input name="transportRateReais" type="number" min={0} max={10000} step="0.01" required defaultValue={current ? current.transport_hourly_cents / 100 : 100} className={inputClass} />
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
                  <strong className="tabular block font-[550]">Iniciante {formatMoney(version.hourly_rate_cents)}/h · Intermediário {formatMoney(version.intermediate_hourly_cents ?? version.hourly_rate_cents)}/h · Avançado {formatMoney(version.advanced_hourly_cents ?? version.hourly_rate_cents)}/h</strong>
                  <strong className="tabular block font-[550]">Comissão {formatBps(version.platform_commission_bps)} · transporte {formatMoney(version.transport_hourly_cents)}/h</strong>
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
