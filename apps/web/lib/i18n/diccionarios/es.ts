/**
 * Textos de la interfaz en castellano: los mismos de siempre, sacados tal
 * cual de los componentes (Q3, base en inglés). `en.ts` tiene que tener
 * exactamente las mismas claves (`satisfies Diccionario`).
 *
 * Sin `as const` a propósito: así cada valor tipa como `string` (y no como su
 * literal), y el inglés puede decir otra cosa. Los textos con número son
 * funciones `(n: number) => string`, para que cada idioma arme su plural.
 */
import {
  MENSAJE_EVENTO_NO_DISPONIBLE,
  TEXTO_ENTRAR_PARA_MARCAR,
  TEXTO_SACASTE_GUARDADO_CON_VOY,
  textoBotonVoy,
} from '@qps/core/asistencia'
import { TARIFARIO } from '@qps/core/publicidad/precios'
import { textoSeguir, textoSeguirCuenta } from '@qps/core/radar/seguimiento'
import { vibeLabels } from '@qps/core/types'

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
  // /mapa (mapa-contenido.tsx, filtros-mapa.tsx, lista-lugares.tsx,
  // mapa-diferido.tsx, mapa-maplibre.tsx, pagina-mapa.tsx).
  mapa: {
    titulo: 'Mapa de eventos en Salta',
    bajada: 'Mirá dónde pasa cada plan y elegí por día.',
    cuando: 'Cuándo',
    hoy: 'Hoy',
    esteFinde: 'Este finde',
    elegirFecha: 'Elegir fecha',
    verEseDia: 'Ver ese día',
    // "para {hoy}": el filtro de fecha dentro de una frase.
    paraHoy: 'hoy',
    paraFinde: 'este finde',
    paraFecha: 'esta fecha',
    // "8 eventos en 5 lugares", "1 evento en 1 lugar".
    contador: (eventos: number, lugares: number) =>
      `${eventos} ${eventos === 1 ? 'evento' : 'eventos'} en ${lugares} ${lugares === 1 ? 'lugar' : 'lugares'}`,
    sinEventosConFiltros: 'Ningún evento en el mapa con estos filtros',
    sinEventosEnFecha: (cuando: string) => `No hay eventos con ubicación para ${cuando}`,
    quitarFiltros: 'Quitar filtros',
    sinUbicacion: (n: number) =>
      `${n} ${n === 1 ? 'evento no aparece' : 'eventos no aparecen'} en el mapa porque ${
        n === 1 ? 'su lugar todavía no tiene ubicación' : 'sus lugares todavía no tienen ubicación'
      }.`,
    verAgendaCompleta: 'Ver la agenda completa',
    vacioConFiltrosTitulo: (cuando: string) => `No hay eventos en el mapa con estos filtros para ${cuando}`,
    vacioConFiltrosTexto: (filtros: string) => `Filtros: ${filtros}. Probá con otra fecha o sacá alguno.`,
    verTodosLosEventos: 'Ver todos los eventos',
    // Lo que dice el lector de pantalla: "Peña La Casona, seleccionado: 3 eventos".
    seleccionado: (nombre: string, eventos: number) =>
      `${nombre}, seleccionado: ${eventos} ${eventos === 1 ? 'evento' : 'eventos'}`,
    centradoEn: (nombre: string) => `Mapa centrado en ${nombre}`,
    // Fila "Qué" (filtros-mapa.tsx)
    queTipoDePlan: 'Qué tipo de plan',
    gratis: 'Gratis',
    paraChicos: 'Para chicos',
    categoria: 'Categoría',
    todas: 'Todas',
    aplicarCategoria: 'Aplicar categoría',
    // Lista y mapa
    verEnElMapa: 'Ver en el mapa',
    noCargoElMapa: 'No pudimos cargar el mapa. La lista tiene los mismos lugares.',
    mapaNecesitaJs: 'El mapa necesita JavaScript. La lista de abajo tiene los mismos lugares.',
    ariaMapa: 'Mapa de lugares con eventos',
    ayudaMapa: 'La lista de lugares de esta página tiene los mismos lugares y eventos que el mapa.',
    errorTitulo: 'No pudimos cargar el mapa',
    errorTexto: 'Tuvimos un problema de nuestro lado. Probá de nuevo en un momento.',
  },
  // /buscar (buscar-content.tsx)
  buscar: {
    volver: 'Volver',
    titulo: 'Buscar eventos',
    placeholder: 'Buscar por evento, lugar o descripción...',
    filtros: 'Filtros',
    soloGratis: 'Solo gratis',
    paraChicos: 'Para chicos',
    explorarPorCategoria: 'Explorar por categoría',
    eventosEnCategoria: (n: number) => `${n} eventos`,
    quitarFiltros: 'Quitar filtros',
    // Con texto, los chips van de sufijo (" · gratis · para chicos").
    resultados: (cantidad: number, texto: string, gratis: boolean, chicos: boolean) =>
      `${cantidad} resultado${cantidad !== 1 ? 's' : ''} para "${texto}"${gratis ? ' · gratis' : ''}${chicos ? ' · para chicos' : ''}`,
    // Sin texto, los chips describen los eventos.
    eventosFiltrados: (cantidad: number, gratis: boolean, chicos: boolean) =>
      `${cantidad} evento${cantidad !== 1 ? 's' : ''}${gratis ? ' gratis' : ''}${chicos ? ' para chicos' : ''}`,
    sinResultadosParaTexto: (texto: string, gratis: boolean, chicos: boolean) =>
      `No se encontraron eventos para "${texto}"${gratis ? ' · gratis' : ''}${chicos ? ' · para chicos' : ''}`,
    sinEventosFiltrados: (gratis: boolean, chicos: boolean) =>
      `No hay eventos${gratis ? ' gratis' : ''}${chicos ? ' para chicos' : ''} por ahora.`,
  },
  // /radar (pagina-radar.tsx y radar-form.tsx). Los mensajes de las acciones
  // del servidor (lib/actions/radar.ts) no están acá: en castellano se muestra
  // el del servidor; en inglés, `errorServidor` elige por el código.
  radar: {
    titulo: 'Mi Radar Salteño',
    bajada:
      'Vos decidís qué eventos ver y recibir. Suscribite a tus categorías, locales u organizadores favoritos de Instagram y recibí alertas a tu correo sin spam.',
    frecuenciaTitulo: 'Frecuencia y Destinatario',
    frecuenciaPregunta: '¿Cada cuánto querés recibir novedades?',
    frecuenciaPlaceholder: 'Seleccioná la frecuencia',
    semanal: 'Semanalmente (Todos los Jueves 18:00hs)',
    quincenal: 'Cada 2 semanas (Quincenal)',
    mensual: 'Mensualmente',
    desactivado: 'Desactivado (Pausar alertas)',
    emailLabel: 'Dirección de correo electrónico',
    emailNota: 'Te lo mandamos al email de tu cuenta.',
    emailNotaAdmin: '* (En fase beta, los correos de prueba solo se enviarán a tu casilla asociada).',
    categoriasTitulo: 'Categorías que te interesan',
    categoriasTexto: 'Recibirás alertas de todos los eventos que se clasifiquen en las categorías seleccionadas.',
    lugaresTitulo: 'Lugares y Organizadores Preferidos',
    lugaresTexto:
      'Seguí locales físicos o directamente a organizadores/boliches de Instagram (ej: La Metro, Sex Us Machina) para enterarte de sus novedades.',
    buscadorPlaceholder: 'Buscá locales físicos o cuentas de Instagram (ej: Usina, Metro, Sex Us...)',
    localFisico: 'Local físico',
    subtituloCuenta: (usuario: string) => `@${usuario} (Organizador / Boliche)`,
    tipoInstagram: 'Instagram',
    tipoLugar: 'Lugar',
    sinCoincidencias: 'No se encontraron coincidencias.',
    dejarDeSeguir: (nombre: string) => `Dejar de seguir ${nombre}`,
    sinSeguimientos: 'No estás siguiendo ningún local ni cuenta de Instagram aún. Escribí arriba para buscarlos y agregarlos.',
    enviarPrueba: 'Enviar Correo de Prueba',
    enviandoPrueba: 'Enviando prueba...',
    guardar: 'Guardar Preferencias de Radar',
    guardando: 'Guardando...',
    errorGuardarTitulo: 'Error al guardar',
    errorInesperado: 'Ocurrió un error inesperado.',
    // En castellano no se usa: se muestra el mensaje del servidor tal cual.
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- la firma la fija el castellano; el inglés sí usa el código
    errorServidor: (_codigo: string | undefined) => 'Ocurrió un error inesperado.',
    listoTitulo: '¡Ya estás en el Radar! 📧',
    listoConDonacion:
      'Vas a recibir los mejores eventos. Ayudanos a seguir creciendo y lanzar la App móvil haciendo una donación.',
    listoSinDonacion: 'Vas a recibir los mejores eventos en tu correo.',
    donarAhora: 'Donar ahora',
    mensajeDonacion:
      'Vas a recibir los mejores eventos en tu correo. ¡Ayudanos a seguir creciendo y lanzar la App móvil haciendo una donación!',
    errorConexionTitulo: 'Error de conexión',
    errorConexionTexto: 'No se pudo comunicar con el servidor.',
    pruebaEnviadaTitulo: '¡Correo enviado!',
    pruebaEnviada: (cantidad: number) => `Se envió tu radar con ${cantidad} novedades a tu email.`,
    pruebaTitulo: 'Prueba de envío',
    pruebaNoEnviada: 'No se pudo enviar el correo de prueba.',
    pruebaErrorTexto: 'No se pudo iniciar la prueba de correo.',
  },
  // /anunciantes (pagina-anunciantes.tsx). Página estática (ISR): solo texto.
  anunciantes: {
    titulo: 'Publicitá tu evento',
    bajada:
      'Una agenda pensada para quien ya decidió salir y está buscando dónde: peñas, boliches, teatro, recitales, ferias y cine de Salta Capital, todo en un solo lugar.',
    parrafo1:
      'Qué Pinta Salta es la agenda donde se cargan y se buscan los planes de la ciudad: lo que hacen las productoras, los boliches, los teatros y los organismos culturales, además de lo que suben directamente los usuarios y organizadores.',
    parrafo2:
      'Para un anunciante, eso significa aparecer donde la gente ya está decidiendo qué hacer ese fin de semana, en vez de interrumpir con un anuncio genérico.',
    parrafo3: 'Más abajo, los números reales del sitio (actualizados cada una hora) y los precios, publicados y finales.',
    numerosTitulo: 'El sitio en números',
    masDe: (cantidad: string) => `más de ${cantidad}`,
    eventosDescripcion: 'Eventos publicados en los últimos 30 días',
    eventosNota:
      'Eventos que se cargaron en los últimos 30 días y hoy están publicados. El sitio no guarda la fecha exacta de publicación, solo la de carga, así que puede incluir eventos editados después.',
    vistasDescripcion: 'Vistas de ficha en los últimos 30 días',
    vistasNota:
      'Vistas de fichas de evento en los últimos 30 días (hasta ayer). Son eventos, no personas: abrir la misma ficha varias veces suma varias vistas.',
    radarDescripcion: 'Personas suscriptas al Radar',
    radarNota:
      'Personas suscriptas al Radar semanal, quincenal o mensual, redondeado hacia abajo a la decena para no sobreestimar el alcance real.',
    preciosTitulo: 'Precios',
    // "Vigentes {mes año}. Precios finales: no se les suma IVA." (la vigencia va en el medio)
    vigentesAntes: 'Vigentes ',
    vigentesDespues: '. Precios finales: no se les suma IVA.',
    avisoEtiqueta: 'Aviso de cambio de tramo.',
    precioFundador: 'Precio fundador:',
    aprox: 'Aprox.',
    comoFunciona: 'Cómo funciona',
    paso1: 'Nos escribís, nos contás tu evento y elegís el paquete y la fecha hasta la que querés destacarlo.',
    paso2: 'Pagás por transferencia o Mercado Pago, como prefieras.',
    paso3:
      'Lo destacamos hasta la fecha que elegiste. Llegado ese día, vence solo: no tenés que avisarnos ni sacarlo vos.',
    teInteresa: '¿Te interesa?',
    teInteresaTexto:
      'Contanos tu caso por WhatsApp o por mail y vemos qué paquete se ajusta mejor a tu evento o tu marca.',
    hablarWhatsapp: 'Hablar por WhatsApp',
    escribirMail: 'Escribinos por mail',
    mensajeWhatsapp: 'Hola! Me interesa anunciar en Que Pinta Salta.',
    asuntoMail: 'Quiero destacar mi evento',
    // Catálogo por id del TARIFARIO. En castellano es el mismo tarifario de
    // core (la página lee el nombre y el "qué incluye" del tarifario vigente);
    // el inglés lo traduce por id.
    productos: Object.fromEntries(
      TARIFARIO.map((producto) => [producto.id, { nombre: producto.nombre, queIncluye: producto.queIncluye }]),
    ) as Record<string, { nombre: string; queIncluye: string }>,
    gratis: 'Gratis',
    proximamente: 'Próximamente',
    reservaPrioridad: 'Reservá prioridad',
    porMes: '/mes',
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
  // Ficha del evento y sus modales (event-detail-page.tsx, event-modal-wrapper.tsx,
  // event-modal.tsx, ver-en-el-mapa.tsx). El bloque de admin de la categoría
  // queda en castellano: es solo para el equipo.
  ficha: {
    volverAEventos: 'Volver a eventos',
    sinCategorizar: 'Sin categorizar',
    // La hora llega ya formateada ("21:30" en castellano, "9:30 PM" en inglés).
    horaDelEvento: (hora: string) => `${hora} hs`,
    precioDeEntrada: 'Precio de entrada',
    comoLlegar: 'Cómo llegar',
    comprarTickets: 'Comprar tickets',
    verEnElMapa: 'Ver en el mapa',
    // Las de core, tal cual (Familiar / Adultos / Al Aire Libre).
    etiquetasVibe: { ...vibeLabels },
  },
  // Fila ♥ Guardar / ✓ Voy (fila-acciones-evento.tsx, botones-asistencia.tsx).
  // En castellano, los textos que comparte con la app salen de core.
  asistencia: {
    guardar: 'Guardar',
    guardado: 'Guardado',
    esteEvento: 'este evento',
    ariaGuardar: (titulo: string) => `Guardar ${titulo}`,
    ariaQuitarGuardado: (titulo: string) => `Quitar ${titulo} de tus guardados`,
    botonVoy: textoBotonVoy,
    ariaVoy: (titulo: string) => `Marcar que vas a ${titulo}`,
    ariaNoVoy: (titulo: string) => `Marcar que no vas a ${titulo}`,
    entrarParaMarcar: TEXTO_ENTRAR_PARA_MARCAR,
    errorTitulo: 'Error',
    errorGuardados: 'No pudimos actualizar tus guardados. Probá de nuevo.',
    errorMarca: 'No pudimos guardar tu marca. Probá de nuevo.',
    eventoNoDisponible: MENSAJE_EVENTO_NO_DISPONIBLE,
    sacasteGuardadoConVoy: TEXTO_SACASTE_GUARDADO_CON_VOY,
    errorConexionTitulo: 'Error de conexión',
    errorConexionTexto: 'No pudimos conectarnos al servidor. Probá de nuevo.',
  },
  // "+ Seguir" (boton-seguir.tsx). En castellano, los textos de core.
  seguir: {
    lugar: textoSeguir,
    cuenta: textoSeguirCuenta,
    error: 'No pudimos guardar el seguimiento. Probá de nuevo.',
  },
  // Modal de ingreso y alta (auth-modal.tsx): lo abren ♥ Guardar, ✓ Voy y
  // + Seguir sin sesión.
  auth: {
    tituloIngresar: 'Iniciar Sesión',
    tituloCrear: 'Crear Cuenta',
    descripcionIngresar: 'Guardá tus eventos favoritos para tenerlos siempre a mano.',
    descripcionCrear: 'Sumate para guardar favoritos y personalizar tu agenda.',
    email: 'Email',
    emailPlaceholder: 'tu@email.com',
    contrasena: 'Contraseña',
    mostrarContrasena: 'Mostrar contraseña',
    olvidasteContrasena: '¿Olvidaste tu contraseña?',
    iniciandoSesion: 'Iniciando sesión...',
    creandoCuenta: 'Creando cuenta...',
    botonIngresar: 'Iniciar Sesión',
    botonRegistrarse: 'Registrarse',
    oContinuarCon: 'O continuar con',
    // "Al continuar con Google aceptás los {Términos y condiciones} y la {Política de Privacidad}."
    aceptasConGoogle: 'Al continuar con Google aceptás los',
    aceptasAlCrear: 'Al crear tu cuenta aceptás los',
    terminos: 'Términos y condiciones',
    yLa: 'y la',
    privacidad: 'Política de Privacidad',
    cierreLegales: '.',
    noTenesCuenta: '¿No tenés cuenta?',
    registrate: 'Registrate',
    yaTenesCuenta: '¿Ya tenés cuenta?',
    iniciaSesion: 'Iniciá Sesión',
    errorGoogle: 'Ocurrió un error al iniciar sesión con Google. Probá de nuevo.',
    bienvenidoDeNuevo: '¡Bienvenido de nuevo!',
    sesionIniciada: 'Sesión iniciada correctamente.',
    bienvenido: '¡Bienvenido!',
    revisaTuEmail: 'Revisá tu email',
    /**
     * Los mensajes de `@qps/core/auth/mensajes` y de `validarContrasenaNueva`
     * (que ya eligen qué decir sin delatar si un email tiene cuenta). En
     * castellano van tal cual; en inglés, su traducción si la hay.
     */
    mensaje: (mensaje: string) => `${mensaje}`,
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
