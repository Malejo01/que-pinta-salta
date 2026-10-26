/**
 * `packages/core/src/notificaciones/equipo.ts` (Ronda 70, tarea 70-b): el
 * "aviso del equipo". Puro: sin red, sin base, con un reloj que entra por
 * parámetro. Fixtures inventados y evidentes.
 *
 * Mismo criterio que `tests/core/notificaciones-tanda.test.ts`: las reglas se
 * prueban sobre la función real, no se reimplementan acá.
 */
import { describe, expect, it } from 'vitest'
import {
  DESTINO_CINES,
  LARGO_MAXIMO_CUERPO_EQUIPO,
  LARGO_MAXIMO_TITULO_EQUIPO,
  claveDedupeAvisoEquipo,
  datosPushAvisoEquipo,
  destinatariosAvisoEquipo,
  validarAvisoEquipo,
  yaHuboAvisoEquipoHoy,
  type UsuarioParaAvisoEquipo,
} from '@qps/core/notificaciones/equipo'
import { PREFERENCIAS_POR_DEFECTO, type PreferenciasNotificacion } from '@qps/core/notificaciones/preferencias'
import { urlEvento } from '@qps/core/metricas/links'

const EVENTO = '0b9d4f5a-6a2b-4c1e-8f3d-9a7b6c5d4e3f'

function aviso(extra: Record<string, unknown> = {}) {
  return { titulo: 'Novedad de prueba', cuerpo: 'Texto de prueba del equipo.', ...extra }
}

function erroresDe(entrada: unknown) {
  const r = validarAvisoEquipo(entrada)
  if (r.ok) throw new Error('se esperaba un rechazo')
  return r.errores
}

// ---------------------------------------------------------------------------
// validarAvisoEquipo
// ---------------------------------------------------------------------------
describe('validarAvisoEquipo: largos', () => {
  it('constantes: título 50 y cuerpo 120', () => {
    expect(LARGO_MAXIMO_TITULO_EQUIPO).toBe(50)
    expect(LARGO_MAXIMO_CUERPO_EQUIPO).toBe(120)
  })

  it('título de exactamente 50 y cuerpo de exactamente 120: válido', () => {
    const r = validarAvisoEquipo(aviso({ titulo: 'a'.repeat(50), cuerpo: 'b'.repeat(120) }))
    expect(r.ok).toBe(true)
  })

  it('título de 51: rechazado, con el campo titulo', () => {
    const e = erroresDe(aviso({ titulo: 'a'.repeat(51) }))
    expect(e.map((x) => x.campo)).toEqual(['titulo'])
  })

  it('cuerpo de 121: rechazado, con el campo cuerpo', () => {
    const e = erroresDe(aviso({ cuerpo: 'b'.repeat(121) }))
    expect(e.map((x) => x.campo)).toEqual(['cuerpo'])
  })

  it('el largo se cuenta DESPUÉS del trim: 50 letras con espacios alrededor es válido', () => {
    const r = validarAvisoEquipo(aviso({ titulo: `   ${'a'.repeat(50)}   `, cuerpo: `  ${'b'.repeat(120)}  ` }))
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.datos.titulo).toBe('a'.repeat(50))
      expect(r.datos.cuerpo).toBe('b'.repeat(120))
    }
  })

  it('devuelve el texto ya recortado', () => {
    const r = validarAvisoEquipo(aviso({ titulo: '  Hola  ', cuerpo: '  Chau  ' }))
    expect(r).toMatchObject({ ok: true, datos: { titulo: 'Hola', cuerpo: 'Chau' } })
  })

  it('devuelve TODOS los errores, no solo el primero', () => {
    const e = erroresDe({ titulo: '', cuerpo: '' })
    expect(e.map((x) => x.campo).sort()).toEqual(['cuerpo', 'titulo'])
  })
})

