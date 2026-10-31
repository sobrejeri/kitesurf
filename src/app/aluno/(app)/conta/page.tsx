import type { Metadata } from 'next';

import { signOut } from '@/app/actions/auth';
import { uploadStudentAvatar } from '@/app/actions/student';
import { Icon } from '@/components/icon';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { ProfileEditor } from '@/components/student/profile-editor';
import { ProfilePhotoPicker } from '@/components/profile-photo-picker';
import { StudentHero, SunsetEmpty } from '@/components/student/sunset';
import { ButtonLink } from '@/components/ui';
import { requireRole } from '@/lib/auth';
import { listBookingsForStudent } from '@/lib/data';
import { formatDateLong, formatMinutes } from '@/lib/format';

export const metadata: Metadata = { title: 'Meu perfil' };

export default async function AccountPage() {
  const viewer = await requireRole(['student'], '/aluno/conta');
  const supabase = await createSupabaseServerClient();
  const [bookings, avatarRecord] = await Promise.all([
    listBookingsForStudent(viewer.id),
    supabase.from('student_private_profiles')
      .select('avatar_path')
      .eq('id', viewer.id)
      .maybeSingle<{ avatar_path: string | null }>(),
  ]);
  const avatarReady = !avatarRecord.error;
  let avatarUrl: string | null = null;
  if (avatarRecord.data?.avatar_path) {
    try {
      const { data, error } = await supabase.storage.from('vento-student-avatars')
        .createSignedUrl(avatarRecord.data.avatar_path, 60 * 60);
      if (error) console.warn('[student-profile] Could not retrieve avatar', { message: error.message });
      avatarUrl = data?.signedUrl ?? null;
    } catch (error) {
      console.error('[student-profile] Error while loading avatar', error);
    }
  }
  const history = bookings
    .flatMap((booking) => booking.booking_meetings.filter((m) => m.status === 'done'))
    .sort((a, b) => b.starts_at.localeCompare(a.starts_at))
    .slice(0, 3);
  const firstName = viewer.fullName.split(' ')[0];

  return (
    <>
      <StudentHero
        image="lesson"
        eyebrow="Meu perfil"
        title={firstName ? `Olá, ${firstName}!` : 'Olá!'}
        highlight={firstName ? `${firstName}!` : undefined}
        lead="Seu próximo bordo começa aqui."
        compact
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-[22px] border border-line bg-surface p-5">
          <div className="flex flex-wrap items-center gap-4">
            <ProfilePhotoPicker
              action={uploadStudentAvatar}
              photoUrl={avatarUrl}
              name={viewer.fullName || 'Aluno'}
              accent="cyan"
              enabled={avatarReady}
            />
            <div className="min-w-0 flex-1">
              <p className="break-words text-[20px] font-bold leading-tight text-ink">{viewer.fullName || 'Sem nome'}</p>
              <p className="text-[13px] text-muted">{viewer.language} · Aluno</p>
              <p className="mt-1 text-[12px] text-label">{avatarUrl ? 'Toque no + para trocar a foto' : 'Toque no círculo para adicionar uma foto'}</p>
            </div>
            <ProfileEditor fullName={viewer.fullName} language={viewer.language} />
          </div>
          <dl className="mt-5 divide-y divide-line border-y border-line text-[14px]">
            <div className="flex items-center gap-3 py-3.5">
              <Icon name="mail" className="!h-5 !w-5 text-label" />
              <dt className="flex-1 text-label">E-mail</dt>
              <dd className="truncate text-ink">{viewer.email}</dd>
            </div>
            <div className="flex items-center gap-3 py-3.5">
              <Icon name="globe" className="!h-5 !w-5 text-label" />
              <dt className="flex-1 text-label">Idioma</dt>
              <dd className="text-ink">{viewer.language}</dd>
            </div>
          </dl>
          <form action={signOut} className="mt-5">
            <button type="submit" className="press flex items-center gap-2.5 rounded-full border border-brand/70 px-6 py-3 text-[14px] font-semibold text-brand">
              <Icon name="logout" className="!h-5 !w-5" /> Sair da conta
            </button>
          </form>
        </section>

        <section className="relative overflow-hidden rounded-[22px] border border-line bg-surface p-5">
          <img src="/images/prea-coast.webp" alt="" className="sunset-photo absolute inset-y-0 right-0 h-full w-[60%] object-cover" style={{ objectPosition: '85% 40%' }} />
          <span className="absolute inset-0 bg-[linear-gradient(90deg,var(--color-surface)_40%,transparent_100%)]" aria-hidden="true" />
          <div className="relative">
            <Icon name="users" className="!h-8 !w-8 text-brand" />
            <h2 className="mt-2 text-[24px] font-bold leading-tight text-ink">
              Precisa de uma mão?
            </h2>
            <p className="mt-1 text-[14px] text-label">Conte com a gente para sua aula.</p>
            <p className="mt-2 text-[14px] font-semibold text-brand">Menos pressa. Mais mar.</p>
            <ButtonLink href="/aluno/central" trailingIcon="arrow" className="mt-4 px-7">Abrir central de aulas</ButtonLink>
            <p className="mt-4 flex gap-3 border-t border-line pt-4 text-[12px] text-label">
              <Icon name="clock" className="!h-5 !w-5 shrink-0" />
              Seu histórico acompanha você. Suas horas ficam vinculadas à reserva e ao instrutor contratado.
            </p>
          </div>
        </section>

        <section className="rounded-[22px] border border-line bg-surface p-5 lg:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="flex items-center gap-3 text-[20px] font-bold text-ink">
              <Icon name="chart" className="!h-6 !w-6 text-brand" /> Extrato de horas
            </h2>
            <ButtonLink href="/aluno/evolucao" variant="ghost" size="sm" trailingIcon="chevron">Ver todos</ButtonLink>
          </div>
          {history.length === 0 ? (
            <SunsetEmpty icon="clock">Os registros aparecem aqui quando o instrutor fecha cada aula.</SunsetEmpty>
          ) : (
            <ul className="grid gap-3">
              {history.map((meeting) => (
                <li key={meeting.id} className="flex items-center justify-between rounded-search border border-line px-4 py-3 text-[13px]">
                  <span className="text-label">{formatDateLong(meeting.starts_at)}</span>
                  <strong className="tabular font-semibold text-brand">{formatMinutes(meeting.done_minutes)}</strong>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
