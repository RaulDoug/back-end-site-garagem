import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { main } from '#src/server.js';
import app from '#src/app.js';
import pool from '#src/config/database.js';
import { ensureUploadDirs } from '#utils/storage.util.js';
import { getSecretKey } from '#utils/jwt.util.js';
import { getOnboardingSecret } from '#middlewares/auth.middleware.js';

vi.mock('#src/app.js', () => ({
  default: {
    listen: vi.fn((_port, cb?: () => void) => {
      cb?.();
      return {};
    }),
  },
}));

vi.mock('#src/config/database.js', () => ({
  default: {
    query: vi.fn(),
  },
}));

vi.mock('#utils/storage.util.js', () => ({
  ensureUploadDirs: vi.fn(),
}));

vi.mock('#utils/jwt.util.js', () => ({
  getSecretKey: vi.fn(),
}));

vi.mock('#middlewares/auth.middleware.js', () => ({
  getOnboardingSecret: vi.fn(),
}));

vi.mock('#repositories/vehicle.repository.js', () => ({
  VehicleRepository: vi.fn(function () {
    return {
      incrementBatchViews: vi.fn(),
    };
  }),
}));

vi.mock('#utils/view-tracker.util.js', () => ({
  viewTracker: {
    drainPending: vi.fn(() => new Map()),
  },
}));

describe('server bootstrap (main)', () => {
  const createdTimers: ReturnType<typeof globalThis.setInterval>[] = [];
  let exitSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getSecretKey).mockReturnValue('jwt-secret');
    vi.mocked(getOnboardingSecret).mockReturnValue('onboarding-secret');
    vi.mocked(pool.query).mockResolvedValue({ rows: [] } as never);
    vi.mocked(ensureUploadDirs).mockResolvedValue(undefined);

    vi.spyOn(console, 'log').mockImplementation(() => {});
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    exitSpy = vi
      .spyOn(process, 'exit')
      .mockImplementation((() => undefined) as never);

    const originalSetInterval = globalThis.setInterval;
    vi.spyOn(globalThis, 'setInterval').mockImplementation(((
      ...args: Parameters<typeof setInterval>
    ) => {
      const timer = originalSetInterval(...args);
      createdTimers.push(timer);
      return timer;
    }) as typeof setInterval);
  });

  afterEach(() => {
    while (createdTimers.length > 0) {
      globalThis.clearInterval(createdTimers.pop());
    }
    vi.restoreAllMocks();
  });

  it('deve validar JWT_SECRET e ONBOARDING_SECRET antes do PostgreSQL e subir o servidor', async () => {
    await main();

    expect(getSecretKey).toHaveBeenCalledTimes(1);
    expect(getOnboardingSecret).toHaveBeenCalledTimes(1);
    expect(pool.query).toHaveBeenCalledWith('SELECT NOW()');
    expect(ensureUploadDirs).toHaveBeenCalledTimes(1);
    expect(app.listen).toHaveBeenCalledTimes(1);
    expect(exitSpy).not.toHaveBeenCalled();

    const secretOrder = vi.mocked(getSecretKey).mock.invocationCallOrder[0];
    const onboardingOrder =
      vi.mocked(getOnboardingSecret).mock.invocationCallOrder[0];
    const queryOrder = vi.mocked(pool.query).mock.invocationCallOrder[0];
    expect(secretOrder).toBeLessThan(queryOrder);
    expect(onboardingOrder).toBeLessThan(queryOrder);
  });

  it('deve logar "Erro ao inicializar a aplicação:" e chamar process.exit(1) quando JWT_SECRET falhar', async () => {
    const error = new Error('Variável de ambiente JWT_SECRET não configurada.');
    vi.mocked(getSecretKey).mockImplementation(() => {
      throw error;
    });

    await main();

    expect(pool.query).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledWith('Erro ao inicializar a aplicação:', error);
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('deve logar "Erro ao inicializar a aplicação:" e chamar process.exit(1) quando ONBOARDING_SECRET falhar', async () => {
    const error = new Error(
      'Variável de ambiente ONBOARDING_SECRET não configurada.'
    );
    vi.mocked(getOnboardingSecret).mockImplementation(() => {
      throw error;
    });

    await main();

    expect(pool.query).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledWith('Erro ao inicializar a aplicação:', error);
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('deve logar "Erro ao inicializar a aplicação:" e chamar process.exit(1) quando a conexão com PostgreSQL falhar', async () => {
    const error = new Error('DB connection failed');
    vi.mocked(pool.query).mockRejectedValue(error);

    await main();

    expect(app.listen).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledWith('Erro ao inicializar a aplicação:', error);
    expect(exitSpy).toHaveBeenCalledWith(1);
  });
});
