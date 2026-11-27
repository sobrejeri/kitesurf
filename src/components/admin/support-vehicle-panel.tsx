import Link from 'next/link';

import { Panel } from '@/components/admin/kit';
import { EmptyState, Note } from '@/components/ui';
import { requireRole } from '@/lib/auth';
import { SUPPORT_VEHICLE_TYPES, supportVehicleProfileEnabled, type SupportVehicle } from '@/lib/instructor-support-vehicle';
import { createSupabaseServerClient } from '@/lib/supabase/server';

type VehicleRow = SupportVehicle & { instructor_id: string };

/** Read-only descriptive metadata; pricing and availability stay in the existing panel. */
export async function AdminSupportVehiclePanel() {
  if (!supportVehicleProfileEnabled()) return null;
  const viewer = await requireRole(['admin'], '/admin/transporte');
  if (viewer.role !== 'admin' || !viewer.secondFactor) return null;
  const db = await createSupabaseServerClient();
  const { data, error } = await db.from('instructor_support_vehicles')
    .select('instructor_id,vehicle_type,description,passenger_capacity')
    .order('instructor_id', { ascending: true }).limit(500).returns<VehicleRow[]>();

  return <Panel title="Cadastro dos veículos" className="mt-4">
    <p className="mb-3 text-[12px] text-muted">Tipo, identificação e capacidade informados pelo instrutor.</p>
    {error ? <Note tone="warning">Os cadastros dos veículos estão temporariamente indisponíveis. Tente novamente mais tarde.</Note>
      : (data ?? []).length === 0 ? <EmptyState>Nenhum veículo cadastrado.</EmptyState>
        : <ul className="divide-y divide-line">
          {(data ?? []).map(vehicle => <li key={vehicle.instructor_id} className="flex flex-wrap items-center justify-between gap-3 py-3">
            <div className="min-w-0 flex-1">
              <strong className="block text-[14px] font-semibold text-ink">{SUPPORT_VEHICLE_TYPES[vehicle.vehicle_type]}</strong>
              <span className="block break-words text-[13px] text-label">{vehicle.description}</span>
              <span className="mt-1 block text-[12px] text-muted">{vehicle.passenger_capacity} {vehicle.passenger_capacity === 1 ? 'passageiro' : 'passageiros'} · sem contar o motorista</span>
            </div>
            <Link href={`/admin/instrutores/${vehicle.instructor_id}`} className="inline-flex min-h-11 items-center px-2 text-[13px] font-semibold text-brand underline">Ver instrutor</Link>
          </li>)}
        </ul>}
    {!error && data?.length === 500 ? <p className="mt-3 text-[12px] text-muted">Mostrando os primeiros 500 cadastros.</p> : null}
  </Panel>;
}
