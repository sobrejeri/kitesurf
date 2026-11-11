import { adminCorrectTaxId, saveMyTaxId } from '@/app/actions/tax-id';
import { ActionForm } from '@/components/action-form';
import { Icon } from '@/components/icon';
import { Badge, Field, Note, inputClass } from '@/components/ui';
import { formatTaxId, taxIdLabel } from '@/lib/tax-id';
import type { TaxIdState } from '@/lib/tax-id-data';

/** One line for a collapsed section; never shows the number itself. */
export function taxIdSummary(state: TaxIdState): string {
  if (state.status === 'unavailable') return 'Aguardando ativação no sistema';
  if (state.status === 'missing') return 'Obrigatório para a aprovação · privado';
  return `${taxIdLabel(state.kind)} cadastrado${state.locked ? ' · conferido pela equipe' : ' · privado'}`;
}

/** The holder's own CPF or CNPJ: form while in review, read-only after approval. */
export function TaxIdBody({ state }: { state: TaxIdState }) {
  if (state.status === 'unavailable') {
    return (
      <Note tone="warning">
        O campo de CPF ou CNPJ depende da migração 47 no Supabase. O restante do cadastro continua funcionando.
      </Note>
    );
  }
  if (state.status === 'saved' && state.locked) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-[14px] border border-line bg-sand/50 px-4 py-3">
        <div className="min-w-0">
          <p className="text-[12px] text-muted">{taxIdLabel(state.kind)}</p>
          <p className="mt-0.5 break-all font-mono text-[15px] text-ink">{formatTaxId(state.number)}</p>
        </div>
        <Badge tone="success">Conferido pela equipe</Badge>
        <p className="w-full text-[12px] text-muted">Para alterar, fale com a equipe VentoKite.</p>
      </div>
    );
  }
  return (
    <ActionForm action={saveMyTaxId} submitLabel={state.status === 'saved' ? 'Atualizar documento' : 'Salvar documento'}
      className="grid gap-3">
      <Field label="CPF ou CNPJ"
        hint="Pessoa física: CPF. Empresa ou MEI: CNPJ. Fica privado: só você e a equipe VentoKite veem.">
        <input name="taxId" required minLength={11} maxLength={24}
          defaultValue={state.status === 'saved' ? formatTaxId(state.number) : ''}
          placeholder="000.000.000-00" autoComplete="off" autoCapitalize="characters"
          spellCheck={false} inputMode="text" className={inputClass} />
      </Field>
      {state.status === 'saved' ? (
        <p className="text-[12px] text-muted">
          Você pode corrigir enquanto o cadastro está em análise. Depois da aprovação, só a equipe altera.
        </p>
      ) : null}
    </ActionForm>
  );
}

/** Administration: the number for checking against the identity document, and a correction. */
export function AdminTaxIdCorrection({ profileId, state }: { profileId: string; state: TaxIdState }) {
  if (state.status === 'unavailable') return null;
  return (
    <details className="group mt-3 rounded-[14px] border border-line px-4 py-2">
      <summary className="flex min-h-10 cursor-pointer list-none items-center justify-between gap-2 text-[13px] font-semibold text-ink [&::-webkit-details-marker]:hidden">
        {state.status === 'saved' ? 'Corrigir CPF ou CNPJ' : 'Cadastrar CPF ou CNPJ pela equipe'}
        <Icon name="chevronDown" className="!h-4 !w-4 text-muted transition-transform group-open:rotate-180" />
      </summary>
      <ActionForm action={adminCorrectTaxId} submitLabel="Salvar correção" className="mb-2 mt-2 grid gap-3">
        <input type="hidden" name="profileId" value={profileId} />
        <Field label="CPF ou CNPJ correto">
          <input name="taxId" required minLength={11} maxLength={24} autoComplete="off"
            autoCapitalize="characters" spellCheck={false} placeholder="000.000.000-00" className={inputClass} />
        </Field>
        <Field label="Motivo (obrigatório, registrado na auditoria)">
          <input name="reason" required minLength={3} maxLength={500}
            placeholder="Ex.: número conferido com o documento de identidade" className={inputClass} />
        </Field>
      </ActionForm>
    </details>
  );
}
