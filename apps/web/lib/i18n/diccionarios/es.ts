/**
 * Textos de la interfaz en castellano: los mismos de siempre, sacados tal
 * cual de los componentes (Q3, base en inglés). `en.ts` tiene que tener
 * exactamente las mismas claves (`satisfies Diccionario`).
 *
 * Sin `as const` a propósito: así cada valor tipa como `string` (y no como su
 * literal), y el inglés puede decir otra cosa. Los textos con número son
 * funciones `(n: number) => string`, para que cada idioma arme su plural.
 */
import { TEXTO_SACASTE_GUARDADO_CON_VOY } from '@qps/core/asistencia'

export const es = {
  nav: {
    buscarEventos: 'Buscar eventos',
    verMapa: 'Ver el mapa',
    apoyarTitulo: 'Apoyar a Qué Pinta Salta',
    apoyar: 'Apoyar',
    // Era así en inglés desde antes; se deja igual para no cambiar el texto.
    cambiarTema: 'Toggle theme',
    misEventos: 'Mis eventos',
    radarSalteno: 'Radar Salteño',
    miRadarSalteno: 'Mi Radar Salteño',
    agregarEvento: 'Agregar Evento',
    administrador: 'Administrador',
    miPerfil: 'Mi Perfil',
    eventosQueCargaste: 'Eventos que cargaste',
    cerrarSesion: 'Cerrar sesión',
    ingresar: 'Ingresar',
    // Barra inferior (mobile-nav.tsx)
    inicio: 'Inicio',
    buscar: 'Buscar',
    mapa: 'Mapa',
    radar: 'Radar',
  },
  pie: {
    descripcion: 'Descubrí todos los eventos, peñas, boliches, teatros y más que están pasando en Salta Capital.',
    enlaces: 'Enlaces',
    anunciantes: 'Anunciantes',
    agregarEvento: 'Agregar Evento',
    anunciar: 'Anunciar / Publicidad 📢',
    preferenciasCookies: 'Preferencias de cookies',
    conectaConmigo: 'Conectá conmigo',
    contactame: 'Contactame',
    donacionTitulo: '¿Te gusta la plataforma?',
    donacionTexto:
      'Ayudanos a llevarla a tu celular. Hacé tu aporte para fondear el desarrollo de la futura aplicación móvil oficial (Android/iOS) de Qué Pinta Salta.',
    donacionMensaje: 'Ayudanos a llevar Qué Pinta Salta a tu celular. Tu aporte es clave para el desarrollo de la App.',
    hacerAporte: 'Hacer un aporte',
    derechos: (anio: number) => `© ${anio} Que pinta Salta. Hecho con ❤️ en Salta, Argentina.`,
    desarrolladoPor: 'Desarrollado por',
  },
  portada: {
    tituloOculto: 'Que pinta Salta - Agenda de Eventos, Peñas y Boliches en Salta Capital',
    hoyEnSalta: 'Hoy en Salta',
    hoySinEventos: 'Hoy no hay eventos cargados. Mirá qué viene en los próximos días.',
    verEstaSemana: 'Ver esta semana',
    radarTitulo: '¡No te pierdas ningún evento!',
    radarTexto: 'Elegí tus categorías favoritas y recibí la agenda del fin de semana directamente en tu correo.',
    radarBoton: 'Configurar mi Radar 📡',
    resultadosFiltrados: 'Resultados filtrados',
    sinResultados: 'No se encontraron eventos con los filtros seleccionados.',
    limpiarFiltros: 'Limpiar filtros',
    sinEventos: 'No hay eventos disponibles en este momento.',
    // Filtros (filters-bar.tsx)
    cargandoCalendario: 'Cargando calendario…',
    filtroHoy: 'Hoy',
    filtroSemana: 'Esta semana',
    filtroMes: 'Este mes',
    filtroTendencias: 'Tendencias',
    todasLasFechas: 'Todas las fechas',
    buscarPlaceholder: 'Buscar por evento o lugar...',
    limpiarFecha: 'Limpiar fecha',
    categorias: 'Categorías',
    todas: 'Todas',
    masFiltros: 'Más filtros',
    mostrarFlyers: 'Mostrar flyers de redes',
    establecimiento: 'Establecimiento',
    lugarPlaceholder: 'Lugar',
    ubicacion: 'Ubicación',
    zonaPlaceholder: 'Zona',
    chipBusqueda: (texto: string) => `Búsqueda: "${texto}"`,
    chipLugar: (texto: string) => `Lugar: ${texto}`,
    chipZona: (texto: string) => `Zona: ${texto}`,
    filtrosActivos: 'Filtros activos:',
    quitarFiltro: 'Quitar filtro',
    quitarFiltroDe: (etiqueta: string) => `Quitar filtro: ${etiqueta}`,
    limpiarTodo: 'Limpiar todo',
    // Filas y carrusel (category-row.tsx, hero-carousel.tsx)
    verTodos: 'Ver todos',
    desplazarIzquierda: 'Desplazar hacia la izquierda',
    desplazarDerecha: 'Desplazar hacia la derecha',
    verDetalles: 'Ver detalles',
    entradaGratuita: 'Entrada Gratuita',
    eventoAnterior: 'Evento anterior',
    siguienteEvento: 'Siguiente evento',
    irAlEvento: (n: number) => `Ir al evento ${n}`,
    // Tarjeta (event-card.tsx)
    gratis: 'Gratis',
    funcionesHoy: 'Funciones Hoy',
    clickHorarios: 'Click para ver horarios y comprar',
    proximasFunciones: 'Próximas Funciones',
    sinHora: 'Sin hora',
    clickDetalles: 'Click para ver detalles',
    graciasPorCompartir:
      '¡Gracias por compartir! Si Qué Pinta Salta te ayuda a organizar tu finde, ¿nos invitás un cafecito para fondear el desarrollo de la App móvil oficial?',
    // Pie de la tarjeta con varias funciones: "+3 fechas" (el resto lo arma fechas.ts).
    masFechas: (n: number) => `+${n} fechas`,
    // Textos que arma packages/core/src/home/transform.ts (ver localizarEventos).
    lugarPorConfirmar: 'Lugar por confirmar',
    cinesDeSalta: (n: number) => `${n} ${n === 1 ? 'Cine' : 'Cines'} de Salta`,
    /**
     * Nombre de cada categoría por slug. En castellano va vacío: se usa el
     * nombre que viene de la base, como siempre (ver `nombreCategoria`).
     */
    nombresCategorias: {} as Record<string, string>,
  },
  cines: {
    titulo: 'Cartelera de Cines',
    // "Explorá … en Cinemark Alto NOA, Cinemark Paseo Salta y Cine Ópera de forma unificada."
    bajadaInicio: 'Explorá todas las películas en cartelera hoy en ',
    bajadaSeparador: ', ',
    bajadaY: ' y ',
    bajadaFin: ' de forma unificada.',
    buscarPelicula: 'Buscar película por nombre...',
    sinPeliculas: 'No se encontraron películas',
    sinResultados: (texto: string) => `No hay resultados para "${texto}". Probá buscando con otro título.`,
    sinCartelera: 'No hay películas en cartelera actualmente.',
    sinPoster: 'Sin Poster',
    cantidadCines: (n: number) => `${n} ${n === 1 ? 'Cine' : 'Cines'}`,
    comprarEntradas: 'Comprar Entradas',
    sinFuncionesHoy: 'Sin funciones para hoy',
    // Modal de película (movie-modal.tsx)
    carteleraDeCine: 'Cartelera de Cine',
    comprar: 'Comprar',
    noHayFunciones: 'No hay funciones disponibles para hoy.',
    horariosActualizados: 'Horarios actualizados para hoy',
  },
  // Corazón de las tarjetas y del modal (favorite-button.tsx)
  favorito: {
    guardar: 'Guardar en favoritos',
    quitar: 'Quitar de favoritos',
    errorTitulo: 'Error',
    errorTexto: 'No se pudo actualizar el favorito.',
    guardadoTitulo: 'Favorito guardado',
    // El mismo texto va en el toast y en el modal de donación (tests/textos/voseo.test.ts).
    pedidoCafecito:
      '¡Plan guardado! ❤️ Si Qué Pinta Salta te ayuda a organizar tu finde, invitanos un cafecito para ayudarnos a crear la App móvil.',
    guardadoTexto: 'El elemento se agregó a tu agenda.',
    donarAhora: 'Donar ahora',
    eliminadoTitulo: 'Favorito eliminado',
    eliminadoTexto: 'El elemento se quitó de tu agenda.',
    // El texto único de core para cuando sacar el ♥ también saca el Voy (QPS-197).
    sacasteGuardadoConVoy: TEXTO_SACASTE_GUARDADO_CON_VOY,
    errorConexionTitulo: 'Error de conexión',
    errorConexionTexto: 'No pudimos conectarnos al servidor. Intentalo de nuevo.',
  },
  // Botón de compartir (share-button.tsx)
  compartir: {
    compartirEvento: 'Compartir evento',
    linkCopiado: 'Link copiado',
    noSePudoCopiar: 'No se pudo copiar el link',
  },
  // Aviso de cookies (consent-banner.tsx)
  cookies: {
    region: 'Aviso de cookies',
    textoConAnuncios: 'Usamos Google Analytics y anuncios de Google. Si aceptás, los anuncios pueden ser personalizados.',
    textoSinAnuncios: 'Usamos Google Analytics para saber qué se usa del sitio. Solo si aceptás.',
    masInfoAria: 'Más información sobre cookies en la Política de Privacidad',
    masInfo: 'Más info',
    rechazar: 'Rechazar',
    aceptar: 'Aceptar',
  },
  comun: {
    // Solo se muestra en inglés (aviso-contenido-es.tsx); acá va su equivalente.
    avisoContenidoEs:
      'Los detalles de los eventos están en castellano: los nombres y las descripciones se muestran como los publican los lugares.',
  },
  idioma: {
    // El selector muestra el OTRO idioma, escrito en ese idioma.
    otro: 'English',
    // Versión corta para el header en celular (donde no entra la palabra entera).
    otroCorto: 'EN',
    // WCAG 2.5.3: el nombre accesible contiene el texto visible («EN» en
    // celular, «English» desde sm:).
    otroAria: 'English (EN): view this site in English',
  },
}

export type Diccionario = typeof es
