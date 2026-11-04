import Link from 'next/link';

import { BOOKING, EVENT_LOG, INCIDENT_TYPES, type QueueEntry } from '@/data/demo';

import { Icon, type IconName } from './icon';
import { ChipChoice, DemoForm } from './interactive';
import { Avatar, Badge, Button, Card, EmptyState, Field, Note, PageHeader, inputClass, textareaClass } from './ui';

/**
 * Screens that every role has in the sketch — the hub, incidents, chat, inbox,
 * policies, agenda — written once and placed under each role's route with
 * that role's wording.
 */

export interface HubItem {
  title: string;
  body: string;
  href: string;
}

export function Hub({ title, items, notice, bare = false }: { title: string; items: readonly HubItem[]; notice: string; bare?: boolean }) {
  return (
    <>
      {bare ? null : <PageHeader
        eyebrow="Fluxos da plataforma"
        title={title}
        lead="Tudo organizado por etapa, sem perder os dados já preenchidos."
      />}
      {/* A list of rows on phones, a grid of cards from md up. */}
      <ul className="overflow-hidden rounded-card border border-line bg-surface shadow-card md:grid md:grid-cols-2 md:gap-4 md:overflow-visible md:border-0 md:bg-transparent md:shadow-none">
        {items.map((item) => (
          <li key={item.href} className="border-b border-line last:border-b-0 md:border-0">
            <Link
              href={item.href}
              className="flex h-full items-center gap-3 px-4 py-4 active:bg-sand md:block md:rounded-card md:border md:border-line md:bg-surface md:p-6 md:shadow-card md:transition md:hover:border-brand-focus"
            >
              <span className="min-w-0 flex-1">
                <h2 className="text-[15px] md:text-[16px]">{item.title}</h2>
                <p className="mt-0.5 text-[12px] text-muted md:mt-2 md:text-[13px]">{item.body}</p>
              </span>
              <Icon name="chevron" className="!h-4 !w-4 text-faint md:hidden" />
              <span className="mt-4 hidden text-[12px] font-[550] text-brand md:inline-block">Abrir →</span>
            </Link>
          </li>
        ))}
      </ul>
      <Note className="mt-6">{notice}</Note>
    </>
  );
}

export function Incidents({ title = 'Imprevistos e cancelamentos', bare = false }: { title?: string; bare?: boolean }) {
  return (
    <>
      {bare ? null : <PageHeader
        eyebrow="Cada situação acompanhada"
        title={title}
        lead="Cada pedido pertence a um encontro. Os demais encontros e a prioridade da fila são preservados."
      />}
      <div className="grid gap-5 lg:grid-cols-[1.3fr_1fr]">
        <Card>
          <h2 className="text-[16px]">Registrar uma situação</h2>
          <DemoForm confirmation="Situação registrada na demonstração e enviada para análise." className="mt-5 grid gap-4">
            <Field label="Encontro">
              <select className={inputClass} defaultValue={BOOKING.code}>
                <option value={BOOKING.code}>
                  {BOOKING.code} · {BOOKING.dateShort} {BOOKING.time}
                </option>
              </select>
            </Field>
            <div className="flex flex-col gap-1.5">
              <span className="text-[12px] font-medium text-label">O que aconteceu?</span>
              <ChipChoice label="O que aconteceu?" options={INCIDENT_TYPES} defaultSelected={[INCIDENT_TYPES[0]]} />
            </div>
            <Field
              label="Minutos realizados"
              hint="Antes de iniciar a aula, use zero. Ausência só pode ser informada após o início previsto. Não há desconto automático no esboço."
            >
              <input className={inputClass} type="number" min={0} max={480} defaultValue={0} inputMode="numeric" />
            </Field>
            <Field label="Descreva a situação">
              <textarea className={textareaClass} />
            </Field>
            <Button type="submit" className="justify-self-start">
              Enviar para análise
            </Button>
          </DemoForm>
        </Card>
        <EmptyState>Nenhuma ocorrência aberta. O fluxo pode ser testado com uma aula confirmada.</EmptyState>
      </div>
    </>
  );
}

