import type { Metadata } from 'next';

import { Avatar, Badge, Button, Card, Note, PageHeader } from '@/components/ui';
import { INSTRUCTORS } from '@/data/demo';

export const metadata: Metadata = { title: 'Instrutores' };

const SIGNUP_SECTIONS = [
  'Identificação',
  'Experiência e formação',
  'Praias atendidas',
  'Idiomas',
  'Equipamentos e apoio',
  'Dados de recebimento',
] as const;

export default function InstructorsPage() {
  const pending = INSTRUCTORS.filter((row) => row.pending).length;
  return (
    <>
      <PageHeader
        eyebrow="Pessoas que fazem acontecer"
        title="Instrutores"
        lead="Analise cadastros, disponibilidade e áreas de atendimento."
      />
      <Card className="!p-0">
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-5 sm:px-6">
          <div>
            <h2 className="text-[16px]">Rede de profissionais</h2>
            <p className="text-[11px] text-muted">{INSTRUCTORS.length} perfis demonstrativos · {pending} aguardando análise</p>
          </div>
          <Badge tone="brand">Independentes</Badge>
        </div>
        <div className="relative mt-4 overflow-x-auto">
          <table className="w-full min-w-[760px] text-left">
            <thead>
              <tr className="bg-[#fafbfe] text-[10px] uppercase tracking-[.5px] text-quiet">
                {['Profissional', 'Atendimento', 'Idiomas', 'Situação', 'Ações'].map((head) => (
                  <th key={head} className="px-5 py-3 font-medium sm:px-6">{head}</th>
                ))}
              </tr>
            </thead>
            <tbody className="text-[12px] text-[#596b87]">
              {INSTRUCTORS.map((row) => (
                <tr key={row.name} className="border-t border-[#eef1f6]">
                  <td className="px-5 py-4 sm:px-6">
                    <div className="flex items-center gap-3">
                      <Avatar initials={row.initials} tone={row.tone} size={34} />
                      <span>
                        <strong className="block font-[550] text-ink">{row.name}</strong>
                        {row.years} anos de experiência
                      </span>
                    </div>
                  </td>
                  <td className="px-5 py-4 sm:px-6">{row.beaches}</td>
                  <td className="px-5 py-4 sm:px-6">{row.languages}</td>
                  <td className="px-5 py-4 sm:px-6">
                    <Badge tone={row.pending ? 'warning' : 'success'}>{row.status}</Badge>
                  </td>
                  <td className="px-5 py-4 sm:px-6">
                    <div className="flex gap-2">
                      <Button variant="ghost" size="sm">Ver perfil</Button>
                      <Button variant={row.pending ? 'primary' : 'soft'} size="sm">{row.pending ? 'Analisar cadastro' : 'Pausar'}</Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Card>
          <h2 className="text-[16px]">Informações do cadastro</h2>
          <ul className="mt-3 grid grid-cols-2 gap-2 text-[12px] text-label">
            {SIGNUP_SECTIONS.map((section) => (
              <li key={section} className="rounded-input bg-sand px-3 py-2">{section}</li>
            ))}
          </ul>
          <p className="mt-3 text-[12px] text-muted">O administrador analisa as informações antes de liberar o perfil para receber pedidos.</p>
        </Card>
        <Note className="self-start">A aprovação inclui o instrutor no final da fila. Pausar e reativar preserva a posição que ele já possuía.</Note>
      </div>
    </>
  );
}
