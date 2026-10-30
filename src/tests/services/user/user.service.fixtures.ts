import type { User } from '#repositories/user.repository.js';

export const USER_ID = '7c9e6679-7425-40de-944b-e07fc1f90ae7';
export const OTHER_USER_ID = 'a3f1c2d4-5b6e-4f7a-8c9d-0e1f2a3b4c5d';
export const USER_EMAIL = 'raul.ferreira@garagem.com';
export const OTHER_USER_EMAIL = 'ana.souza@garagem.com';
export const USER_PASSWORD = 'SenhaSegura123!';
export const PASSWORD_HASH =
  '$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy';
export const HASHED_PASSWORD =
  '$2b$10$EixZaYVK1fsbw1ZfbX3OXePaWxn96p36WQoeG6Lruj3vjPGga31lW';

export const safeUser: Omit<User, 'password_hash'> = {
  id: USER_ID,
  name: 'Raul Ferreira',
  email: USER_EMAIL,
  phone: '(37) 99999-9999',
  role: 'VENDEDOR',
  commission_rates: 7.5,
  is_active: true,
  deleted_at: null,
  created_at: new Date('2026-01-10T12:00:00.000Z'),
};

export const otherSafeUser: Omit<User, 'password_hash'> = {
  id: OTHER_USER_ID,
  name: 'Ana Souza',
  email: OTHER_USER_EMAIL,
  phone: '(31) 98888-7777',
  role: 'VISUALIZADOR',
  commission_rates: null,
  is_active: true,
  deleted_at: null,
  created_at: new Date('2026-02-20T09:30:00.000Z'),
};

export const buildUser = (overrides: Partial<User> = {}): User => ({
  ...safeUser,
  password_hash: PASSWORD_HASH,
  ...overrides,
});

export const createInput = {
  name: 'Raul Ferreira',
  email: USER_EMAIL,
  password: USER_PASSWORD,
  phone: '(37) 99999-9999',
};
