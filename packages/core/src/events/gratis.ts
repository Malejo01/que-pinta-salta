// "Gratis" de verdad: `is_free` solo con evidencia en el texto ("el modelo extrae, el código decide").
// Funciones puras, sin red ni base. Nunca se infiere gratis de que falte el precio ni de `price_min = 0`.
//
// Regla: gratis = alguna frase positiva y NINGUNA condición negativa, sobre el texto normalizado
// completo (minúsculas, sin tildes, textos unidos con "\n"). Ante la duda, no gratis.
// Ninguna regex lleva el flag `g` (tendría estado `lastIndex` y las listas son compartidas).

export type DeteccionGratis =
  | { gratis: true; frase: string }
  | { gratis: false; motivo: 'sin-evidencia' }
  | { gratis: false; motivo: 'condicion'; condicion: string; frase: string | null }

const MAX_TEXTO = 20000

function normalizar(textos: Array<string | null | undefined>): string {
  // Se recorta el texto unido: un caption gigante no puede colgar las regex.
  return textos
    .filter((t): t is string => typeof t === 'string' && t.length > 0)
    .join('\n')
    .slice(0, MAX_TEXTO)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
}

// Quién/qué queda fuera de la gratuidad total: un grupo, o un extra suelto.
const GRUPO = String.raw`(?:menores|ninos?|ninas?|chicos?|chicas?|jubilados?|estudiantes?|socios?|cumpleaneros?|acompanantes?|mujeres|ellas|ladies|senoritas|varones|hombres|caballeros)`
const GRATUIDAD = String.raw`(?:gratis|gratuit[oa]s?|free|entrada\s+libre|sin\s+costo)`
const EXTRA = String.raw`(?:consumicion(?:es)?|tragos?|bebidas?|copas?|shots?|regalos?|estacionamiento|envio|wifi|degustacion(?:es)?|cancelacion|devolucion|reembolso|retiro|reprogramacion|cambios?)`
const GRATIS_SUELTO = String.raw`(?:gratis|gratuit[oa]s?|free)`
// Un número con algún dígito distinto de cero: "$0" no cuenta como monto; "21:00" ni empieza con $.
const MONTO = String.raw`(?=[\d.,]*[1-9])\d[\d.,]*`

/** Frases que indican entrada gratuita (se aplican sobre texto normalizado). */
export const FRASES_GRATIS: ReadonlyArray<{ id: string; re: RegExp }> = [
  { id: 'entrada-libre', re: /\bentrada\s+libre\b/ },
  { id: 'entrada-gratuita', re: /\bentrada\s+(?:gratuita|gratis)\b/ },
  { id: 'libre-y-gratuito', re: /\blibre\s+y\s+gratuit[oa]s?\b/ },
  { id: 'gratis', re: /\bgratis\b/ },
  { id: 'gratuito', re: /\bgratuit[oa]s?\b/ },
  { id: 'sin-costo', re: /\bsin\s+costo(?!\s+(?:de|adicional|extra))/ },
  { id: 'acceso-libre', re: /\bacceso\s+libre\b/ },
  { id: 'entrada-free', re: /\bentrada\s+free\b/ },
  { id: 'free-access', re: /\bfree\s+access\b/ },
]

