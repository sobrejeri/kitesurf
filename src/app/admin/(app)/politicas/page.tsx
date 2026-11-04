import type { Metadata } from 'next';

import { ActionForm } from '@/components/action-form';
import { saveCommercialDraft } from '@/app/actions/commercial-policies';
import { requireRole } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { Policies } from '@/components/shared';
import { Card, Field, Note, inputClass, textareaClass } from '@/components/ui';

export const metadata: Metadata = { title: 'Políticas comerciais' };

export default async function CommercialPoliciesPage() {
  await requireRole(['admin']);
  const db = await createSupabaseServerClient();
  const { data: draft, error } = await db.from('commercial_policy_drafts')
    .select('cancellation_hours,late_cancellation,absence,weather,updated_at')
    .eq('singleton', true).maybeSingle<{
      cancellation_hours: number; late_cancellation: string; absence: string; weather: string; updated_at: string;
    }>();
  return (
    <Policies>
      <Card>
        <h2 className="text-[16px]">Rascunho das regras comerciais</h2>
        {error ? <Note tone="warning" className="mt-4">O armazenamento dos rascunhos precisa da migração 34 no Supabase.</Note> : null}
        {draft ? <p className="mt-2 text-[12px] text-muted">Última gravação: {new Intl.DateTimeFormat('pt-BR', {timeZone:'America/Fortaleza',dateStyle:'short',timeStyle:'short'}).format(new Date(draft.updated_at))}</p> : null}
        <ActionForm action={saveCommercialDraft} disabled={Boolean(error)} submitLabel="Salvar rascunho comercial" className="mt-4 grid gap-4">
          <div className="max-w-xs">
            <Field label="Antecedência proposta para cancelar (horas)">
              <input name="hours" className={inputClass} type="number" required min={0} max={720} defaultValue={draft?.cancellation_hours ?? 72} inputMode="numeric" />
            </Field>
          </div>
          <Field label="Cancelamento fora do prazo"><textarea name="late" maxLength={5000} defaultValue={draft?.late_cancellation ?? ''} className={textareaClass} /></Field>
          <Field label="Ausência de aluno ou instrutor"><textarea name="absence" maxLength={5000} defaultValue={draft?.absence ?? ''} className={textareaClass} /></Field>
          <Field label="Condições de vento"><textarea name="weather" maxLength={5000} defaultValue={draft?.weather ?? ''} className={textareaClass} /></Field>
          <Note>Esses campos documentam propostas. Não executam taxas ou descontos automáticos.</Note>
        </ActionForm>
      </Card>
    </Policies>
  );
}
