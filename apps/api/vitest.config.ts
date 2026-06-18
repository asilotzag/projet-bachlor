import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    testTimeout: 15000,
    hookTimeout: 15000,
    reporters: ['verbose'],
    // Exécution séquentielle pour éviter les conflits sur la BDD
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
  },
});
