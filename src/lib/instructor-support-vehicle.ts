/** Descriptive profile only; the existing instructor agenda and global rate apply. */
export function supportVehicleProfileEnabled(): boolean {
  return process.env.NEXT_PUBLIC_VENTO_SUPPORT_VEHICLE_PROFILE_ENABLED === 'true';
}

export const SUPPORT_VEHICLE_TYPES = {
  buggy: 'Buggy', car: 'Carro', pickup: 'Picape', suv: 'SUV / 4×4', van: 'Van', other: 'Outro',
} as const;

export type SupportVehicle = {
  vehicle_type: keyof typeof SUPPORT_VEHICLE_TYPES;
  description: string;
  passenger_capacity: number;
};

export function supportVehicleSchemaUnavailable(error: { code?: string }): boolean {
  return ['42P01', '42703', '42883', 'PGRST202', 'PGRST204', 'PGRST205'].includes(error.code ?? '');
}
