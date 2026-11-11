import type { Metadata } from 'next';

import { Badge, ButtonLink, Card, Note, PageHeader } from '@/components/ui';
import { requireRole } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { protectionStage3Enabled } from '@/lib/protection-stage3';

export const metadata: Metadata = { title: 'Homologação · VentoKite Protege' };
export const dynamic = 'force-dynamic';

type CountCheck = { label: string; count: number | null; error: boolean };
type Status = 'ok' | 'pending' | 'blocked';

function Check({ label, status, description }: {
  label: string;
  status: Status;
  description: string;
}) {
  const appearance = {
    ok: { label: 'Verificado', tone: 'success' as const },
    pending: { label: 'Pendente', tone: 'warning' as const },
    blocked: { label: 'Bloqueado', tone: 'quiet' as const },
  }[status];
  return <li className="rounded-xl border border-line bg-surface px-4 py-3">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <strong className="text-[13px] text-ink">{label}</strong>
      <Badge tone={appearance.tone}>{appearance.label}</Badge>
    </div>
    <p className="mt-1 text-[12px] leading-relaxed text-muted">{description}</p>
  </li>;
}

/**
 * Admin-only, no-write release checklist. Every count is issued with the
 * authenticated Admin session and RLS; no service key, secret, mutation RPC
 * or test-user impersonation. A successful Admin read does NOT prove
 * participant-level RLS or live Storage uploads.
 */
