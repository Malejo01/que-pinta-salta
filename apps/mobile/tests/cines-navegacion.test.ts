// 28-q, punto 12 (F3, 28-g): lectura estática de que cada película de
// `app/cines.tsx` es un `Pressable` que navega a `/pelicula/` (el
// diagnóstico del lead decía: "la película es un <View> sin onPress, y no
// hay ruta de detalle"). Mismo estilo de detector con fixtures en memoria
// que el resto de `tests/*.test.ts`.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * `true` si `content` tiene un `<Pressable` cuyo `onPress` navega a una
 * ruta `/pelicula/...` (vía `router.push`), dentro de un `renderItem` de
 * `FlatList` (heurística: basta con que ambos patrones aparezcan en el
 * archivo, ya que es la única lista de películas de la pantalla).
 */
export function tienePressableHaciaPelicula(content: string): boolean {
  const tienePressable = /<Pressable\b/.test(content)
  const navegaAPelicula = /router\.push\(\s*[`'"][^`'"]*\/pelicula\//.test(content)
  return tienePressable && navegaAPelicula
}

describe('tienePressableHaciaPelicula (fixtures)', () => {
  it('detecta el patrón real: <Pressable onPress={() => router.push(`/pelicula/${id}`)}>', () => {
    const content = '<Pressable onPress={() => router.push(`/pelicula/${item.id}`)}><Text>X</Text></Pressable>'
    expect(tienePressableHaciaPelicula(content)).toBe(true)
  })

  it('un <View> sin onPress (el bug original): false', () => {
    const content = '<View><Text>X</Text></View>'
    expect(tienePressableHaciaPelicula(content)).toBe(false)
  })

  it('un Pressable que navega a otra ruta (no /pelicula/): false', () => {
    const content = '<Pressable onPress={() => router.push(`/evento/${item.id}`)}><Text>X</Text></Pressable>'
    expect(tienePressableHaciaPelicula(content)).toBe(false)
  })

  it('router.push a /pelicula/ pero sin ningún Pressable: false', () => {
    const content = 'function ir() { router.push(`/pelicula/${id}`) }'
    expect(tienePressableHaciaPelicula(content)).toBe(false)
  })
})

describe('app/cines.tsx: cada película es un Pressable que navega a /pelicula/', () => {
  const RUTA = fileURLToPath(new URL('../app/cines.tsx', import.meta.url))
  const src = readFileSync(RUTA, 'utf8')

  it('tiene el Pressable con la navegación esperada', () => {
    expect(tienePressableHaciaPelicula(src)).toBe(true)
  })

  it('el renderItem de la FlatList de películas usa Pressable (no View)', () => {
    const renderItemMatch = src.match(/renderItem=\{\(\{ item \}\) => \{[\s\S]*?\n\s*\}\}/)
    expect(renderItemMatch).not.toBeNull()
    expect(renderItemMatch![0]).toMatch(/<Pressable\b/)
  })
})
