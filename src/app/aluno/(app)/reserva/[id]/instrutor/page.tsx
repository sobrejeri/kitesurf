import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { DesktopPageHeader } from '@/components/student/desktop-page-header';
import { StudentInstructorPhoto } from '@/components/student/instructor-photo';
import { StudentPageTitle } from '@/components/student/page-title';
import { Badge, Card } from '@/components/ui';
import { requireRole } from '@/lib/auth';
import { getBookingForViewer } from '@/lib/data';
import { formatDateLong } from '@/lib/format';
import { getInstructorPublicProfile } from '@/lib/instructor-public-profile-server';
import { getStudentBookingInstructorAvatar } from '@/lib/student-booking-avatar';

export const metadata: Metadata = { title: 'Seu instrutor' };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function BookingInstructorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const viewer = await requireRole(['student'], `/aluno/reserva/${id}/instrutor`);
  if (!UUID.test(id)) notFound();
  // Scoped to the viewer: someone else's booking id is a 404, not a page.
  const booking = await getBookingForViewer(id, viewer);
  if (!booking || booking.student_id !== viewer.id || !booking.instructor_id) notFound();

  const [profile, avatarUrl] = await Promise.all([
    getInstructorPublicProfile(booking.instructor_id),
    getStudentBookingInstructorAvatar(booking.id),
  ]);
  if (!profile) notFound();

  const stars = (n: number) => '★'.repeat(n) + '☆'.repeat(5 - n);
  return (
    <div className="vento-pc-secondary-page vento-mobile-appbar-clearance">
      <DesktopPageHeader eyebrow="SEU INSTRUTOR" title={profile.name}
        lead="Experiência, idiomas e avaliações de quem já fez aula."
        icon="user" backHref={`/aluno/reserva/${booking.id}`} variant="coast" />
      <div className="vento-pc-secondary-main space-y-4">
        <StudentPageTitle title={profile.name} subtitle="Perfil do instrutor" />
        <Card>
          <div className="flex items-center gap-4">
            <StudentInstructorPhoto name={profile.name} url={avatarUrl} size={72} />
            <div className="min-w-0">
              <h2 className="truncate text-[18px] font-semibold text-ink">{profile.name}</h2>
              <p className="text-[13px] text-muted">
                {profile.years_experience > 0
                  ? `${profile.years_experience} ${profile.years_experience === 1 ? 'ano' : 'anos'} de experiência`
                  : 'Experiência não informada'}
              </p>
              <p className="mt-1 text-[14px] font-semibold text-ink" aria-label={profile.rating_avg === null ? 'Sem avaliações' : `Nota ${profile.rating_avg} de 5`}>
                {profile.rating_avg === null
                  ? 'Ainda sem avaliações'
                  : `★ ${profile.rating_avg.toFixed(1)} · ${profile.rating_count} ${profile.rating_count === 1 ? 'avaliação' : 'avaliações'}`}
              </p>
            </div>
          </div>
          {profile.bio ? <p className="mt-4 text-[15px] leading-relaxed text-label">{profile.bio}</p> : null}
          <dl className="mt-4 grid gap-3 text-[14px] sm:grid-cols-2">
            <div>
              <dt className="text-[12px] font-semibold uppercase tracking-wide text-muted">Praias</dt>
              <dd className="mt-1 flex flex-wrap gap-2">{profile.beaches.length ? profile.beaches.map((b) => <Badge key={b} tone="brand">{b}</Badge>) : <span className="text-muted">Não informado</span>}</dd>
            </div>
            <div>
              <dt className="text-[12px] font-semibold uppercase tracking-wide text-muted">Idiomas</dt>
              <dd className="mt-1 flex flex-wrap gap-2">{profile.languages.length ? profile.languages.map((l) => <Badge key={l} tone="brand">{l}</Badge>) : <span className="text-muted">Não informado</span>}</dd>
            </div>
          </dl>
        </Card>
        <section aria-labelledby="reviews-title">
          <h2 id="reviews-title" className="mb-2 text-[16px] font-semibold text-ink">Avaliações recentes</h2>
          {profile.reviews.length === 0 ? (
            <Card><p className="text-[14px] text-muted">Ainda não há comentários.</p></Card>
          ) : (
            <ul className="space-y-3">
              {profile.reviews.map((r) => (
                <li key={`${r.created_at}-${r.comment.slice(0, 12)}`}>
                  <Card>
                    <p className="text-[14px] font-semibold text-ink" aria-label={`${r.stars} de 5 estrelas`}>{stars(r.stars)}</p>
                    <p className="mt-1 text-[14px] leading-relaxed text-label">{r.comment}</p>
                    <p className="mt-1 text-[12px] text-muted">{formatDateLong(r.created_at)}</p>
                  </Card>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
