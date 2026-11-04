import type { Metadata } from 'next';
import { AdminTitle } from '@/components/admin/kit';
import { Card, Note } from '@/components/ui';
import { requireRole } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Equipe administrativa' };
export default async function TeamPage() {
  const viewer = await requireRole(['admin'], '/admin/equipe');
  const db = await createSupabaseServerClient();
  const {data,error} = await db.from('profiles').select('id,full_name').eq('role','admin').order('full_name');
  if (error) throw new Error('Não foi possível consultar a equipe administrativa.');
  return <>
    <AdminTitle title="Equipe administrativa" subtitle={`${data?.length ?? 0} conta(s) com acesso administrativo`} />
    <Card><ul className="divide-y divide-line">
      {(data??[]).map(person=><li key={person.id} className="py-3 text-[14px] text-ink">
        <strong>{person.full_name || 'Administrador'}</strong>
        {person.id===viewer.id ? <span className="ml-2 text-[12px] text-brand">Sua conta</span>:null}
        <span className="mt-1 block break-all text-[11px] text-muted">Identificador: {person.id}</span>
      </li>)}
    </ul></Card>
    <Note className="mt-4">Novos acessos administrativos são concedidos pela operação no Supabase. O cadastro público nunca cria administradores.</Note>
  </>;
}
