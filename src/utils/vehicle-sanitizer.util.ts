/**
 * Sanitiza dados confidenciais do veículo para perfis públicos e visualizadores (RN003 / LGPD).
 */
const SENSITIVE_VEHICLE_FIELDS = [
  'full_license_plate',
  'purchase_price',
  'owner_price',
  'owner_name',
  'owner_contact',
  'store_commission_rate'
] as const;

export type SensitiveVehicleFields = typeof SENSITIVE_VEHICLE_FIELDS[number];

export type SanitizedVehicle<T> = Omit<T, SensitiveVehicleFields>;

function removeSensitiveFields(vehicle: Record<string, unknown>): Record<string, unknown> {
  const clone = { ...vehicle };

  SENSITIVE_VEHICLE_FIELDS.forEach(field => delete clone[field]);

  return clone;
}

/**
 * Sanitiza dados confidenciais do veículo para perfis públicos e visualizadores (RN003 / LGPD).
 */
export function sanitizeVehicleForRole<T extends object>(
  vehicle: T,
  role: 'ADMIN' | 'VENDEDOR'
): T;
export function sanitizeVehicleForRole<T extends object>(
  vehicle: T[],
  role: 'ADMIN' | 'VENDEDOR'
): T[];
export function sanitizeVehicleForRole<T extends object>(
  vehicle: T,
  role?: string
): SanitizedVehicle<T>;
export function sanitizeVehicleForRole<T extends object>(
  vehicle: T[],
  role?: string
): SanitizedVehicle<T>[];
export function sanitizeVehicleForRole<T extends object>(
  vehicle: T | T[],
  role?: string
): T | SanitizedVehicle<T> | T[] | SanitizedVehicle<T>[] {
  if (!vehicle) return vehicle;

  
  if (Array.isArray(vehicle)) {
    if (role?.toUpperCase() === 'ADMIN' || role?.toUpperCase() === 'VENDEDOR') {
      return vehicle;
    }

    return vehicle.map(v => 
      removeSensitiveFields(v as Record<string, unknown>)
    ) as SanitizedVehicle<T>[];
  }

  if (role?.toUpperCase() === 'ADMIN' || role?.toUpperCase() === 'VENDEDOR') {
    return { ...vehicle };
  }

  return removeSensitiveFields(vehicle as Record<string, unknown>) as SanitizedVehicle<T>;
}

