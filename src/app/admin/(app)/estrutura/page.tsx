import type { Metadata } from 'next';
import Link from 'next/link';

import { Card, Note, PageHeader } from '@/components/ui';

export const metadata: Metadata = { title: 'Estrutura da plataforma' };

const MODULES = [
  ['Afiliados', 'Cadastro, aprovação, link/QR e comissões de indicação.', '/admin/afiliados'],
  ['Conta e acesso', 'Sessões separadas por perfil e recuperação por e-mail via Supabase.', '/aluno/acesso'],
  ['Reservas e revisão', 'Horas livres, encontros, edição sem perder dados', '/aluno/reservar'],
  ['Fila', 'Ofertas sequenciais com prazos no servidor e validação de agenda.', '/admin/distribuicao'],
  ['Trabalho do instrutor', 'Dias, turnos, bloqueios e intervalo', '/instrutor/disponibilidade'],
  ['Presença e aprendizado', 'Código por encontro, registro de minutos e saldo', '/instrutor/aula'],
  ['Clima, cancelamento e ausência', 'Registro, análise, saldo e reembolso de teste', '/admin/ocorrencias'],
  ['Documentos', 'Upload privado e análise pelo administrador.', '/admin/documentos'],
  ['Atendimento e avisos', 'Ocorrências, respostas e pendências ligadas à conta.', '/admin/atendimento'],
  ['Financeiro', 'Comissão, líquido, saldo e liberação de teste', '/admin/financeiro'],
  ['Políticas comerciais', 'Rascunhos de regras ainda em validação', '/admin/politicas'],
] as const;

export default function PlatformMapPage() {
  return (
    <>
      <PageHeader eyebrow="Mapa do produto" title="Estrutura da plataforma" lead="Módulos e integrações da fase de validação, sem checkout." />
      <Card className="!p-0">
        <div className="relative overflow-x-auto">
          <table className="w-full min-w-[620px] text-left">
            <thead>
              <tr className="bg-sand text-[10.5px] uppercase tracking-[.5px] text-muted">
                <th className="px-5 py-3 font-medium sm:px-6">Módulo</th>
                <th className="px-5 py-3 font-medium sm:px-6">Funcionalidades</th>
                <th className="px-5 py-3 sm:px-6"><span className="sr-only">Abrir</span></th>
              </tr>
            </thead>
            <tbody className="text-[12.5px] text-label">
              {MODULES.map(([module, available, href]) => (
                <tr key={module} className="border-t border-line">
                  <td className="px-5 py-3.5 font-[550] text-ink sm:px-6">{module}</td>
                  <td className="px-5 py-3.5 sm:px-6">{available}</td>
                  <td className="px-5 py-3.5 text-right sm:px-6"><Link href={href} className="font-[550] text-brand">Abrir</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <Card className="mt-5">
        <h2 className="text-[16px]">Integrações da versão operacional</h2>
        <p className="mt-2 text-[12px] leading-relaxed text-muted">
          Autenticação, dados compartilhados e arquivos privados usam o Supabase.
          As migrações precisam estar aplicadas no projeto ativo. Entrega de e-mails
          depende da configuração de autenticação. Push externo, checkout, cobranças,
          reembolsos e repasses financeiros não estão ativados nesta fase.
        </p>
      </Card>
      <Note className="mt-5">Aulas de validação não geram cobrança ou repasse. Agendamento, mensagens e alterações precisam de conexão com a internet.</Note>
    </>
  );
}
