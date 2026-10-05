import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

// Zona horaria fija: los tests no pueden depender de la máquina donde corren.
process.env.TZ = 'UTC'

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
})
