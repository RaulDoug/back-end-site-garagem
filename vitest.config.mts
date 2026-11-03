import dotenv from 'dotenv';
import { defineConfig } from 'vitest/config';

// Variáveis padrões
dotenv.config({ path: '.env'});

// Sobrescrita de variáveis de ambiente para testes
dotenv.config({ path: '.env.test', override: true });

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.{test,spec}.ts']
  }
});