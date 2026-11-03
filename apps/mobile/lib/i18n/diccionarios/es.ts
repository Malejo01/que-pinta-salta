/**
 * Q5-11 · Diccionario de la app en castellano (rioplatense, con voseo).
 * `en.ts` lo replica con `satisfies Diccionario`: si falta o sobra una clave,
 * el typecheck falla. Las pantallas migradas (lista en
 * tests/i18n-detector.test.ts) no pueden tener texto visible fuera de acá.
 */
export const es = {
  comun: {
    reintentar: 'Reintentar',
    cargando: 'Cargando…',
    quitarFiltros: 'Quitar filtros',
    enCastellano: '(en castellano)',
  },
  idioma: {
    titulo: 'Idioma',
    descripcion: 'El idioma de la app. «Automático» usa el del teléfono.',
    automatico: 'Automático',
    castellano: 'Español',
    ingles: 'English',
    cambiadoA: (nombre: string) => `Idioma: ${nombre}`,
  },
  lugaresChicos: {
    titulo: 'Lugares para chicos',
    acceso: 'Plazas, peloteros, salones de juegos y espacios culturales',
    leyenda:
      'Los datos los carga y verifica el equipo de Qué Pinta Salta. No inspeccionamos los lugares: confirmá horarios antes de ir.',
    todos: 'Todos',
    todosLosTipos: 'Todos los tipos',
    gratis: 'Gratis',
    soloGratis: 'Solo lugares gratis',
    abiertoAhora: 'Abierto ahora',
    elegiTuBarrio: 'Elegí tu barrio',
    elegiTuBarrioEtiqueta: 'Elegí tu barrio para ordenar por cercanía',
    cercaDe: (barrio: string) => `Cerca de ${barrio}`,
    barrioCambiar: (barrio: string) => `Barrio: ${barrio}. Cambiar`,
    sinBarrio: 'Sin barrio',
    sinOrdenar: 'Sin ordenar por cercanía',
    ordenadosPorBarrio: (barrio: string) => `Ordenados por cercanía a ${barrio}`,
    ordenadosPorUbicacion: 'Ordenados por cercanía a tu ubicación aproximada.',
    barrioPrivacidad: 'El barrio se usa solo en el teléfono para ordenar la lista: no se guarda ni se manda.',
    conteo: (n: number) => (n === 0 ? 'Ningún lugar con estos filtros' : n === 1 ? '1 lugar' : `${n} lugares`),
    vacioSinDatos: 'Todavía no hay lugares verificados. Estamos cargando los primeros.',
    vacioConFiltros: 'No hay lugares con estos filtros.',
    abreLaFicha: 'Abre la ficha del lugar',
    tituloFicha: 'Lugar para chicos',
    yaNoEsta: 'Este lugar ya no está publicado.',
    comoLlegar: 'Cómo llegar',
    comoLlegarA: (nombre: string) => `Cómo llegar a ${nombre}`,
    horarios: 'Horarios',
    conReserva: 'Con reserva: escribiles o llamalos antes de ir.',
    espacioAbierto: 'Espacio abierto',
    verificadoEl: (fecha: string) => `Verificado el ${fecha}`,
    puedeHaberCambiado: 'Puede haber cambiado: confirmá antes de ir.',
    web: 'Web',
    webDe: (nombre: string) => `Web de ${nombre}`,
    instagram: 'Instagram',
    instagramDe: (nombre: string) => `Instagram de ${nombre}`,
    llamar: 'Llamar',
    llamarA: (nombre: string) => `Llamar a ${nombre}`,
    errorCarga: 'No pudimos cargar los lugares para chicos. Revisá tu conexión.',
  },
}

export type Diccionario = typeof es