/** Condiciones que descartan "gratis" estén donde estén en el texto (texto normalizado). */
export const CONDICIONES_NO_GRATIS: ReadonlyArray<{ id: string; re: RegExp }> = [
  // Gratuidad parcial (las de hasta ahora de validate-extraction).
  // "Hasta" solo cuando es un horario ("hasta las 2", "hasta 23hs", "hasta medianoche"), no una fecha.
  {
    id: 'hasta',
    re: /\bhasta\s+las\b|\bhasta\s+la\s+(?:\d|una\b|medianoche|madrugada)|\bhasta\s+\d{1,2}[:.]\d{2}\b|\bhasta\s+(?:las?\s+)?\d{1,2}(?:[:.]\d{2})?\s*(?:hs?|horas|am|pm)\b|\bhasta\s+(?:la\s+)?(?:medianoche|madrugada)\b/,
  },
  { id: 'free-hasta', re: /\bfree\s+hasta\b/ },
  { id: 'gratis-hasta', re: /\bgratis\s+hasta\b/ },
  { id: 'damas', re: /\bdamas\b/ },
  { id: 'con-lista', re: /\bcon\s+lista\b/ },
  { id: 'antes-de', re: /\bantes\s+de\s+las\b|\bantes\s+de\s+la\s+(?:\d|una\b|medianoche)/ },
  { id: 'free-antes', re: /\bfree\s+antes\b/ },
  // Promociones que no son entrada gratis.
  { id: '2x1', re: /\b2\s*x\s*1\b|\bdos\s+por\s+uno\b/ },
  // Gratis para un grupo, por adyacencia gramatical ("gratis menores", "menores de 5 años gratis",
  // "jubilados entrada libre"); "gratuita. Chicos y grandes" o "apto para niños" no cuentan.
  // A propósito (conservador), "Entrada libre y gratuita para niños y adultos" queda bloqueado.
  {
    id: 'grupo',
    re: new RegExp(
      String.raw`\b${GRATUIDAD}\s+(?:para\s+)?(?:(?:los|las)\s+)?${GRUPO}\b|\b${GRUPO}(?:\s+\w+){0,4}\s+(?:gratis|gratuit\w*|free|libre|sin\s+costo|sin\s+cargo|no\s+pagan|no\s+abonan|exentos)\b`
    ),
  },
  // Cupos y accesos con requisito: los primeros N, con el flyer, por invitación.
  { id: 'primeros-n', re: /\bprimer[oa]s\s+\d+\b/ },
  { id: 'flyer', re: /\bcon\s+(?:este\s+)?flyer\b/ },
  { id: 'invitacion', re: /\b(?:por|con)\s+invitacion\b/ },
  // Gratis atado a otra cosa (consumición, estacionamiento, etc.), en cualquier orden y en la misma oración.
  {
    id: 'extra',
    re: new RegExp(
      String.raw`\b${GRATIS_SUELTO}\b[^\n.]{0,25}\b${EXTRA}\b|\b${EXTRA}\b[^\n.]{0,25}\b${GRATIS_SUELTO}\b`
    ),
  },
  // Sorteo de entradas: la entrada se gana, no es libre ("sorteo de una guitarra" no cuenta).
  {
    id: 'sorteo',
    re: /\bsorte\w*[^\n.]{0,30}\b(?:entradas?|pases?|invitaciones?)\b|\bganate\b|\bgana\s+(?:\w+\s+){0,3}(?:entradas?|pases?|invitaciones?)\b|\bconcurso\s+para\s+ganar\b/,
  },
  // Negación expresa: "no es gratis", "no es libre".
  { id: 'negacion', re: /\bno\s+(?:es\s+|son\s+)?(?:gratis|gratuit\w*|libre)\b/ },
  // Un monto mayor a cero: "$ 1500", "1500 pesos", "ARS 1500".
  {
    id: 'monto',
    re: new RegExp(
      String.raw`\$\s*${MONTO}|\bars(?:\s*\$)?\s*${MONTO}|(?<![\d.,])${MONTO}\s*pesos\b|\bmil\s+pesos\b`
    ),
  },
  // Aporte voluntario: `is_free` es booleano y no hay cómo mostrarlo, entonces no es gratis.
  { id: 'a-la-gorra', re: /\ba\s+la\s+gorra\b/ },
  {
    id: 'aporte-voluntario',
    re: /\b(?:colaboracion|contribucion|aporte)\s+(?:voluntari[ao]|sugerid[ao]|solidari[ao]|minim[ao])\b/,
  },
  { id: 'a-voluntad', re: /\ba\s+voluntad\b/ },
  { id: 'bono-contribucion', re: /\bbono\s+(?:contribucion|colaboracion)\b/ },
  // "Colaboración: $500" sí; "en colaboración con la UNSa" (un organizador) no.
  { id: 'colaboracion', re: /\bcolaboracion\s*:?\s*\$/ },
]

function primeraFrase(texto: string): string | null {
  for (const { re } of FRASES_GRATIS) {
    const m = re.exec(texto)
    if (m) return m[0]
  }
  return null
}

function primeraCondicion(texto: string): string | null {
  for (const { id, re } of CONDICIONES_NO_GRATIS) {
    if (re.test(texto)) return id
  }
  return null
}

/**
 * Detecta si el texto (título, descripción, caption, texto del flyer…) indica entrada gratuita.
 * Si hay una condición negativa devuelve `condicion` (con la frase encontrada, si la había);
 * sin condición y sin frase, `sin-evidencia`.
 */
export function detectarGratis(...textos: Array<string | null | undefined>): DeteccionGratis {
  const texto = normalizar(textos)
  const frase = primeraFrase(texto)
  const condicion = primeraCondicion(texto)
  if (condicion) return { gratis: false, motivo: 'condicion', condicion, frase }
  if (frase) return { gratis: true, frase }
  return { gratis: false, motivo: 'sin-evidencia' }
}

/** True solo si hay una frase de gratuidad y ninguna condición que la desmienta. */
export function textoIndicaGratis(...textos: Array<string | null | undefined>): boolean {
  return detectarGratis(...textos).gratis
}

/** True si el texto trae alguna condición que impide tomarlo como gratis (haya o no frase). */
export function tieneCondicionNoGratis(...textos: Array<string | null | undefined>): boolean {
  return primeraCondicion(normalizar(textos)) !== null
}
