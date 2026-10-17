/**
 * Puerta de entrada de `@qps/core/asistencia` (R38, 38-b, vuelta 2).
 *
 * El código vive en `./asistencia/index.ts`; este archivo existe por cómo
 * resuelve el especificador cada herramienta. `packages/core/package.json`
 * declara `"exports": { "./*": "./src/*.ts" }`, así que `@qps/core/asistencia`
 * apunta a `src/asistencia.ts` — y `apps/web/next.config.mjs` tiene
 * `transpilePackages: ['@qps/core']`, o sea que el build de Next sí pasa por
 * ese mapa (no solo por los `paths` del tsconfig, que resuelven el
 * directorio con su `index.ts`). Sin este archivo, el build de la web no
 * encuentra el módulo, aunque el typecheck y los tests pasen: fue lo que
 * mostró la preview del PR #62.
 *
 * `asistencia` es el primer módulo de core con forma carpeta + `index.ts`;
 * el resto son archivos planos, que el comodín cubre solo. Lo prolijo es
 * aplanarlo (un único `src/asistencia.ts` con el código) o agregarle una
 * entrada explícita al `exports`: las dos cosas las denegó el perfil
 * nocturno (escribir en `packages/core/package.json` y `git mv`), así que
 * quedan para el día — QPS-200.
 */
export * from './asistencia/index'
