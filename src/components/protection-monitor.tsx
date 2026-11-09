import { Badge, Card, Note } from '@/components/ui';
import type { ProtectionMonitorItem, ProtectionMonitorPhase } from '@/lib/protection-monitor';

const PHASES: Record<ProtectionMonitorPhase, { label: string; message: string }> = {
  awaiting_record: {
    label: 'Aguardando registro',
    message: 'O horário terminou. A realização e os minutos precisam ser confirmados.',
  },
  response_window: {
    label: 'Prazo de manifestação',
    message: 'Há um encontro sem registro de conclusão. As partes podem enviar relatos para avaliação.',
  },
  needs_admin_review: {
    label: 'Análise necessária',
    message: 'O prazo interno de cinco dias terminou. A administração precisa verificar os fatos.',
  },
};

const localTime = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Fortaleza', dateStyle: 'short', timeStyle: 'short',
});

export function ProtectionMonitor({
  items, area, error = false,
}: {
  items: readonly ProtectionMonitorItem[];
  area: 'aluno' | 'instrutor' | 'admin';
  error?: boolean;
}) {
  const admin = area === 'admin';
  return (
    <Card className="mb-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-brand">VentoKite Protege</p>
          <h2 className="mt-1 text-[18px] font-bold text-ink">
            {admin ? 'Encontros aguardando comprovação' : 'Aulas que precisam de registro'}
          </h2>
          <p className="mt-1 text-[12px] text-muted">
            Prazo interno de manifestação: cinco dias após o término previsto de cada encontro.
          </p>
        </div>
        <Badge tone={items.length ? 'warning' : 'quiet'}>{items.length} encontro(s)</Badge>
      </div>

      {error ? <Note tone="warning" className="mt-3">
        Não foi possível consultar todos os encontros nesta visita. Tente novamente.
      </Note> : null}

      {!items.length && !error ? (
        <p className="mt-4 text-[13px] text-muted">Nenhum encontro agendado com horário vencido nesta consulta.</p>
      ) : null}

      {items.length ? (
        <ul className="mt-4 grid gap-3">
          {items.slice(0, 12).map((item) => {
            const phase = PHASES[item.phase];
            return (
              <li key={item.id} className="rounded-xl border border-line bg-surface px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <strong className="text-[13px] text-ink">{item.bookingCode}</strong>
                  <Badge tone={item.phase === 'needs_admin_review' ? 'warning' : 'brand'}>
                    {phase.label}
                  </Badge>
                </div>
                <p className="mt-1 text-[12px] text-muted">
                  Encontro: {localTime.format(new Date(item.startsAt))} · {item.minutes} min
                  {item.isTest ? ' · Aula de teste' : ''}
                </p>
                <p className="mt-2 text-[12px] text-ink">{phase.message}</p>
                <p className="mt-2 text-[11px] text-muted">
                  Fim da janela interna: {localTime.format(new Date(item.responseDeadlineMs))}
                </p>
              </li>
            );
          })}
        </ul>
      ) : null}

      {items.length > 12 ? (
        <p className="mt-3 text-[11px] text-muted">
          Exibindo os 12 encontros com prazo mais antigo nesta consulta.
        </p>
      ) : null}

      {!admin && items.length ? (
        <a href="#registrar-ocorrencia"
          className="mt-4 inline-flex min-h-10 items-center text-[13px] font-semibold text-brand underline">
          Registrar ou complementar um relato
        </a>
      ) : null}

      <Note className="mt-4" title="Orientação importante">
        Um horário vencido não prova ausência nem aula realizada. O QR/PIN não pode ser usado
        retroativamente para simular presença. Este painel apenas informa prazos: notificações
        automáticas, retenção de pagamento e decisões financeiras ainda não estão ativadas.
        A janela de cinco dias não limita direitos legais de reclamação.
      </Note>
    </Card>
  );
}