export function Chat({ counterpart, counterpartRole, bare = false }: { counterpart: string; counterpartRole: string; bare?: boolean }) {
  const initials = counterpart
    .split(' ')
    .map((part) => part.charAt(0))
    .join('')
    .slice(0, 2);
  return (
    <>
      {bare ? null : <PageHeader title={`Conversa com ${counterpart}`} />}
      <Note className="mb-5">Demonstração neste navegador. Nenhuma mensagem é enviada externamente.</Note>
      <Card className="!p-0">
        <div className="flex items-center gap-3 border-b border-line px-5 py-4">
          <Avatar initials={initials} />
          <div className="flex-1">
            <p className="font-[550]">{counterpart}</p>
            <p className="text-[11px] text-muted">
              Reserva {BOOKING.code} · {counterpartRole}
            </p>
          </div>
          <Badge tone="brand">{BOOKING.code}</Badge>
        </div>
        <div className="grid min-h-64 content-center gap-3 px-5 py-8 text-center text-[12px] text-muted">
          <p>Chat liberado após o pagamento de teste. Os encontros da mesma contratação compartilham esta conversa.</p>
          <p>A conversa começa aqui. Troque de perfil para testar a resposta.</p>
        </div>
        <DemoForm confirmation="Mensagem registrada apenas neste navegador." className="border-t border-line p-4">
          <div className="flex gap-2">
            <label className="sr-only" htmlFor="chat-message">
              Mensagem
            </label>
            <input id="chat-message" className={inputClass} placeholder="Mensagem" />
            <Button type="submit" className="shrink-0">
              Registrar mensagem de teste
            </Button>
          </div>
        </DemoForm>
      </Card>
    </>
  );
}

export function Inbox({ bare = false }: { bare?: boolean }) {
  return (
    <>
      {bare ? null : <PageHeader
        eyebrow="Atualizações da plataforma"
        title="Avisos"
        lead="Caixa de entrada demonstrativa. Push, e-mail e WhatsApp ainda não estão conectados."
      />}
      <EmptyState>Seus avisos aparecerão após mensagens, documentos e alterações da demonstração.</EmptyState>
    </>
  );
}

const FLOW_RULES = [
  ['Reagendamento', 'solicite com pelo menos 3 dias (72 horas) de antecedência. A nova data precisa ser posterior à original, com prazo de 12 horas para resposta.'],
  ['Sem resposta', 'após o prazo de resposta, o aluno tem 12 horas para escolher entre cancelar ou buscar outro instrutor. A reserva não é cancelada automaticamente.'],
  ['Desistência do instrutor', 'libera a atribuição para a fila de instrutores, preservando a reserva do aluno.'],
  ['Cancelamento', 'respeita os prazos e as opções apresentados em cada reserva. Não há cobrança ou perda automática de horas nesta fase de validação.'],
  ['Vento e interrupção', 'registrar os minutos realizados e encaminhar o restante para saldo ou análise de reembolso.'],
  ['Ausência', 'registrar após o horário previsto e aguardar análise, sem penalidade automática.'],
  ['Reembolso e repasse', 'somente simulações; a movimentação real dependerá da integração financeira.'],
] as const;

