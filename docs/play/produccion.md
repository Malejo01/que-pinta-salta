# Pedido de acceso a producción en Google Play

**Fecha objetivo: 9/11/2026.** Requisito de Play para cuentas personales nuevas: una prueba cerrada con **al menos 12 testers durante 14 días seguidos**. La prueba cerrada corre desde el **26/10**, así que los 14 días se cumplen el **9/11**.

> Lo que está entre `[COMPLETAR]` lo sabe solo Mauro: cuántos testers hay hoy en Play Console, cómo se los invitó y qué contaron por WhatsApp.

## Checklist para el 9/11

### Antes de pedir el acceso
- [ ] **Play Console → Prueba cerrada → Testers**: hay **12 o más** testers que **aceptaron la invitación** y siguen activos (no alcanza con estar en la lista; tienen que haber instalado). Hoy hay unos 16 en la lista `[COMPLETAR: cuántos aceptaron]`.
- [ ] **14 días seguidos** con 12 o más testers desde el 26/10. Si alguno se dio de baja y el número bajó de 12, el conteo de Play puede reiniciarse: verificar en el panel «Requisitos para producción».
- [ ] El **build 7** está subido a la prueba cerrada y los testers lo actualizaron (por WhatsApp, con el mensaje de `docs/beta/novedades-build-7.md`).
- [ ] **Ficha de la tienda** completa. La redacta Gemini en paralelo: no duplicarla acá.
- [ ] **Contenido de la app**:
  - [ ] Política de privacidad: `https://www.quepintasalta.com.ar/privacidad`. Antes, sumar el texto propuesto de avisos sin cuenta (PR #146) y el de búsquedas recientes (Q4-12), si se aprueban.
  - [ ] **Seguridad de los datos**: actualizar con `docs/play/seguridad-de-datos.md`. Hay **diferencias marcadas** con la ficha actual.
  - [ ] **Permisos de ubicación**: `docs/play/ubicacion.md` (solo aproximada desde el build 7).
  - [ ] Anuncios: «La app contiene anuncios: Sí» (AdMob en Inicio y Buscar).
  - [ ] Clasificación de contenido: el cuestionario ya respondido para la prueba cerrada sigue valiendo, salvo que se haya cambiado algo.
  - [ ] Público objetivo: 18+ o 13+, como se declaró. «Para chicos» es un filtro de eventos, no una app para chicos: no marcar «Diseñada para familias».
  - [ ] Eliminación de cuenta: `https://www.quepintasalta.com.ar/eliminar-cuenta`.
- [ ] Sin errores abiertos en **Android vitals** ni en el **informe previo al lanzamiento**. El de Sentry QUE-PINTA-SALTA-APP-1 venía del robot de Play: ver PR #148.

### El cuestionario de acceso a producción
Respuestas sugeridas abajo. Están en castellano para revisarlas: el formulario de Play suele estar en el idioma de la consola.

## Respuestas sugeridas al cuestionario

### 1. ¿Cómo reclutaste a los testers?
> Invitamos a personas de Salta que usan la agenda web de Qué Pinta Salta: amigos, conocidos y público de eventos culturales locales, `[COMPLETAR: por WhatsApp / Instagram / en persona]`. Les mandamos el enlace de la prueba cerrada y un grupo de WhatsApp para comentarios. Son unas 16 personas con teléfonos Android de distintas marcas y versiones.

### 2. ¿Qué tan fácil fue reclutarlos? / ¿Usaron la app?
> Fácil: la agenda ya tenía público local. La mayoría la usa para ver qué hay el fin de semana, guardar eventos y ver la cartelera de cine. `[COMPLETAR: algo concreto, p. ej. cuántos instalaron el build 6]`

### 3. ¿Qué comentarios recibiste y qué cambiaste?
Lo que contaron los testers y qué se cambió, con fechas (merge en `main`):

| Build | Fecha | Qué contaron | Qué cambiamos | PR |
|---|---|---|---|---|
| 4 | 26/10 | Tocar una película en Cine volvía a la portada («siempre vuelve a la película 1»). | La película abre su propia ficha; flyers y eventos, cada uno la suya. | Malejo01/que-pinta-salta#99 (R67) |
| 4 | 26/10 | Para llegar a una categoría había que buscarla. | Chips de categoría y fechas arriba de todo y fijos al hacer scroll; elegir «Cine» muestra la cartelera. | #99 |
| 4 | 26/10 | Al crear la cuenta no quedaba la sesión iniciada. | Alta con sesión iniciada al confirmar. | #99, #103 |
| 4 | 26/10 | No se podía sacar de Favoritos una película o un flyer. | Favoritos por tipo, con el corazón en la tarjeta y en las fichas. «En cartel» en vez de la fecha en las películas. | #101 (R69) |
| 5 | 27/10 | Accesibilidad: el corazón y Compartir dentro de la tarjeta, chips que se distinguían solo por color. | Foco propio para el corazón y Compartir con TalkBack, chips con borde y negrita, contraste ≥ 3:1. | #104 (R72) |
| 5 | 26–27/10 | Pedido de avisos de lo nuevo. | Invitación a activar los avisos y «Aviso del equipo». | #102 (R70) |
| 6 | 30/10 | La cabecera de Inicio ocupaba un cuarto de la pantalla (tres filas de filtros). | Una sola fila: botón «Filtros» con hoja inferior y las fechas. | #137 (R81) |
| 6 | 30/10 | Preguntar por los avisos al principio, no en medio de la navegación. | Bienvenida en dos pasos con «¿Te avisamos?». | #137, #138 |
| 7 | 3/11 | «Si digo que no, que no me pregunte con cada actualización.» | La invitación a los avisos aparece una sola vez por persona. | #139 (R83) |
| 7 | 3/11 | `[COMPLETAR si vino de testers]`: avisos sin cuenta. | Los avisos funcionan sin iniciar sesión, con interruptores en Cuenta. | #146 |
| 7 | 3/11 | Error al entrar con Google (Sentry, build 2). | Errores de Google clasificados: cancelar no muestra error y hay un mensaje claro con la opción de usar el email. | #148 |

Para el formulario, en corto:
> Recibimos comentarios por un grupo de WhatsApp y por los reportes de errores (Sentry). Entre el build 3 y el 7 cambiamos:
> - la navegación de la portada (filtros en un botón, categorías a mano);
> - un error que hacía volver a la portada al tocar una película;
> - Favoritos para películas;
> - accesibilidad con TalkBack y contraste;
> - el pedido de permiso de notificaciones (una sola vez, al principio);
> - el ingreso con Google, que ahora explica qué pasó cuando falla.

### 4. ¿Qué cambió entre la prueba cerrada y la versión de producción?
> El build 7 suma:
> - avisos sin necesidad de cuenta;
> - recordatorios de lo que guardaste (si se incluye Q4-10);
> - ubicación solo aproximada;
> - textos más claros en los errores de ingreso.
>
> No hay cambios de funcionalidad grandes pendientes para producción.

### 5. ¿La app está lista para producción?
> Sí. La usan testers reales todos los días y los errores que encontraron están resueltos. La app está pensada para el público de Salta; los datos del evento salen de las ticketeras y organizadores locales.

## Qué falta (al 3/11)
- [ ] Confirmar en Play Console el número de testers activos y que los 14 días están corriendo sin reinicios.
- [ ] Subir el build 7 y pedir a los testers que actualicen.
- [ ] Aplicar los textos legales propuestos, si se aprueban: avisos sin cuenta (#146) y búsquedas recientes.
- [ ] Actualizar «Seguridad de los datos» y la declaración de ubicación.
- [ ] La ficha de la tienda (Gemini).
- [ ] El 9/11: «Solicitar acceso a producción» y responder el cuestionario con lo de arriba.
