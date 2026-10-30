import type { Metadata } from 'next';
import Link from 'next/link';

import { AdminTitle } from '@/components/admin/kit';
import { Icon, type IconName } from '@/components/icon';
import { requireRole } from '@/lib/auth';

export const metadata: Metadata = { title: 'Configurações' };

interface Item {
  label: string;
  icon: IconName;
  href?: string;
}

const GROUPS: readonly { title: string; items: readonly Item[] }[] = [
  {
    title: 'Plataforma',
    items: [
      { label: 'Valor da hora e comissões', icon: 'wallet', href: '/admin/regras' },
      { label: 'Praias e localizações', icon: 'pin', href: '/admin/praias' },
      { label: 'Pontos de encontro', icon: 'pin', href: '/admin/pontos' },
      { label: 'Regras de cancelamento', icon: 'shield', href: '/admin/politicas' },
      { label: 'Formas de pagamento', icon: 'wallet' },
      { label: 'Notificações e e-mails', icon: 'bell' },
    ],
  },
  {
    title: 'Segurança',
    items: [
      { label: 'Auditoria de atividades', icon: 'list', href: '/admin/auditoria' },
      { label: 'Usuários administradores', icon: 'users' },
    ],
  },
];

export default async function SettingsPage() {
  await requireRole(['admin'], '/admin/configuracoes');
  return (
    <>
      <AdminTitle title="Configurações" />
      <div className="grid gap-5 lg:grid-cols-2">
        {GROUPS.map((group) => (
          <section key={group.title}>
            <h2 className="mb-2 px-1 text-[14px] font-semibold text-ink">{group.title}</h2>
            <ul className="overflow-hidden rounded-[18px] border border-line bg-surface">
              {group.items.map((item) => {
                const body = (
                  <>
                    <Icon name={item.icon} className="!h-5 !w-5 text-label" />
                    <span className="flex-1 text-[14px] text-ink">{item.label}</span>
                    {item.href ? (
                      <Icon name="chevron" className="!h-4 !w-4 text-muted" />
                    ) : (
                      <span className="rounded-full bg-sand px-2.5 py-1 text-[11px] text-muted">Em breve</span>
                    )}
                  </>
                );
                return (
                  <li key={item.label} className="border-b border-line last:border-b-0">
                    {item.href ? (
                      <Link href={item.href} className="flex items-center gap-3 px-4 py-3.5 active:bg-sand">{body}</Link>
                    ) : (
                      <div className="flex items-center gap-3 px-4 py-3.5">{body}</div>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
      <p className="mt-5 text-[12px] text-muted">
        Novos administradores são promovidos pelo SQL Editor do Supabase (supabase/bootstrap-admin.sql). Ninguém vira admin pelo cadastro.
      </p>
    </>
  );
}
