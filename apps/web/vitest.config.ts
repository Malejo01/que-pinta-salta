import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

// Zona horaria fija: los tests no pueden depender de la máquina donde corren.
process.env.TZ = 'UTC'

export default defineConfig({
  resolve: {
    // Los paquetes del monorepo se resuelven a su fuente, igual que en
    // tsconfig.json (paths): cada worktree prueba su propio packages/.
    alias: [
      {
        find: /^@qps\/core\/(.*)$/,
        replacement: fileURLToPath(new URL('../../packages/core/src/', import.meta.url)) + '$1',
      },
      { find: /^@qps\/db$/, replacement: fileURLToPath(new URL('../../packages/db/src/index.ts', import.meta.url)) },
      { find: '@', replacement: fileURLToPath(new URL('./', import.meta.url)) },
    ],
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
})
