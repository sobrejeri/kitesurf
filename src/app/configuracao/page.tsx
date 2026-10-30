import type { Metadata } from 'next';

import { Logo } from '@/components/shells';
import { Card, Note } from '@/components/ui';

export const metadata: Metadata = { title: 'Configuração pendente' };

export default function SetupPage() {
  return (
    <main className="mx-auto max-w-xl px-4 py-12">
      <Logo />
      <h1 className="mt-8 text-[28px] tracking-[-0.9px]">Conecte o Supabase</h1>
      <Card className="mt-6">
        <p className="text-[13px] text-muted">
          As áreas com login precisam das variáveis de ambiente do projeto Supabase. Defina-as e gere o build de novo:
        </p>
        <pre className="mt-4 overflow-x-auto rounded-input bg-canvas p-4 text-[12px]">
{`NEXT_PUBLIC_SUPABASE_URL=https://<seu-projeto>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<chave anon/publishable>
NEXT_PUBLIC_SITE_URL=https://<seu-app>.onrender.com`}
        </pre>
        <Note className="mt-4">Apenas a chave pública (anon). Nenhuma chave secreta é usada pelo app.</Note>
      </Card>
    </main>
  );
}