export function Policies({ children, bare = false }: { children?: React.ReactNode; bare?: boolean }) {
  return (
    <>
      {bare ? null : <PageHeader
        eyebrow="Regras antes da reserva"
        title="Políticas das aulas"
        lead="Rascunho comercial para revisar no esboço. Condições ainda não publicadas como contrato definitivo."
      />}
      <div className="grid gap-5">
        <Card>
          <h2 className="text-[16px]">Quem presta a aula e o papel da plataforma</h2>
          <div className="mt-3 grid gap-3 text-[13px] leading-relaxed text-muted">
            <p>
              A aula é prestada pelo instrutor independente identificado nesta reserva, responsável pela condução
              técnica, orientações, avaliação das condições da atividade e pelos equipamentos que fornecer.
            </p>
            <p>
              A Vento intermedeia a contratação e oferece os recursos da plataforma. Questões relativas à execução da
              aula devem ser encaminhadas ao instrutor, com suporte da plataforma para comunicação e registro.
            </p>
            <p>
              Esta divisão de papéis não exclui responsabilidades previstas em lei nem limita os direitos do
              consumidor.
            </p>
          </div>
          <p className="mt-4 text-[11px] text-quiet">
            Texto de ciência do esboço · versão 2026-10-30.1. A redação contratual definitiva depende de revisão
            jurídica.
          </p>
        </Card>
        <Card>
          <h2 className="text-[16px]">Como o fluxo está organizado</h2>
          <ul className="mt-3 grid gap-2.5 text-[13px] leading-relaxed text-muted">
            {FLOW_RULES.map(([term, text]) => (
              <li key={term} className="flex gap-2.5">
                <Icon name="check" className="mt-0.5 !h-4 !w-4 text-brand" />
                <span>
                  <strong className="font-[550] text-ink">{term}:</strong> {text}
                </span>
              </li>
            ))}
          </ul>
        </Card>
        {children}
      </div>
    </>
  );
}

export function Agenda({ subtitle, perspective }: { subtitle: string; perspective: 'instructor' | 'admin' }) {
  return (
    <>
      <PageHeader
        title="Agenda"
        lead={subtitle}
        action={
          <div className="flex flex-wrap gap-2">
            {perspective === 'instructor' ? (
              <>
                <Button variant="ghost" size="sm" icon="clock">
                  Bloquear horário
                </Button>
                <Link href="/instrutor/disponibilidade" className="inline-flex min-h-9 items-center gap-2 rounded-full border border-line-ghost bg-surface px-3.5 text-[12px] font-[550] text-brand">
                  Turnos
                </Link>
              </>
            ) : null}
            <Button size="sm" icon="plus">
              Nova aula
            </Button>
          </div>
        }
      />
      <Card className="!p-0">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
          <div>
            <p className="font-[550]">Novembro de 2026</p>
            <p className="text-[11px] text-muted">
              1 aula{perspective === 'instructor' ? ' · Rafael Lima' : ''}
            </p>
          </div>
          <div className="flex flex-wrap gap-1 rounded-input bg-sand p-1 text-[12px]">
            {['Hoje', 'Dia', 'Semana', 'Mês', 'Lista'].map((view) => (
              <span
                key={view}
                className={`rounded-[8px] px-3 py-1.5 ${view === 'Lista' ? 'bg-surface font-[550] text-brand shadow-card' : 'text-quiet'}`}
              >
                {view}
              </span>
            ))}
          </div>
        </div>
        <p className="px-5 pt-4 text-[11px] text-muted">Encontros agrupados por dia</p>
        <div className="px-5 py-4">
          <p className="flex justify-between text-[10px] font-[550] tracking-[1px] text-label">
            {BOOKING.weekdayHeading}
            <span className="font-normal tracking-normal text-muted">1 aula(s)</span>
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-4 rounded-search border border-line bg-brand-wash px-4 py-3.5">
            <div className="tabular w-14">
              <p className="font-[550] text-brand">{BOOKING.time}</p>
              <p className="text-[11px] text-muted">{BOOKING.durationLabel}</p>
            </div>
            {perspective === 'admin' ? <Avatar initials="RL" size={32} /> : <Avatar initials="L" tone="a3" size={32} />}
            <div className="flex-1">
              <p className="font-[550]">{perspective === 'admin' ? 'Rafael Lima' : 'Luana'}</p>
              <p className="text-[11px] text-muted">{perspective === 'admin' ? 'Luana' : BOOKING.beach}</p>
            </div>
            <Badge tone="brand">Agendada</Badge>
          </div>
        </div>
        <p className="border-t border-line px-5 py-3 text-[11px] text-muted">
          Dados da demonstração · cada encontro conserva seu horário, duração e situação.
        </p>
      </Card>
    </>
  );
}