export default async function ProtectionQaPage() {
  await requireRole(['admin'], '/admin/protege-homologacao');
  const db = await createSupabaseServerClient('admin');
  const checks = [
    { name: 'Manifestações', table: 'lesson_protection_statements' },
    { name: 'Análises', table: 'lesson_protection_reviews' },
    { name: 'Evidências', table: 'lesson_protection_evidence' },
    { name: 'Ocorrências', table: 'booking_incidents' },
  ] as const;

  const [statementQuery, reviewQuery, proofQuery, incidentQuery, instructorQuery, partnerQuery, studentQuery, demoBookingQuery] =
    await Promise.all([
      db.from(checks[0].table).select('id', { count: 'exact', head: true }),
      db.from(checks[1].table).select('id', { count: 'exact', head: true }),
      db.from(checks[2].table).select('id', { count: 'exact', head: true }),
      db.from(checks[3].table).select('id', { count: 'exact', head: true }),
      db.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'instructor'),
      db.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'partner'),
      db.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'student'),
      db.from('bookings').select('id', { count: 'exact', head: true }).eq('is_test', true),
    ]);

  const queries = [statementQuery, reviewQuery, proofQuery, incidentQuery];
  const entries: CountCheck[] = queries.map((q, i) => ({
    label: checks[i]?.name ?? 'Consulta',
    count: q.error ? null : q.count,
    error: Boolean(q.error),
  }));
  const databaseReadable = entries.every(item => !item.error);
  const cohortReadable = !instructorQuery.error && !partnerQuery.error &&
    !studentQuery.error && !demoBookingQuery.error;
  const instructors = instructorQuery.error ? null : instructorQuery.count;
  const partners = partnerQuery.error ? null : partnerQuery.count;
  const students = studentQuery.error ? null : studentQuery.count;
  const testBookings = demoBookingQuery.error ? null : demoBookingQuery.count;
  const uiEnabled = protectionStage3Enabled();

  return <div className="space-y-5">
    <PageHeader
      eyebrow="Admin · Homologação"
      title="VentoKite Protege"
      lead="Painel de verificação somente leitura. Nenhum teste desta página altera aula, pagamento, manifestação ou arquivo."
      action={<ButtonLink href="/admin/ocorrencias" variant="soft" size="sm">Ver ocorrências</ButtonLink>}
    />

    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-[17px] font-semibold text-ink">Situação da liberação</h2>
          <p className="mt-1 text-[12px] text-muted">
            O banco contém o módulo Protege, mas a liberação ao público exige testes adicionais.
          </p>
        </div>
        <Badge tone={uiEnabled ? 'warning' : 'quiet'}>
          {uiEnabled ? 'Interface ativada — verificar liberação' : 'Interface 3B desativada'}
        </Badge>
      </div>
      <Note tone="warning" className="mt-4" title="Proteção de acesso">
        A migration 41 foi instalada para bloquear quatro funções de escrita no Supabase.
        Este painel não testa a permissão EXECUTE em tempo real e não abre nenhuma dessas
        funções. A confirmação final dos grants deve ser feita pelo processo de segurança
        antes de alterar a flag de interface.
      </Note>
      {uiEnabled ? <Note tone="warning" className="mt-3">
        Atenção: a interface parece ativada. Verifique imediatamente a configuração
        de release e os grants de banco antes de qualquer uso.
      </Note> : null}
    </Card>

    <Card>
      <h2 className="text-[16px] font-semibold text-ink">Consultas do banco</h2>
      <p className="mt-1 text-[12px] text-muted">
        Totais visíveis para a sessão Admin, sob as regras do Supabase. Os resultados
        não provam, isoladamente, que outros perfis tenham as permissões corretas.
      </p>
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {entries.map(item => <div key={item.label}
          className="rounded-xl border border-line bg-brand-wash px-3 py-3">
          <p className="text-[11px] text-muted">{item.label}</p>
          <p className="mt-2 text-[22px] font-bold tabular-nums text-ink">
            {item.count === null ? '—' : item.count}
          </p>
          {item.error ? <span className="text-[11px] text-warning">Consulta indisponível</span> : null}
        </div>)}
      </div>
      <div className="mt-4 flex flex-wrap gap-2 text-[12px] text-muted">
        <span>Instrutores visíveis: <strong className="text-ink">{instructors ?? '—'}</strong></span>
        <span>· Alunos visíveis: <strong className="text-ink">{students ?? '—'}</strong></span>
        <span>· Afiliados visíveis: <strong className="text-ink">{partners ?? '—'}</strong></span>
        <span>· Reservas de teste visíveis: <strong className="text-ink">{testBookings ?? '—'}</strong></span>
      </div>
      {!databaseReadable || !cohortReadable ? <Note tone="warning" className="mt-3">
        Uma ou mais consultas falharam. Isso não significa que não existem registros;
        verifique a conexão e as permissões da sessão Admin.
      </Note> : null}
    </Card>

    <Card>
      <h2 className="text-[16px] font-semibold text-ink">Etapas para liberar a função</h2>
      <ol className="mt-4 grid gap-3">
        <Check
          label="1. Estrutura e consultas"
          status={databaseReadable ? 'ok' : 'pending'}
          description={databaseReadable
            ? 'As quatro tabelas de proteção responderam às consultas da conta Admin.'
            : 'Conferir tabelas, grants de leitura e acesso do Admin.'}
        />
        <Check
          label="2. Contas para homologação"
          status={cohortReadable && (instructors ?? 0) >= 2 && (students ?? 0) >= 1 && (partners ?? 0) >= 1 ? 'ok' : 'pending'}
          description={cohortReadable
            ? 'Para testar substituição, precisamos de ao menos dois instrutores cadastrados, um aluno e um afiliado. As contagens exibem apenas o que esta sessão pode consultar.'
            : 'Não foi possível contar os perfis de teste disponíveis.'}
        />
        <Check
          label="3. Permissões entre participantes"
          status="pending"
          description="Entrar separadamente como Aluno, Instrutor original, Instrutor substituto e Admin; conferir que cada um vê somente os próprios registros permitidos."
        />
        <Check
          label="4. Storage privado real"
          status="pending"
          description="Testar upload de JPEG/PNG/WebP/PDF, limites, confirmação, download assinado e bloqueio para Afiliado ou outro participante. Nunca usar fotos ou dados reais como massa de teste."
        />
        <Check
          label="5. iPhone, desktop e histórico"
          status="pending"
          description="Conferir formulários, mensagens, múltiplos encontros, reservas concluídas, paginação e acesso a relatos após troca de instrutor."
        />
        <Check
          label="6. Liberação controlada"
          status="blocked"
          description="Manter a migration 41 e a interface 3B bloqueadas até os testes e a política de retenção serem aprovados. A liberação exige nova migration auditada e alteração separada no Render."
        />
      </ol>
      <div className="mt-4 flex flex-wrap gap-2">
        <ButtonLink href="/aluno/ocorrencias" variant="soft" size="sm">Área do aluno</ButtonLink>
        <ButtonLink href="/instrutor/ocorrencias" variant="soft" size="sm">Área do instrutor</ButtonLink>
        <ButtonLink href="/admin/ocorrencias" variant="soft" size="sm">Ocorrências Admin</ButtonLink>
      </div>
      <p className="mt-3 text-[11px] text-muted">
        Cada área usa sessão própria. Abrir esses links com uma sessão Admin
        não substitui testar com uma conta real de cada perfil.
      </p>
    </Card>

    <Note title="Critério de conclusão">
      Esta página é um diagnóstico, não um certificado de homologação. Nenhuma
      área será marcada como 100% aprovada sem testes autenticados e
      evidências registradas no quadro mestre do GitHub.
    </Note>
  </div>;
}
