import type { Metadata } from 'next';

import { DemoForm } from '@/components/interactive';
import { Button, ButtonLink, Card, Eyebrow, Field, Note, PageHeader, inputClass } from '@/components/ui';

export const metadata: Metadata = { title: 'Regras da operação' };

const TIMES = [
  ['Tempo para responder', 'Minutos para cada instrutor aceitar uma oferta.', 2],
  ['Duração máxima da busca', 'Prazo total para encontrar um profissional.', 6],
  ['Prazo de pagamento', 'Minutos de bloqueio após o aceite.', 10],
  ['Antecedência para reagendar', 'Horas mínimas antes de cada encontro. Vale para novas contratações.', 24],
  ['Pausa por falta de resposta', 'Quantidade de expirações consecutivas.', 3],
] as const;

/**
 * The hourly rate is entered here in whole reais because that is how an
 * operator thinks about it. When this form is wired up, the server converts to
 * centavos, versions the rate and leaves open requests and existing bookings
 * on the price they were made at; the page never sends a total.
 */
export default function OperationRulesPage() {
  return (
    <>
      <PageHeader eyebrow="Valores e operação" title="Valor por hora e regras" lead="Defina o preço da aula e os parâmetros das novas solicitações." />
      <DemoForm confirmation="Valores e regras salvos na demonstração. Reservas existentes mantêm o preço contratado." className="grid gap-5">
        <div className="grid gap-5 lg:grid-cols-2">
          <Card>
            <Eyebrow>Preço das aulas</Eyebrow>
            <h2 className="mt-2 text-[16px]">Um valor por hora. O aluno escolhe a duração.</h2>
            <p className="mt-1 text-[12px] text-muted">
              Este valor é usado em todas as novas solicitações. Pedidos abertos e reservas existentes mantêm o preço contratado.
            </p>
            <div className="mt-4">
              <Field label="Valor da hora de aula (R$)" hint="Ex.: 3h30 × R$ 300 = R$ 1.050">
                <input className={inputClass} type="number" min={1} step={1} defaultValue={300} inputMode="numeric" />
              </Field>
            </div>
          </Card>
          <Card>
            <h2 className="text-[16px]">Preços por veículo</h2>
            <p className="mt-1 text-[12px] text-muted">Capacidade, tarifa por hora e disponibilidade são definidas no cadastro de cada veículo.</p>
            <ButtonLink href="/admin/transporte" variant="ghost" className="mt-4">Gerenciar veículos de apoio</ButtonLink>
          </Card>
        </div>
        <Card>
          <h2 className="text-[16px]">Tempos da operação</h2>
          <div className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {TIMES.map(([label, hint, value]) => (
              <Field key={label} label={label} hint={hint}>
                <input className={inputClass} type="number" min={0} defaultValue={value} inputMode="numeric" />
              </Field>
            ))}
          </div>
        </Card>
        <Card>
          <h2 className="text-[16px]">Prioridade e comissão</h2>
          <ul className="mt-3 grid gap-2 text-[12px] text-label">
            <li>Recusa e expiração: posição preservada.</li>
            <li>Pagamento confirmado: final da fila.</li>
            <li>Pagamento não concluído: posição preservada.</li>
          </ul>
          <div className="mt-4 max-w-xs">
            <Field label="Comissão de exemplo (%)" hint="Percentual usado apenas na simulação financeira.">
              <input className={inputClass} type="number" min={0} max={100} defaultValue={15} inputMode="numeric" />
            </Field>
          </div>
          <p className="mt-3 text-[12px] text-muted">A comissão de uma solicitação já aberta permanece a mesma.</p>
        </Card>
        <Button type="submit" className="justify-self-start">Salvar valores e regras</Button>
      </DemoForm>
      <Note className="mt-5">
        Na demonstração, uma solicitação ativa é compartilhada entre os três perfis neste navegador. A operação real precisará de servidor, autenticação, notificações e provedor de pagamento.
      </Note>
    </>
  );
}
