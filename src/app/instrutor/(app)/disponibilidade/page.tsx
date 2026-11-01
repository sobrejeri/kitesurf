import type { Metadata } from 'next';

import { saveInstructorSchedule } from '@/app/actions/availability';
import { ActionForm } from '@/components/action-form';
import { ButtonLink, Card, Field, Note, PageHeader, inputClass } from '@/components/ui';
import { requireRole } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Dias e turnos' };
const DAYS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

type Setting = { buffer_minutes: number };
type Shift = { weekday: number; opens_at: string; closes_at: string };

export default async function AvailabilityPage() {
  const viewer = await requireRole(['instructor'], '/instrutor/disponibilidade');
  const db = await createSupabaseServerClient();
  const [settings, shifts] = await Promise.all([
    db.from('instructor_schedule_settings').select('buffer_minutes').eq('instructor_id', viewer.id).maybeSingle<Setting>(),
    db.from('instructor_weekly_hours').select('weekday,opens_at,closes_at').eq('instructor_id', viewer.id).returns<Shift[]>(),
  ]);
  const ready = !settings.error && !shifts.error;
  const configured = Boolean(settings.data);
  const first = shifts.data?.[0];
  const activeDays = new Set(configured ? (shifts.data ?? []).map((x) => x.weekday) : [1, 2, 3, 4, 5, 6]);

  return (
    <>
      <PageHeader eyebrow="Sua disponibilidade" title="Dias e turnos"
        lead="A busca de instrutores respeita os dias, horários e bloqueios registrados aqui." />
      {!ready ? (
        <Note tone="warning">Para ativar a agenda real, execute a migração de disponibilidade no Supabase. Nenhuma informação será simulada.</Note>
      ) : (
        <Card className="max-w-3xl">
          {!configured && <Note tone="warning" className="mb-4">Configure seus turnos para que as novas reservas respeitem sua rotina. Até salvar, a regra anterior continua ativa.</Note>}
          <ActionForm action={saveInstructorSchedule} submitLabel="Salvar minha disponibilidade" className="grid gap-5">
            <fieldset>
              <legend className="mb-3 text-[14px] font-semibold text-ink">Dias em que posso atender</legend>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {DAYS.map((day, index) => (
                  <label key={day} className="flex min-h-12 cursor-pointer items-center gap-2 rounded-xl border border-line px-3 text-[13px] text-ink">
                    <input type="checkbox" name="days" value={index} defaultChecked={activeDays.has(index)} className="accent-orange-500" />
                    {day}
                  </label>
                ))}
              </div>
              <p className="mt-2 text-[12px] text-muted">Desmarque todos os dias para suspender novas reservas sem apagar sua conta.</p>
            </fieldset>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Início do turno"><input type="time" name="opens" required defaultValue={first?.opens_at.slice(0,5) ?? '08:00'} className={inputClass}/></Field>
              <Field label="Fim do turno"><input type="time" name="closes" required defaultValue={first?.closes_at.slice(0,5) ?? '17:00'} className={inputClass}/></Field>
              <Field label="Intervalo entre aulas (minutos)"><input type="number" name="buffer" min="0" max="120" step="5" defaultValue={settings.data?.buffer_minutes ?? 30} required className={inputClass}/></Field>
            </div>
            <Note>Os turnos usam o horário de Preá e Jericoacoara (UTC−3). Alterações valem para novos pedidos; aulas confirmadas não são apagadas.</Note>
            <ButtonLink href="/instrutor/agenda" variant="ghost">Abrir agenda e bloquear períodos</ButtonLink>
          </ActionForm>
        </Card>
      )}
    </>
  );
}
