'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { requireRole } from '@/lib/auth';
import { supportVehicleProfileEnabled, supportVehicleSchemaUnavailable } from '@/lib/instructor-support-vehicle';
import { createSupabaseServerClient } from '@/lib/supabase/server';

import { friendlyError, type ActionState } from './errors';

const UNAVAILABLE = 'O cadastro do veículo ainda não está disponível. Tente novamente mais tarde.';
const Vehicle = z.strictObject({
  vehicleType: z.enum(['buggy', 'car', 'pickup', 'suv', 'van', 'other']),
  description: z.string().trim().min(2).max(80),
  passengerCapacity: z.string().regex(/^(?:[1-9]|1[0-9]|20)$/).transform(Number),
});

export async function saveInstructorSupportVehicle(_previous: ActionState, form: FormData): Promise<ActionState> {
  const viewer = await requireRole(['instructor']);
  if (viewer.role !== 'instructor') return { error: 'Apenas o instrutor pode editar seu veículo.' };
  if (!supportVehicleProfileEnabled()) return { error: UNAVAILABLE };
  const parsed = Vehicle.safeParse({
    vehicleType: form.get('vehicleType'), description: form.get('description'),
    passengerCapacity: form.get('passengerCapacity'),
  });
  if (!parsed.success) return { error: 'Confira o tipo, a identificação e a capacidade de 1 a 20 passageiros.' };
  const supabase = await createSupabaseServerClient();
  // No owner, price, eligibility or schedule parameter is accepted by the RPC.
  const { error } = await supabase.rpc('save_my_support_vehicle', {
    p_vehicle_type: parsed.data.vehicleType,
    p_description: parsed.data.description,
    p_passenger_capacity: parsed.data.passengerCapacity,
  });
  if (error) return { error: supportVehicleSchemaUnavailable(error) ? UNAVAILABLE : friendlyError(error) };
  revalidatePath('/instrutor/cadastro');
  return { ok: 'Dados do veículo atualizados.' };
}
