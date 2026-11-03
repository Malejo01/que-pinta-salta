# Tanda Q5 · 2/11 noche → 3/11 · decisiones de Mauro para los agentes

Base: `ronda/integracion-q5`, que sale de la punta de `ronda/integracion-q4` (PR #142, todavía sin mergear a `main` al arrancar). Cuando #142 entre a `main`, mergeá `origin/main` en `ronda/integracion-q5` con `--no-ff`.

## Decisiones ya tomadas (2/11, «todo lo recomendado»)
- Alcance: lugares para chicos, fichas de lugares, más y mejores eventos, la app en inglés, panel de uso para Mauro y los pendientes chicos de Q4.
- Migraciones: igual que en Q4. Se aplican en producción solo si son aditivas y compatibles hacia atrás, después del CI verde y antes del merge a la integración.
- Las 19 «Decisiones para Mauro» de #142 quedan aceptadas como las dejó el agente de Q4.

### Lugares para chicos (§6.4 de `docs/propuestas/lugares-para-chicos.md`)
1. Zona: Salta Capital primero; el modelo admite el Gran Salta, pero la carga inicial es solo Capital.
2. Carga y verificación: el equipo (rol admin) desde `/admin`. Plazos de 90 y 180 días como propone el documento. Para arrancar, un importador desde OpenStreetMap que deja los lugares como **borrador** para que un admin los verifique; nada se publica sin verificación.
3. Salones que abren solo con reserva: entran, marcados «Con reserva».
4. Emprendimientos en casas particulares: afuera.
5. La capa se prende sola con el chip «Para chicos».
6. Ficha propia por lugar: sí (`/lugar/<slug>`), junto con las fichas de lugares de esta tanda.
7. Publicidad en la capa: no, por ahora.
8. `cargado_por` / `verificado_por`: grant por columnas para `anon` (no se exponen).
9. Alta a pedido: sí, formulario público que entra como borrador, con anti-spam.
10. Barrios: lista corta (15 a 25) con puntos aproximados, en un archivo de datos versionado y editable.

## Q5-14 · Pendientes de Q4 (lo que hizo el agente)
- `notificaciones.yml`: el `schedule` (minuto 5 de cada hora) queda activo. Corre en modo de prueba (`dryRun`) salvo que el repo tenga `PUSH_ENVIO_REAL=1`; `armarTanda` sigue respetando el horario de silencio y el tope diario. Solo corre desde `main`, porque GitHub lanza los schedules únicamente desde la rama por defecto.
- `/admin/avisos`: el historial del aviso del equipo dice «(N sin cuenta)», contando los teléfonos sin cuenta.
- Migración `q5_invalidar_traduccion`: un trigger borra `title_en`, `description_en` y `traducido_en_at` cuando cambian el título o la descripción. El job de traducción la vuelve a hacer, con su tope.
- App, Inicio: la grilla de eventos usa `flexWrap` en vez de filas armadas a mano. Las grillas virtualizadas de Buscar y Mis eventos no se tocaron.
- Web, `/en/auth/login`: es la misma página, con los textos en el diccionario `paginaIngreso`.
  - Hay que tener en cuenta que el alta en inglés va por el modal de ingreso, que ya estaba traducido.
  - `/auth/sign-up`, `/perfil` y `/nuevo-evento` quedan en castellano como pendiente, anotado en `cobertura-en`.

## Q5-16 · Decisiones de Mauro sobre la Q4 (3/11)
Las tomó Mauro sobre las «Decisiones para Mauro» de #142. Las implementó el agente en `nube/q5-decisiones-q4`.
- **nº2 · Bajas sin cuenta**: las bajas de patrocinados de los teléfonos **sin** cuenta también cuentan en `bajas_48h`.
  - Columna nueva `push_tokens.avisos_patrocinados_baja_at`. La marca `set_push_preferences` solo cuando el interruptor pasa de prendido a apagado.
  - Cerrar sesión lo apaga sin marcar, así que no cuenta como baja.
  - `medirBajas` suma los destinatarios y las bajas de las dos vías (`user_id` y `push_token_id`).
- **nº5 · Límite de registro**: `POST /api/push/registrar` permite 6 pedidos por hora por dispositivo (antes, 20). Si se pasa, la app recibe 429 y sigue con el registro que ya tenía.
- **nº7 · Sugerencia de geocodificación**: si Nominatim no da un match seguro, se guarda la mejor sugerencia.
  - Va en `venues.geocode_sugerencia_lat`, `_lng`, `_texto` y `_at`, y no toca `latitude` ni `longitude`.
  - En `/admin/lugares`, pestaña «Sin ubicación», aparecen la sugerencia con «© colaboradores de OpenStreetMap» y los botones «Confirmar» y «Descartar».
  - Un lugar con sugerencia pendiente ya no se reintenta solo a los 30 días. Al descartarla, vuelve a la regla de los 30 días.
  - Confirmar nunca pisa una ubicación cargada a mano.
- **nº13 · JSON-LD en inglés**: en `/en/evento/<id>`, el JSON-LD lleva `name` y `description` traducidos, con `inLanguage: "en"`.
  - Sin traducción, van los originales con `"es-AR"`.
  - Si está el título traducido pero no la descripción, la descripción va en castellano.
- **nº17 · «Este finde pinta»**: ya se cancelaba cuando la app veía el aviso del equipo (en primer plano, o en la bandeja al volver a abrirse). Ahora también se cancela cuando la persona **tocó** el aviso con la app cerrada, porque al tocarlo sale de la bandeja.
  - Queda afuera un caso: el aviso llega con la app cerrada, se descarta sin tocarlo y la app no se abre antes de las 18. Cubrirlo necesita una tarea en segundo plano con `expo-task-manager`, que es una dependencia nueva, así que lo salteé.
- **nº18 · Búsquedas de una cuenta borrada desde la web**: al arrancar con una sesión guardada, la app pregunta por la cuenta (`auth.getUser()`).
  - Si el servidor responde `user_not_found`, borra las búsquedas recientes y cierra la sesión local.
  - Sin red, con otro error o con un cierre de sesión común no se borra nada.