describe('validarAvisoEquipo: vacío y tipos', () => {
  it.each([
    ['vacío', ''],
    ['solo espacios', '    '],
    ['undefined', undefined],
    ['null', null],
    ['número', 42],
    ['array', ['hola']],
    ['objeto', { a: 1 }],
  ])('título %s: rechazado', (_nombre, valor) => {
    expect(validarAvisoEquipo(aviso({ titulo: valor })).ok).toBe(false)
  })

  it.each([
    ['vacío', ''],
    ['solo espacios', '  \t '],
    ['undefined', undefined],
    ['número', 7],
  ])('cuerpo %s: rechazado', (_nombre, valor) => {
    expect(validarAvisoEquipo(aviso({ cuerpo: valor })).ok).toBe(false)
  })

  it.each([[null], [undefined], ['texto'], [42], [[]]])('entrada %j que no es un objeto con campos: rechazada sin tirar', (entrada) => {
    expect(validarAvisoEquipo(entrada).ok).toBe(false)
  })
})

describe('validarAvisoEquipo: caracteres de control e invisibles', () => {
  const salto = String.fromCharCode(10)
  const retorno = String.fromCharCode(13)
  const tab = String.fromCharCode(9)
  const nulo = String.fromCharCode(0)
  const del = String.fromCharCode(0x7f)

  it.each([
    ['salto de línea', `Hola${salto}mundo`],
    ['retorno de carro', `Hola${retorno}mundo`],
    ['tabulación', `Hola${tab}mundo`],
    ['NUL', `Hola${nulo}mundo`],
    ['DEL', `Hola${del}mundo`],
  ])('título con %s: rechazado', (_n, titulo) => {
    expect(erroresDe(aviso({ titulo })).map((x) => x.campo)).toEqual(['titulo'])
  })

  it('cuerpo con salto de línea: rechazado', () => {
    expect(erroresDe(aviso({ cuerpo: `Línea 1${salto}Línea 2` })).map((x) => x.campo)).toEqual(['cuerpo'])
  })

  it('un salto de línea al borde se recorta con el trim y NO es error (solo cuenta el que queda adentro)', () => {
    expect(validarAvisoEquipo(aviso({ titulo: `${salto}Hola${salto}` })).ok).toBe(true)
  })

  // \p{Cf}: espacio de ancho cero, joiner, marca bidi, BOM.
  it.each([
    ['U+200B espacio de ancho cero', '​'],
    ['U+200D zero width joiner', '‍'],
    ['U+202E invierte el sentido', '‮'],
    ['U+2066 aislamiento bidi', '⁦'],
    ['U+FEFF BOM', '﻿'],
    ['U+00AD guion blando', '­'],
  ])('título con %s en el medio: rechazado', (_n, invisible) => {
    expect(erroresDe(aviso({ titulo: `Ho${invisible}la` })).map((x) => x.campo)).toEqual(['titulo'])
  })

  it('cuerpo con carácter invisible en el medio: rechazado', () => {
    expect(erroresDe(aviso({ cuerpo: `Ho​la` })).map((x) => x.campo)).toEqual(['cuerpo'])
  })

  it('un título que es SOLO invisibles: rechazado (no pasa como "no vacío")', () => {
    expect(validarAvisoEquipo(aviso({ titulo: '​​​' })).ok).toBe(false)
  })
})

describe('validarAvisoEquipo: nunca se parece a un aviso patrocinado', () => {
  it.each(['Patrocinado', 'PATROCINADO', 'patrocinado', 'patrocinádo', 'PATROCINÁDO', 'Patrocinado: 2x1', 'Patrocinado · algo'])(
    'título "%s": rechazado',
    (titulo) => {
      const e = erroresDe(aviso({ titulo }))
      expect(e.some((x) => x.campo === 'titulo')).toBe(true)
    },
  )

  it.each(['Patrocinado', 'PATROCINADO', 'patrocinádo por la casa'])('cuerpo "%s": rechazado', (cuerpo) => {
    const e = erroresDe(aviso({ cuerpo }))
    expect(e.some((x) => x.campo === 'cuerpo')).toBe(true)
  })

  it('con espacios delante ("  Patrocinado") también: el trim va antes del chequeo', () => {
    expect(validarAvisoEquipo(aviso({ titulo: '   Patrocinado hoy' })).ok).toBe(false)
  })

  it('la palabra en el medio NO es error ("El show patrocinado por la casa")', () => {
    expect(validarAvisoEquipo(aviso({ titulo: 'El show patrocinado por la casa' })).ok).toBe(true)
  })

  it('"Patrocinadores nuevos" también se rechaza (documenta el criterio actual: startsWith sobre el texto normalizado)', () => {
    expect(validarAvisoEquipo(aviso({ titulo: 'Patrocinadores nuevos' })).ok).toBe(false)
  })
})

