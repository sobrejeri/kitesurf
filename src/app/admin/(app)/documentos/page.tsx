import type { Metadata } from 'next';

import { ButtonLink, EmptyState, PageHeader } from '@/components/ui';

export const metadata: Metadata = { title: 'Validar documentos' };

export default function AdminDocumentsPage() {
  return (
    <>
      <PageHeader
        eyebrow="Formação e estrutura"
        title="Documentos dos instrutores"
        lead="O esboço registra referências de documentos de teste. Upload e validação reais serão integrados depois."
      />
      <EmptyState action={<ButtonLink href="/admin/instrutores" size="sm">Aprovar cadastros</ButtonLink>}>
        Nenhum documento enviado. Na área do instrutor, escolha o perfil e envie uma referência fictícia.
      </EmptyState>
    </>
  );
}
