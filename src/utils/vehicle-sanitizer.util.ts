/**
 * Sanitiza dados confidenciais do veículo para perfis públicos e visualizadores (RN003 / LGPD).
 */
export type SensitiveVehicleFields =
  | 'full_license_plate'
  | 'purchase_price'
  | 'owner_price'
  | 'owner_name'
  | 'owner_contact'
  | 'store_commission_rate';

export type SanitizedVehicle<T> = Omit<T, SensitiveVehicleFields>;

/**
 * Sanitiza dados confidenciais do veículo para perfis públicos e visualizadores (RN003 / LGPD).
 */
export function sanitizeVehicleForRole<T extends object>(
  vehicle: T,
  role: 'ADMIN' | 'VENDEDOR'
): T;
export function sanitizeVehicleForRole<T extends object>(
  vehicle: T,
  role?: string
): SanitizedVehicle<T>;
export function sanitizeVehicleForRole<T extends object>(
  vehicle: T,
  role?: string
): T | SanitizedVehicle<T> {
  if (role === 'ADMIN' || role === 'VENDEDOR') {
    return { ...vehicle };
  }

  const {
    full_license_plate, // eslint-disable-line
    purchase_price, // eslint-disable-line
    owner_price, // eslint-disable-line
    owner_name, // eslint-disable-line
    owner_contact, // eslint-disable-line
    store_commission_rate, // eslint-disable-line
    ...publicData
  } = vehicle as Record<string, unknown>;

  return publicData as SanitizedVehicle<T>;
}

