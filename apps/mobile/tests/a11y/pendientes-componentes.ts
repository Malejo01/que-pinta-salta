// 46-b: línea de base de `tests/accesibilidad-detector.test.ts` para
// `components/**` — lo que el barrido encuentra HOY (18/10, rama
// ronda/46-calidad-app), no lo que dice la tabla del plan (que es de un
// commit viejo: ver las diferencias anotadas en el reporte de la tarea).
//
// Un archivo que no aparece acá tiene línea de base 0 para las seis reglas:
// el detector falla si encuentra algo en un archivo ausente de esta lista.
//
// Esta lista SOLO puede bajar (el detector falla también si un número acá
// queda más alto que lo que el barrido encuentra de verdad): cuando 46-c o
// 46-d arreglen un tocable, hay que bajar (o borrar) la entrada acá, en el
// mismo commit que el arreglo — si no, el detector marca "menos hallazgos
// que la línea de base" y falla igual, a propósito, para que la lista no
// quede vieja.
//
// `sin-escalar` y `escala-suelta` no tienen entradas acá (ninguna, en ningún
// archivo): las dos están en 0 desde esta ronda y el test principal las
// exige en 0 siempre, sin pasar por esta línea de base.
//
// 46-c (Ronda 46, tanda 2): bajó `sin-rol` y `sin-etiqueta` a 0 en todos los
// archivos (roles, etiquetas y accessibilityState agregados) y subió a 48
// los `minHeight: 44` de filas/botones grandes donde 4dp no se notan
// (PantallaRadar filaFrecuencia/itemCategoria/filaSugerencia, EstadoCarga
// boton, FilaCategoria botonVerTodos) — esos archivos salieron de esta
// lista. Las cuatro entradas que quedan son "piezas chicas con forma propia"
// (ojito, botón de usuario, pill, puntos del Hero) donde subir el tamaño del
// estilo SÍ se notaría (fondo/borde visibles, o layout vecino que se corre):
// se arreglaron con `hitSlop` (`lib/accesibilidad.ts`, `hitSlopPara`), que
// agranda el área de toque real sin cambiar nada de lo que se ve — pero el
// detector estático de `tests/accesibilidad-detector.test.ts` no entiende
// `hitSlop` (solo mira `minHeight`/`minWidth`/`height`/`width` del
// `StyleSheet.create`, ver su cabecera): por eso siguen listadas acá, con el
// motivo de cada una en el componente y en el reporte de 46-c. Si en algún
// momento se agrega la excepción correspondiente a
// `EXCEPCIONES_AREA_CHICA` (en `tests/accesibilidad-detector.test.ts`, no es
// archivo de esta tarea), estas cuatro entradas se podrían borrar.

/** Las seis reglas que detecta `tests/accesibilidad-detector.test.ts`. */
export type ReglaAccesibilidad = 'sin-rol' | 'sin-etiqueta' | 'link-externo' | 'area-chica' | 'sin-escalar' | 'escala-suelta'

/** Archivo (ruta relativa a `apps/mobile`, con `/`) -> cantidad de
 * hallazgos por regla que el barrido encuentra hoy en ese archivo. */
export type LineaBaseAccesibilidad = Record<string, Partial<Record<ReglaAccesibilidad, number>>>

export const PENDIENTES_COMPONENTES: LineaBaseAccesibilidad = {
  // El "ojito" de mostrar/ocultar contraseña: 44×44 (estilos.ojito), sin
  // fondo/borde propio. Ya tiene `hitSlop={hitSlopPara(44)}` (46-c): el área
  // de toque real llega a 48, pero el estilo sigue en 44 (subirlo no
  // cambiaría nada visible — ya está dentro de una caja de 48 — pero el
  // detector no ve el hitSlop, solo el número del estilo).
  'components/CampoTexto.tsx': { 'area-chica': 1 },
  // El botón de usuario (ícono solo, con sesión): 40×40 (estilos.botonUsuario),
  // sin fondo propio. Ya tiene `hitSlop={hitSlopPara(40)}` (46-c): se eligió
  // hitSlop en vez de subir el tamaño del estilo porque la fila es
  // `space-between` con el logo del otro extremo, y agrandar el estilo
  // corre el ícono unos px.
  'components/Encabezado.tsx': { 'area-chica': 1 },
  // Los puntos de paginación del Hero (estilos.punto, height: 6): en
  // vertical llegan a 48 con hitSlop (46-c); en horizontal están pegados
  // (gap: 6) y no pueden llegar a 48 sin pisarse entre ellos — el gesto
  // principal para cambiar de diapositiva es deslizar, no tocar el punto.
  // Autorizado explícitamente por el plan de 46-c.
  'components/Hero.tsx': { 'area-chica': 1 },
  // La pill de cada atajo (Hoy/Esta noche/Finde/Semana): estilos.pill,
  // minHeight: 44 (el ancho sí llega, solo falta alto). Ya tiene
  // `hitSlop={hitSlopPara(AREA_TACTIL_MINIMA, 44)}` (46-c): se eligió
  // hitSlop en vez de subir `minHeight` porque la pill tiene fondo/borde
  // visibles y un resaltado animado (`estilos.resaltado`) que mide el
  // layout real de cada pill — subir el estilo desalinearía el resaltado y
  // agrandaría visiblemente la pill.
  'components/PillsAtajos.tsx': { 'area-chica': 1 },
}