export function QueueList({ entries, highlightFirst = false }: { entries: readonly QueueEntry[]; highlightFirst?: boolean }) {
  return (
    <ol className="divide-y divide-line">
      {entries.map((entry) => (
        <li key={entry.name} className="flex items-center gap-3 py-3">
          <span className="tabular w-6 text-[13px] font-[550] text-muted">{entry.position}º</span>
          <Avatar initials={entry.initials} tone={entry.tone} size={32} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-[550]">
              {entry.name}
              {highlightFirst && entry.position === 1 ? <span className="font-normal text-muted"> · você</span> : null}
            </p>
            <p className="text-[11px] text-muted">{entry.beaches}</p>
          </div>
          <Badge>{entry.status}</Badge>
        </li>
      ))}
    </ol>
  );
}

export function EventLog() {
  return (
    <ul className="grid gap-3">
      {EVENT_LOG.map((event) => (
        <li key={event.text} className="flex gap-3">
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-success-soft text-success">
            <Icon name="wind" className="!h-4 !w-4" />
          </span>
          <div>
            <p className="text-[12px] font-[550]">{event.text}</p>
            <p className="text-[11px] text-muted">{event.meta}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}

export function SectionTitle({
  title,
  action,
  icon,
}: {
  title: string;
  action?: { label: string; href: string };
  icon?: IconName;
}) {
  return (
    <div className="mb-4 flex items-center justify-between gap-3">
      <h2 className="flex items-center gap-2 text-[18px] sm:text-[20px]">
        {icon ? <Icon name={icon} className="text-brand" /> : null}
        {title}
      </h2>
      {action ? (
        <Link href={action.href} className="flex items-center gap-1.5 text-[12px] font-[550] text-brand">
          <Icon name="arrow" className="!h-4 !w-4" />
          {action.label}
        </Link>
      ) : null}
    </div>
  );
}

/** Reservation rows shared by the admin overview and bookings screens. */
export function BookingsTable({ totalLabel }: { totalLabel: string }) {
  return (
    <div className="relative overflow-x-auto">
      <table className="w-full min-w-[640px] text-left">
        <thead>
          <tr className="bg-[#fafbfe] text-[10px] uppercase tracking-[.5px] text-quiet">
            <th className="px-4 py-3 font-medium">Reserva</th>
            <th className="px-4 py-3 font-medium">Aluno e instrutor</th>
            <th className="px-4 py-3 font-medium">Data da aula</th>
            <th className="px-4 py-3 font-medium">Total</th>
            <th className="px-4 py-3 font-medium">Situação</th>
            <th className="px-4 py-3">
              <span className="sr-only">Ações</span>
            </th>
          </tr>
        </thead>
        <tbody className="text-[12px] text-[#596b87]">
          <tr className="border-t border-[#eef1f6]">
            <td className="px-4 py-4">
              <strong className="block font-[550] text-brand">{BOOKING.code}</strong>
              {BOOKING.title}
            </td>
            <td className="px-4 py-4">
              <strong className="block font-[550] text-brand">Luana</strong>
              Rafael Lima
            </td>
            <td className="px-4 py-4">
              {BOOKING.dateShort} · {BOOKING.time}
              <br />
              {BOOKING.beach}
            </td>
            <td className="tabular px-4 py-4">{totalLabel}</td>
            <td className="px-4 py-4">
              <Badge>{BOOKING.status}</Badge>
            </td>
            <td className="px-4 py-4 text-right">
              <Button variant="ghost" size="sm">
                Detalhes
              </Button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
