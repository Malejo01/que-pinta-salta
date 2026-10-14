import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

// Solo lógica pura (apps/mobile/lib y la config), sin React Native: los tests
// de pantalla necesitarían un runner de RN, que no está en la lista aprobada.
export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
  resolve: {
    alias: [
      {
        find: /^@qps\/core\/(.*)$/,
        replacement: fileURLToPath(new URL('../../packages/core/src/', import.meta.url)) + '$1',
      },
      { find: /^@\/(.*)$/, replacement: fileURLToPath(new URL('./', import.meta.url)) + '$1' },
    ],
  },
})
