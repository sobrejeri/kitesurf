import { saveInstructorSupportVehicle } from '@/app/actions/instructor-support-vehicle';
import { ActionForm } from '@/components/action-form';
import { Card, Field, Note, inputClass } from '@/components/ui';
import { SUPPORT_VEHICLE_TYPES, supportVehicleProfileEnabled, type SupportVehicle } from '@/lib/instructor-support-vehicle';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export async function InstructorSupportVehiclePanel({ instructorId }: { instructorId: string }) {
  if (!supportVehicleProfileEnabled()) return null;
  const db = await createSupabaseServerClient();
  const { data: vehicle, error } = await db.from('instructor_support_vehicles')
    .select('vehicle_type,description,passenger_capacity')
    .eq('instructor_id', instructorId).maybeSingle<SupportVehicle>();
  if (error) return <Note tone="warning">O cadastro do veículo ainda não está disponível. Tente novamente mais tarde.</Note>;

  return <Card className="!p-4 sm:!p-6">
    <details className="group">
      <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 rounded-xl focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand [&::-webkit-details-marker]:hidden">
        <span>
          <strong className="block text-[17px] font-extrabold leading-snug text-ink">Veículo de apoio</strong>
          <span className="mt-1 block text-[12px] text-muted">{vehicle ? `${SUPPORT_VEHICLE_TYPES[vehicle.vehicle_type]} · ${vehicle.passenger_capacity} passageiro(s)` : 'Tipo, identificação e capacidade'}</span>
        </span>
        <span className="text-[12px] font-semibold text-brand">Editar</span>
      </summary>
      <p className="mt-3 text-[12px] leading-relaxed text-muted">Cadastre o veículo que acompanha suas aulas. A disponibilidade segue sua agenda de instrutor.</p>
      <ActionForm action={saveInstructorSupportVehicle} submitLabel="Salvar veículo" wideSubmit className="mt-4 grid gap-4">
        <Field label="Tipo do veículo">
          {/* Refresh the saved default after revalidation without remounting ActionForm or losing its result. */}
          <select key={vehicle?.vehicle_type ?? 'new-vehicle'} name="vehicleType" required defaultValue={vehicle?.vehicle_type ?? ''} className={inputClass}>
            <option value="" disabled>Selecionar tipo</option>
            {Object.entries(SUPPORT_VEHICLE_TYPES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </Field>
        <Field label="Identificação do veículo" hint="Marca, modelo ou cor. Não informe placa ou documento.">
          <input name="description" required minLength={2} maxLength={80} defaultValue={vehicle?.description ?? ''} className={inputClass}/>
        </Field>
        <Field label="Capacidade de passageiros" hint="Sem contar o motorista.">
          <input name="passengerCapacity" type="number" required min={1} max={20} step={1} defaultValue={vehicle?.passenger_capacity ?? ''} className={inputClass}/>
        </Field>
      </ActionForm>
    </details>
  </Card>;
}
