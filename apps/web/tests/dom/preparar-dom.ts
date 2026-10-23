// Mocks y helpers comunes para los tests con DOM real de
// `FilaAccionesEvento` (R61, tarea 56-c, QPS-199).
//
// Por qué los `vi.mock` de `@/lib/asistencia`, `@/lib/actions/favorites`,
// `@/components/auth-modal` y `@/hooks/use-toast` NO viven acá, sino en
// `fila-acciones-evento.dom.test.ts`: `vi.mock` se iza (hoist) solo al
// principio del ARCHIVO que lo escribe, no al principio de todo el grafo de
// imports. Un módulo de ES avanza sus `import` en el orden en que están
// escritos; si este archivo (`preparar-dom.ts`) tuviera los `vi.mock` y el
// test importara primero `@/components/fila-acciones-evento` (que importa,
// a su vez, `@/lib/asistencia` y `@/lib/actions/favorites`), esos módulos
// reales ya quedarían resueltos ANTES de que el `import` de
// `preparar-dom.ts` llegara a registrar los mocks — no hay garantía de que
// el mock llegue a tiempo. Puesto en el archivo de test, el transform de
// Vitest adelanta el `vi.mock` al principio de ESE archivo, antes de
// resolver cualquier otro import (incluida la cadena que arrastra al
// componente real), así que no queda ninguna ventana donde se cargue la
// versión real sin mockear. El próximo test con DOM puede copiar esta forma
// sin volver a averiguarlo.
//
// Lo que sí vive acá, porque no depende del orden de módulos: las fábricas
// de props, el `deferred()` para mirar el estado mientras una server action
// todavía no contestó, los helpers de consulta de los botones y el
// `afterEach` con `cleanup()` (Testing Library no registra su auto-cleanup
// porque `globals` no está activado en `vitest.config.ts`).
import * as React from 'react'
import { afterEach } from 'vitest'
import { cleanup, screen } from '@testing-library/react'
import type { FilaAccionesEventoProps } from '@/components/fila-acciones-evento'

afterEach(() => {
  cleanup()
})

/** Para mirar el estado MIENTRAS una promesa (una server action) todavía no resolvió. */
export interface Deferred<T> {
  promesa: Promise<T>
  resolver: (valor: T) => void
  rechazar: (error: unknown) => void
}

export function deferred<T>(): Deferred<T> {
  let resolver!: (valor: T) => void
  let rechazar!: (error: unknown) => void
  const promesa = new Promise<T>((resolve, reject) => {
    resolver = resolve
    rechazar = reject
  })
  return { promesa, resolver, rechazar }
}

/** Un stub de "compartir" que no depende de nada del navegador: solo texto, con un data-testid para ubicarlo en el DOM. */
export function stubCompartir(): React.ReactElement {
  return React.createElement('span', { 'data-testid': 'compartir-stub' }, 'Compartir')
}

/** Props inventadas de `FilaAccionesEvento`, con un evento y un título de prueba evidentes. */
export function propsBase(overrides: Partial<FilaAccionesEventoProps> = {}): FilaAccionesEventoProps {
  return {
    eventId: 'evento-de-prueba-1',
    titulo: 'Show de Prueba en el Club de Prueba',
    guardadoInicial: false,
    voyInicial: false,
    cantidadesIniciales: { voy: 0 },
    haySesion: true,
    mostrarVoy: true,
    compartir: stubCompartir(),
    ...overrides,
  }
}

/**
 * El botón de Guardar (♥): se lo busca por su `aria-label`, que siempre
 * empieza con "Guardar" o "Quitar" (nunca por el texto visible "Guardar" /
 * "Guardado", que cambia con el estado).
 */
export function botonGuardar(): HTMLElement {
  return screen.getByRole('button', { name: /guardar|guardados/i })
}

/**
 * El botón de Voy (✓): se lo busca por su `aria-label`, que siempre dice
 * "Marcar que vas a…" o "Marcar que no vas a…" (nunca por el texto visible,
 * que sale de `textoBotonVoy` y cambia con el contador).
 */
export function botonVoy(): HTMLElement {
  return screen.getByRole('button', { name: /marcar que (no )?vas a/i })
}