describe('validarAvisoEquipo: destino', () => {
  it('sin destino: inicio', () => {
    expect(validarAvisoEquipo(aviso())).toMatchObject({ ok: true, datos: { destino: { tipo: 'inicio' } } })
  })

  it('destino null: inicio', () => {
    expect(validarAvisoEquipo(aviso({ destino: null }))).toMatchObject({ ok: true, datos: { destino: { tipo: 'inicio' } } })
  })

  it('destino inicio y cines', () => {
    expect(validarAvisoEquipo(aviso({ destino: { tipo: 'inicio' } }))).toMatchObject({ ok: true, datos: { destino: { tipo: 'inicio' } } })
    expect(validarAvisoEquipo(aviso({ destino: { tipo: 'cines' } }))).toMatchObject({ ok: true, datos: { destino: { tipo: 'cines' } } })
  })

  it('evento con uuid válido', () => {
    expect(validarAvisoEquipo(aviso({ destino: { tipo: 'evento', eventId: EVENTO } }))).toMatchObject({
      ok: true,
      datos: { destino: { tipo: 'evento', eventId: EVENTO } },
    })
  })

  it.each([
    ['sin eventId', undefined],
    ['no es uuid', 'no-es-un-uuid'],
    ['ruta con ..', '../../admin'],
    ['número', 123],
    ['vacío', ''],
  ])('evento con eventId %s: rechazado (campo eventId)', (_n, eventId) => {
    const e = erroresDe(aviso({ destino: { tipo: 'evento', eventId } }))
    expect(e.map((x) => x.campo)).toEqual(['eventId'])
  })

  it.each([['otro'], ['Cines'], ['CINES'], ['url'], [42], [undefined]])('tipo de destino %j desconocido: rechazado (campo destino)', (tipo) => {
    const e = erroresDe(aviso({ destino: { tipo } }))
    expect(e.map((x) => x.campo)).toEqual(['destino'])
  })

  it('un destino que es un string suelto: rechazado', () => {
    expect(validarAvisoEquipo(aviso({ destino: 'cines' })).ok).toBe(false)
  })

  it('no se cuelan campos de más: datos solo trae titulo, cuerpo y destino', () => {
    const r = validarAvisoEquipo(aviso({ destino: { tipo: 'cines', url: 'https://evil.example', tipoPush: 'patrocinado' }, categoryId: 'patrocinado', userId: 'x' }))
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(Object.keys(r.datos).sort()).toEqual(['cuerpo', 'destino', 'titulo'])
      expect(r.datos.destino).toEqual({ tipo: 'cines' })
    }
  })
})

