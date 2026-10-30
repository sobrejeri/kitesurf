import type { Metadata } from 'next';
import Link from 'next/link';

import { Card, Note, PageHeader } from '@/components/ui';

export const metadata: Metadata = { title: 'Estrutura da plataforma' };

const MODULES = [
  ['Pousadas afiliadas', 'Cadastro, aprovação, link/QR e comissões de indicação.', '/admin/afiliados'],
  ['Conta e acesso', 'Entrada, cadastro e recuperação simulados', '/aluno/acesso'],
  ['Reservas e revisão', 'Horas livres, encontros, edição sem perder dados', '/aluno/reservar'],
  ['Fila', 'Distribuição sequencial e agenda; uma solicitação ativa no navegador', '/admin/distribuicao'],
  ['Trabalho do instrutor', 'Dias, turnos, bloqueios e intervalo', '/instrutor/disponibilidade'],
  ['Presença e aprendizado', 'Código por encontro, registro de minutos e saldo', '/instrutor/aula'],
  ['Clima, cancelamento e ausência', 'Registro, análise, saldo e reembolso de teste', '/admin/ocorrencias'],
  ['Documentos', 'Referências fictícias e análise pelo admin', '/admin/documentos'],
  ['Atendimento e avisos', 'Conversa e caixa de entrada locais', '/admin/atendimento'],
  ['Financeiro', 'Comissão, líquido, saldo e liberação de teste', '/admin/financeiro'],
  ['Políticas comerciais', 'Rascunhos de regras ainda em validação', '/admin/politicas'],
] as const;

export default function PlatformMapPage() {
  return (
    <>
      <PageHeader eyebrow="Mapa do produto" title="Estrutura da plataforma" lead="Fluxos navegáveis para revisar antes de integrar serviços reais." />
      <Card className="!p-0">
        <div className="relative overflow-x-auto">
          <table className="w-full min-w-[620px] text-left">
            <thead>
              <tr className="bg-[#fafbfe] text-[10px] uppercase tracking-[.5px] text-quiet">
                <th className="px-5 py-3 font-medium sm:px-6">Módulo</th>
                <th className="px-5 py-3 font-medium sm:px-6">Disponível no esboço</th>
                <th className="px-5 py-3 sm:px-6"><span className="sr-only">Abrir</span></th>
              </tr>
            </thead>
            <tbody className="text-[12px] text-[#596b87]">
              {MODULES.map(([module, available, href]) => (
                <tr key={module} className="border-t border-[#eef1f6]">
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
          Autenticação e permissões, banco de dados compartilhado, várias solicitações simultâneas, prazos no servidor, upload seguro, notificações push, cobrança, reembolso, repasse e monitoramento permanecem pendentes.
        </p>
      </Card>
      <Note className="mt-5">O esboço permite revisar a jornada. Não garante sincronização entre dispositivos nem funcionamento operacional offline.</Note>
    </>
  );
}
