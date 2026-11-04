/**
 * Q6-4 · Detector de datos personales para los fixtures del banco de
 * evaluación. Busca emails, teléfonos y @menciones que no estén en la lista
 * de cuentas públicas del archivo (lugares, productoras, artistas con cuenta
 * oficial). Los reemplazos ya hechos (`[email]`, `[telefono]`, `@[cuenta]`)
 * no cuentan.
 *
 * Teléfonos: secuencias de dígitos con separadores (espacio, guion, punto,
 * paréntesis) que suman 10 a 13 dígitos (celular o fijo argentino con
 * característica, con o sin 0, 15 o +54 9), o un número local de 7 dígitos
 * escrito como 3-4 (`421-5678`). No marca precios (`$18.000`), fechas ISO
 * (`2026-10-31`), fechas con barra (`17/10/26`) ni horas (`02:00`).
 */

export type TipoDatoPersonal = 'email' | 'telefono' | 'mencion'

export interface HallazgoDatoPersonal {
  tipo: TipoDatoPersonal
  /** El valor encontrado, para que quien corre el test lo pueda ubicar y sacar. */
  valor: string
}

const RE_EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g
const RE_CANDIDATO_TELEFONO = /(?<![\w.,/:$])\+?\(?\d[\d\s().-]{5,}\d(?![\w/:])/g
const RE_MENCION = /(?<![\w.@[])@([A-Za-z0-9._]{2,30})/g

export function buscarEmails(texto: string): string[] {
  return texto.match(RE_EMAIL) ?? []
}

function pareceTelefono(candidato: string): boolean {
  const limpio = candidato.trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(limpio)) return false // fecha ISO
  if (/^\d{1,3}(\.\d{3})+$/.test(limpio)) return false // precio con puntos de miles
  const digitos = limpio.replace(/\D/g, '')
  if (digitos.length >= 10 && digitos.length <= 13) return true
  return /^\d{3}[\s-]\d{4}$/.test(limpio)
}

export function buscarTelefonos(texto: string): string[] {
  const encontrados: string[] = []
  for (const m of texto.matchAll(RE_CANDIDATO_TELEFONO)) {
    // Un salto de línea corta el número: se mira cada renglón por separado.
    for (const parte of m[0].split(/[\r\n]+/)) {
      const p = parte.trim()
      if (p && pareceTelefono(p)) encontrados.push(p)
    }
  }
  return encontrados
}

export function buscarMenciones(texto: string): string[] {
  const sinEmails = texto.replace(RE_EMAIL, ' ')
  return [...sinEmails.matchAll(RE_MENCION)].map((m) => m[1].replace(/\.+$/, ''))
}

/** Todos los datos personales de un texto (vacío si está limpio). */
export function detectarDatosPersonales(texto: string, cuentasPublicas: readonly string[] = []): HallazgoDatoPersonal[] {
  const publicas = new Set(cuentasPublicas.map((c) => c.toLowerCase()))
  return [
    ...buscarEmails(texto).map((valor) => ({ tipo: 'email' as const, valor })),
    ...buscarTelefonos(texto).map((valor) => ({ tipo: 'telefono' as const, valor })),
    ...buscarMenciones(texto)
      .filter((m) => !publicas.has(m.toLowerCase()))
      .map((m) => ({ tipo: 'mencion' as const, valor: `@${m}` })),
  ]
}

/**
 * Recorre un valor JSON y devuelve los textos con su ruta, salvo los campos
 * que son identificadores o URLs de storage (`id`, `imagen_url`, `origen`),
 * que traen números largos que no son teléfonos.
 */
export function textosDe(valor: unknown, ruta = '$'): Array<{ ruta: string; texto: string }> {
  if (typeof valor === 'string') return [{ ruta, texto: valor }]
  if (Array.isArray(valor)) return valor.flatMap((v, i) => textosDe(v, `${ruta}[${i}]`))
  if (valor && typeof valor === 'object') {
    return Object.entries(valor).flatMap(([k, v]) =>
      k === 'id' || k === 'imagen_url' || k === 'origen' || k === 'consulta' ? [] : textosDe(v, `${ruta}.${k}`),
    )
  }
  return []
}

/** Los datos personales de un archivo de fixtures entero, con la ruta de cada uno. */
export function datosPersonalesEnFixture(
  archivo: unknown,
  cuentasPublicas: readonly string[] = [],
): Array<HallazgoDatoPersonal & { ruta: string }> {
  return textosDe(archivo).flatMap(({ ruta, texto }) =>
    detectarDatosPersonales(texto, cuentasPublicas).map((h) => ({ ...h, ruta })),
  )
}