// ---------------------------------------------------------------------------
// datosPushAvisoEquipo
// ---------------------------------------------------------------------------
describe('datosPushAvisoEquipo', () => {
  it('evento: { url } con el mismo link que arma la tanda (urlEvento con origen "app")', () => {
    const datos = datosPushAvisoEquipo({ tipo: 'evento', eventId: EVENTO })
    expect(datos).toEqual({ url: urlEvento(EVENTO, 'app') })
    expect(datos?.url).toMatch(new RegExp(`/evento/${EVENTO}`))
  })

  it('cines: { destino: "cines" } y el valor es la constante que lee la app', () => {
    expect(DESTINO_CINES).toBe('cines')
    expect(datosPushAvisoEquipo({ tipo: 'cines' })).toEqual({ destino: 'cines' })
  })

  it('inicio: undefined (sin data)', () => {
    expect(datosPushAvisoEquipo({ tipo: 'inicio' })).toBeUndefined()
  })

  it('evento con id que no es uuid (llegara por un bug): undefined, nunca { url: null }', () => {
    expect(datosPushAvisoEquipo({ tipo: 'evento', eventId: 'no-es-uuid' })).toBeUndefined()
  })

  it.each([
    [{ tipo: 'evento', eventId: EVENTO } as const],
    [{ tipo: 'cines' } as const],
    [{ tipo: 'inicio' } as const],
  ])('%j: nunca lleva "tipo" ni "categoryId" (no se confunde con un patrocinado)', (destino) => {
    const datos = datosPushAvisoEquipo(destino)
    expect(datos ?? {}).not.toHaveProperty('tipo')
    expect(datos ?? {}).not.toHaveProperty('categoryId')
  })
})

// ---------------------------------------------------------------------------
// claveDedupeAvisoEquipo / yaHuboAvisoEquipoHoy
// ---------------------------------------------------------------------------
const USER_A = 'aaaaaaaa-aaaa-4aaa-8aaa-000000000001'
const USER_B = 'aaaaaaaa-aaaa-4aaa-8aaa-000000000002'

// Salta es UTC-3 fijo. 2026-11-09 23:30 en Salta = 2026-11-10 02:30 UTC.
const LUNES_2330_SALTA = new Date('2026-11-10T02:30:00Z')
const LUNES_0800_SALTA = new Date('2026-11-09T11:00:00Z')
const MARTES_0010_SALTA = new Date('2026-11-10T03:10:00Z')

describe('claveDedupeAvisoEquipo', () => {
  it('lleva kind "anuncio", el usuario y el día de Salta', () => {
    expect(claveDedupeAvisoEquipo(USER_A, LUNES_0800_SALTA)).toBe(`anuncio:${USER_A}:2026-11-09`)
  })

  it('23:30 de Salta y 02:30 UTC del día siguiente son el mismo instante: el mismo día de Salta', () => {
    const a = claveDedupeAvisoEquipo(USER_A, new Date('2026-11-09T23:30:00-03:00'))
    const b = claveDedupeAvisoEquipo(USER_A, new Date('2026-11-10T02:30:00Z'))
    expect(a).toBe(b)
    expect(a.endsWith('2026-11-09')).toBe(true)
  })

  it('08:00 y 23:30 del mismo día de Salta: misma clave; 00:10 del día siguiente: otra', () => {
    expect(claveDedupeAvisoEquipo(USER_A, LUNES_0800_SALTA)).toBe(claveDedupeAvisoEquipo(USER_A, LUNES_2330_SALTA))
    expect(claveDedupeAvisoEquipo(USER_A, LUNES_2330_SALTA)).not.toBe(claveDedupeAvisoEquipo(USER_A, MARTES_0010_SALTA))
  })

  it('personas distintas: claves distintas (el unique de la tabla es global)', () => {
    expect(claveDedupeAvisoEquipo(USER_A, LUNES_0800_SALTA)).not.toBe(claveDedupeAvisoEquipo(USER_B, LUNES_0800_SALTA))
  })
})

describe('yaHuboAvisoEquipoHoy', () => {
  it('sin envíos: false', () => {
    expect(yaHuboAvisoEquipoHoy([], LUNES_0800_SALTA)).toBe(false)
  })

  it('un envío de hoy (día de Salta): true', () => {
    expect(yaHuboAvisoEquipoHoy([{ sent_at: '2026-11-09T12:00:00Z' }], LUNES_0800_SALTA)).toBe(true)
  })

  it('un envío de ayer: false', () => {
    expect(yaHuboAvisoEquipoHoy([{ sent_at: '2026-11-08T12:00:00Z' }], LUNES_0800_SALTA)).toBe(false)
  })

  it('un envío a las 02:30 UTC del día siguiente es de HOY en Salta (23:30): true', () => {
    expect(yaHuboAvisoEquipoHoy([{ sent_at: '2026-11-10T02:30:00Z' }], LUNES_0800_SALTA)).toBe(true)
  })

  it('un envío a las 03:10 UTC (00:10 del martes en Salta) no es de hoy lunes: false', () => {
    expect(yaHuboAvisoEquipoHoy([{ sent_at: '2026-11-10T03:10:00Z' }], LUNES_0800_SALTA)).toBe(false)
  })

  it('acepta Date además de string', () => {
    expect(yaHuboAvisoEquipoHoy([{ sent_at: new Date('2026-11-09T12:00:00Z') }], LUNES_0800_SALTA)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// destinatariosAvisoEquipo
// ---------------------------------------------------------------------------
// 12:00 de Salta: fuera del silencio por defecto (23:00 a 09:00).
const AHORA = new Date('2026-11-09T15:00:00Z')
const AHORA_EN_SILENCIO = LUNES_2330_SALTA // 23:30 de Salta

const prefs = (extra: Partial<PreferenciasNotificacion> = {}): PreferenciasNotificacion => ({
  ...PREFERENCIAS_POR_DEFECTO,
  announcements: true,
  quiet_start: '23:00',
  quiet_end: '09:00',
  daily_cap: 4,
  ...extra,
})

const usuario = (n: number, extra: Partial<UsuarioParaAvisoEquipo> = {}): UsuarioParaAvisoEquipo => ({
  userId: `bbbbbbbb-bbbb-4bbb-8bbb-${String(n).padStart(12, '0')}`,
  preferencias: prefs(),
  tokens: [`ExponentPushToken[token-de-prueba-${n}]`],
  enviosRegistrados: [],
  ...extra,
})

describe('destinatariosAvisoEquipo', () => {
  it('quien tiene announcements prendido y un token entra, con la clave de hoy', () => {
    const u = usuario(1)
    const { mensajes, resumen } = destinatariosAvisoEquipo([u], AHORA)
    expect(mensajes).toEqual([{ userId: u.userId, to: u.tokens[0], dedupeKey: claveDedupeAvisoEquipo(u.userId, AHORA) }])
    expect(resumen).toEqual({ personas: 1, telefonos: 1, excluidos: { sinPermiso: 0, silencio: 0, tope: 0, yaRecibio: 0 } })
  })

  it('SIN fila de preferencias (null): no entra, cuenta como sinPermiso (el default es false)', () => {
    const { mensajes, resumen } = destinatariosAvisoEquipo([usuario(1, { preferencias: null })], AHORA)
    expect(mensajes).toHaveLength(0)
    expect(resumen.excluidos.sinPermiso).toBe(1)
    expect(resumen.personas).toBe(0)
  })

  it('announcements: false (opt-out): no entra, cuenta como sinPermiso', () => {
    const { mensajes, resumen } = destinatariosAvisoEquipo([usuario(1, { preferencias: prefs({ announcements: false }) })], AHORA)
    expect(mensajes).toHaveLength(0)
    expect(resumen.excluidos.sinPermiso).toBe(1)
  })

  it('announcements con un valor que no es el booleano true (string, 1, undefined): no entra', () => {
    for (const valor of ['true', 1, undefined, null]) {
      const p = { ...prefs(), announcements: valor } as unknown as PreferenciasNotificacion
      const { mensajes } = destinatariosAvisoEquipo([usuario(1, { preferencias: p })], AHORA)
      expect(mensajes).toHaveLength(0)
    }
  })

  it('sponsored o favorite_reminders prendidos NO alcanzan: el interruptor es announcements', () => {
    const p = prefs({ announcements: false, sponsored: true, favorite_reminders: true, follow_news: true })
    expect(destinatariosAvisoEquipo([usuario(1, { preferencias: p })], AHORA).mensajes).toHaveLength(0)
  })

  it('en horario de silencio: no entra, cuenta como silencio', () => {
    const { mensajes, resumen } = destinatariosAvisoEquipo([usuario(1)], AHORA_EN_SILENCIO)
    expect(mensajes).toHaveLength(0)
    expect(resumen.excluidos.silencio).toBe(1)
  })

  it('el silencio se evalúa con las preferencias de cada persona (a las 12:00 queda afuera quien silencia de 11 a 13; entra quien silencia de 13 a 15)', () => {
    const enSusHoras = usuario(1, { preferencias: prefs({ quiet_start: '11:00', quiet_end: '13:00' }) })
    const fuera = usuario(2, { preferencias: prefs({ quiet_start: '13:00', quiet_end: '15:00' }) })
    const { resumen } = destinatariosAvisoEquipo([enSusHoras, fuera], AHORA)
    expect(resumen.excluidos.silencio).toBe(1)
    expect(resumen.personas).toBe(1)
  })

  it('acepta quiet_start en formato HH:MM:SS como lo devuelve la base', () => {
    const u = usuario(1, { preferencias: prefs({ quiet_start: '11:00:00', quiet_end: '13:00:00' }) })
    expect(destinatariosAvisoEquipo([u], AHORA).resumen.excluidos.silencio).toBe(1)
  })

  it('daily_cap: con el tope lleno hoy no entra (tope); con un lugar libre, entra', () => {
    const hoy = [{ dedupe_key: 'favorito:x:1', sent_at: '2026-11-09T13:00:00Z' }, { dedupe_key: 'favorito:x:2', sent_at: '2026-11-09T14:00:00Z' }]
    const lleno = usuario(1, { preferencias: prefs({ daily_cap: 2 }), enviosRegistrados: hoy })
    const conLugar = usuario(2, { preferencias: prefs({ daily_cap: 3 }), enviosRegistrados: hoy })
    const { resumen, mensajes } = destinatariosAvisoEquipo([lleno, conLugar], AHORA)
    expect(resumen.excluidos.tope).toBe(1)
    expect(mensajes.map((m) => m.userId)).toEqual([conLugar.userId])
  })

  it('daily_cap: los envíos de AYER no cuentan', () => {
    const ayer = [{ dedupe_key: 'favorito:x:1', sent_at: '2026-11-08T14:00:00Z' }]
    const u = usuario(1, { preferencias: prefs({ daily_cap: 1 }), enviosRegistrados: ayer })
    expect(destinatariosAvisoEquipo([u], AHORA).mensajes).toHaveLength(1)
  })

  it('daily_cap 0: nadie recibe (tope)', () => {
    const u = usuario(1, { preferencias: prefs({ daily_cap: 0 }) })
    const { mensajes, resumen } = destinatariosAvisoEquipo([u], AHORA)
    expect(mensajes).toHaveLength(0)
    expect(resumen.excluidos.tope).toBe(1)
  })

  it('ya tiene la clave de hoy: no entra, cuenta como yaRecibio (y no como tope)', () => {
    const u = usuario(1)
    const conClave = { ...u, enviosRegistrados: [{ dedupe_key: claveDedupeAvisoEquipo(u.userId, AHORA), sent_at: '2026-11-09T14:00:00Z' }] }
    const { mensajes, resumen } = destinatariosAvisoEquipo([conClave], AHORA)
    expect(mensajes).toHaveLength(0)
    expect(resumen.excluidos).toEqual({ sinPermiso: 0, silencio: 0, tope: 0, yaRecibio: 1 })
  })

  it('la clave de AYER no lo excluye: mañana vuelve a ser candidato', () => {
    const u = usuario(1)
    const ayer = new Date('2026-11-08T15:00:00Z')
    const conClaveDeAyer = { ...u, enviosRegistrados: [{ dedupe_key: claveDedupeAvisoEquipo(u.userId, ayer), sent_at: ayer.toISOString() }] }
    expect(destinatariosAvisoEquipo([conClaveDeAyer], AHORA).mensajes).toHaveLength(1)
  })

  it('la clave de OTRA persona en sus envíos no lo excluye', () => {
    const u = usuario(1)
    const ajena = { dedupe_key: claveDedupeAvisoEquipo(usuario(9).userId, AHORA), sent_at: AHORA.toISOString() }
    expect(destinatariosAvisoEquipo([{ ...u, enviosRegistrados: [ajena] }], AHORA).mensajes).toHaveLength(1)
  })

  it('sin tokens: no entra y NO se cuenta en ningún excluido (ni siquiera sinPermiso)', () => {
    const { mensajes, resumen } = destinatariosAvisoEquipo(
      [usuario(1, { tokens: [] }), usuario(2, { tokens: [], preferencias: null })],
      AHORA,
    )
    expect(mensajes).toHaveLength(0)
    expect(resumen).toEqual({ personas: 0, telefonos: 0, excluidos: { sinPermiso: 0, silencio: 0, tope: 0, yaRecibio: 0 } })
  })

  it('varios tokens por persona: un mensaje por token, mismo dedupeKey, una sola persona', () => {
    const u = usuario(1, { tokens: ['ExponentPushToken[uno-de-prueba]', 'ExponentPushToken[dos-de-prueba]', 'ExponentPushToken[tres-de-prueba]'] })
    const { mensajes, resumen } = destinatariosAvisoEquipo([u], AHORA)
    expect(mensajes.map((m) => m.to)).toEqual(u.tokens)
    expect(new Set(mensajes.map((m) => m.dedupeKey)).size).toBe(1)
    expect(resumen.personas).toBe(1)
    expect(resumen.telefonos).toBe(3)
  })

  it('los conteos suman: personas + excluidos = personas con tokens; telefonos = mensajes', () => {
    const u1 = usuario(1, { tokens: ['ExponentPushToken[a-de-prueba]', 'ExponentPushToken[b-de-prueba]'] })
    const u2 = usuario(2)
    const sinPermiso = usuario(3, { preferencias: prefs({ announcements: false }) })
    const sinFila = usuario(4, { preferencias: null })
    const conTope = usuario(5, {
      preferencias: prefs({ daily_cap: 1 }),
      enviosRegistrados: [{ dedupe_key: 'favorito:x:1', sent_at: '2026-11-09T13:00:00Z' }],
    })
    const yaRecibio = usuario(6)
    yaRecibio.enviosRegistrados = [{ dedupe_key: claveDedupeAvisoEquipo(yaRecibio.userId, AHORA), sent_at: '2026-11-09T13:00:00Z' }]
    const sinToken = usuario(7, { tokens: [] })
    const enSilencio = usuario(8, { preferencias: prefs({ quiet_start: '11:00', quiet_end: '13:00' }) })

    const todos = [u1, u2, sinPermiso, sinFila, conTope, yaRecibio, sinToken, enSilencio]
    const { mensajes, resumen } = destinatariosAvisoEquipo(todos, AHORA)

    expect(resumen.personas).toBe(2)
    expect(resumen.telefonos).toBe(3)
    expect(mensajes).toHaveLength(resumen.telefonos)
    expect(resumen.excluidos).toEqual({ sinPermiso: 2, silencio: 1, tope: 1, yaRecibio: 1 })
    const conTokens = todos.filter((u) => u.tokens.length > 0).length
    const excluidos = Object.values(resumen.excluidos).reduce((a, b) => a + b, 0)
    expect(resumen.personas + excluidos).toBe(conTokens)
  })

  it('el resumen no lleva ids ni tokens: solo números', () => {
    const { resumen } = destinatariosAvisoEquipo([usuario(1), usuario(2, { preferencias: null })], AHORA)
    const json = JSON.stringify(resumen)
    expect(json).not.toMatch(/ExponentPushToken/)
    expect(json).not.toMatch(/bbbbbbbb/)
    expect(Object.values(resumen).every((v) => typeof v === 'number' || typeof v === 'object')).toBe(true)
  })

  it('lista vacía: todo en cero', () => {
    expect(destinatariosAvisoEquipo([], AHORA)).toEqual({
      mensajes: [],
      resumen: { personas: 0, telefonos: 0, excluidos: { sinPermiso: 0, silencio: 0, tope: 0, yaRecibio: 0 } },
    })
  })
})
