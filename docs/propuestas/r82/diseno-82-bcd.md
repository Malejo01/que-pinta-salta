# Diseño de 82-b, 82-c y 82-d (para implementar con la migración ya copiada)

Base: `20261030120000_r82_avisos_sin_sesion.sql` (en esta carpeta). Rutas relativas a `qps-wt/25`. Todo lo de abajo se leyó del código de `main` + R81; nada se probó.

## 0. Decisiones de diseño que valen para las tres tareas

1. **Quién manda en cada fila.** Fila con `user_id`: mandan las preferencias de la cuenta (`notification_preferences`: `announcements`, `sponsored`, silencio, tope) como hoy. Fila sin `user_id` (anónima): mandan `push_tokens.avisos_equipo` / `avisos_patrocinados`, con silencio 23:00–09:00 y tope 4/día por defecto (los mismos defaults que `PREFERENCIAS_POR_DEFECTO`). Evita dos fuentes de verdad para una cuenta. **Diferencia con el plan:** el plan dice «a todas las filas con `avisos_equipo = true`, con y sin usuario»; para las filas con usuario eso ignoraría `announcements`, que es lo que el usuario ya eligió en Cuenta. Se propone no hacerlo (duda 1 abajo).
2. **`notification_sends` para anónimos:** `user_id` nullable + `push_token_id` (FK a `push_tokens`, cascade). La `dedupe_key` de un anónimo usa el id de la fila de `push_tokens` donde las claves de hoy usan el `user_id` (`claveDedupe` / `claveDedupeAvisoEquipo` / `claveDedupePatrocinado` sirven tal cual: reciben un string). Los dos son uuid y no chocan.
3. **Sin duplicar por token:** el token es único en la tabla, así que una fila es de un usuario O anónima, nunca las dos. Si se lee «usuarios con token» y «anónimos» con filtros excluyentes (`user_id is not null` / `user_id is null`), un token no puede salir dos veces.
4. **Vínculo al iniciar sesión:** orden fijo en la app: primero `POST /api/push/registrar` (asegura `device_id` en la fila), después la RPC existente `register_push_token` (pone `user_id`, no toca `device_id`). Una sola fila.
5. **Cerrar sesión:** RPC `unlink_push_token(token)` en lugar de `borrarTokenDeEsteTelefono`. La fila queda anónima con los interruptores copiados de la cuenta.
6. **Borrar cuenta:** sin cambios en `delete_my_account` (borra `push_tokens` por `user_id`, y por cascada sus envíos por `push_token_id`). El teléfono queda sin registro hasta el próximo arranque, cuando la app se registra como anónima (con permiso ya concedido, sin pedir nada).
7. **Límite de tasa:** en `apps/web` **no existe** (el comentario de `app/api/cuenta/eliminar/route.ts` lo dice: «nada de rate limiting en este repo», solo un `Set` en memoria contra el doble clic) y no hay `@upstash/*` ni similar. Opción sin dependencia nueva: ver 82-b.

## 82-b — API

### Archivos
| Archivo | Qué |
|---|---|
| `apps/web/lib/push/validacion.ts` (nuevo, puro) | `validarRegistro(body)` y `validarPreferencias(body)`; devuelven `{ ok: true, datos } \| { ok: false }`. Reusa `esTokenExpoValido` de `@/lib/notificaciones/expo-push`. |
| `apps/web/lib/push/limite.ts` (nuevo, puro con reloj inyectado) | Ventana deslizante en memoria: `crearLimitador({ max, ventanaMs, maxClaves })` → `{ permitir(clave, ahora): { ok, reintentarEnS } }`. |
| `apps/web/lib/push/ip.ts` (nuevo, puro) | `ipDeRequest(headers)`: primer valor de `x-forwarded-for` (Vercel lo escribe; si falta, `'desconocida'`). |
| `apps/web/app/api/push/registrar/route.ts` (nuevo) | `POST`. |
| `apps/web/app/api/push/preferencias/route.ts` (nuevo) | `POST`. |
| `apps/web/tests/push/*.test.ts` (nuevos) | Ver «Tests». |

### `POST /api/push/registrar`
Body `{ token, deviceId?, plataforma, idioma? }`. Orden de guardas (como `cuenta/eliminar`): 1) `Content-Type` exacto `application/json` (415); 2) cuerpo ≤ 2 KB (413; leer `request.text()` y medir antes de `JSON.parse`); 3) límite por IP (429 + `Retry-After`); 4) forma y formato (400 genérico `{ error: 'Pedido inválido' }`, sin decir qué campo); 5) límite por `deviceId`; 6) recién acá `createAdminClient()` y `rpc('register_anon_push_token', { p_token, p_device_id, p_platform, p_idioma })`.
- **Sin CORS** (no se agrega `Access-Control-*`; la app nativa no lo necesita y un navegador ajeno no puede llamarlo con preflight). No exige `Origin`.
- **`deviceId` opcional (recomendado, ver duda 3):** si no viene, el servidor genera `crypto.randomUUID()` y lo devuelve. Así la app no necesita una fuente de azar en el teléfono (hoy no hay `expo-crypto` ni polyfill de `crypto.getRandomValues` en `apps/mobile`; agregar `expo-crypto` es una dependencia nativa y requiere OK).
- Respuesta 200: `{ ok: true, deviceId, avisosEquipo, avisosPatrocinados }` (los flags se leen de la fila con el mismo cliente admin, filtrando por token **y** deviceId; solo se devuelven si la RPC dio `true`). Si la RPC da `false` (token de otro dispositivo) → **200 `{ ok: true, registrado: false }`** sin flags ni más datos: no confirma ni niega que el token exista. La app trata `registrado: false` como «no pude registrar» y no reintenta en bucle.
- Errores de la RPC: se loguea solo `error.code` (nunca `message`, nunca el token; el token completo no sale en ningún log). 500 `{ error: 'No se pudo completar' }`.
- Usar `export const dynamic = 'force-dynamic'`. No usa `hasBearerSecret` (es público a propósito); lo documenta el comentario del archivo.

### `POST /api/push/preferencias`
Body `{ token, deviceId, avisosEquipo?, avisosPatrocinados? }` (al menos uno booleano). Mismas guardas 1–4. `rpc('set_push_preferences', …)`. Respuesta **idéntica** (200 `{ ok: true }`) si cambió o si no coincide (token inexistente, otro deviceId, fila con cuenta): no sirve para enumerar. Único 4xx específico: 400 por forma, 415, 413, 429.

### Límite de tasa (sin dependencia nueva)
- Opción recomendada: `limite.ts` en memoria **por instancia** (mismo criterio y misma limitación honesta que el candado de `cuenta/eliminar`: en Vercel hay varias instancias, así que no es una garantía global; frena el abuso casual, no un ataque distribuido).
- Valores propuestos (generosos por las IP compartidas de las operadoras): `registrar` 60/hora por IP y 6/hora por deviceId; `preferencias` 120/hora por IP y 20/hora por deviceId. Mapas con tope de claves (p. ej. 10 000) y barrido de las vencidas para no crecer sin límite.
- Defensas en la base que no dependen de la instancia: formato estricto del token, 3 filas anónimas por `device_id` (poda), `purge_push_tokens_anonimos` para filas viejas, `max` de 200 caracteres.
- Opción B (más fuerte, **más trabajo**, no incluida): tabla de contadores en la base + función `rate_limit_hit(clave, max, ventana)`; solo si Mauro quiere un límite global. Duda 4.

### Tests (Vitest, sin red ni base)
- `validacion`: token válido/ inválido (`ExponentPushToken[x]`, vacío, con espacios, largo > 200, otro prefijo), plataforma, idioma raro, deviceId no uuid, tipos incorrectos (número, null, array), booleanos de preferencias, campos extra ignorados.
- `limite`: permite hasta `max`, bloquea el siguiente, libera al pasar la ventana (reloj inyectado), tope de claves.
- Rutas (mockeando `@/lib/supabase/server`, patrón de los tests de rutas existentes en `apps/web/tests/` [COMPLETAR: copiar el patrón exacto de un test de ruta vigente, p. ej. el de `cuenta/eliminar`]): 415 sin JSON; 413 cuerpo grande; 429; 400 sin tocar el cliente admin (`createAdminClient` no se llama); 200 con RPC `true`; 200 `registrado:false` con RPC `false`; 500 con error de RPC sin que el token aparezca en ningún `console.error` (espiar y comprobar).
- Que `registrar` y `preferencias` no exportan otro método que `POST`.

### Riesgos
- Registro masivo con tokens falsos de formato válido y `device_id` rotando: la base crece. Mitigan el límite por IP, la poda y la purga; queda el riesgo residual de la opción en memoria.
- Reinstalación / borrar datos de la app: Expo suele devolver el mismo token con otro `device_id` → la RPC devuelve `false` y esa instalación no puede cambiar sus interruptores (la fila vieja sigue recibiendo avisos con los valores de antes). Duda 2.

## 82-c — Envíos

### `packages/core/src/notificaciones/` (puro)
- Nuevo `anonimos.ts`:
  - `type FilaTokenAnonimo = { id: string; token: string; avisos_equipo: boolean; avisos_patrocinados: boolean }`
  - `preferenciasDeAnonimo(fila): PreferenciasNotificacion`: `{ ...PREFERENCIAS_POR_DEFECTO, announcements: fila.avisos_equipo, sponsored: fila.avisos_patrocinados, favorite_reminders: false, follow_news: false, radar_channel: 'email' }`. **Falla cerrado:** cualquier campo que no sea `true` estricto cuenta como `false`.
  - `usuarioParaTandaDeAnonimo(fila, enviosRegistrados): UsuarioParaTanda` (con `userId: fila.id`, `tokens: [fila.token]`, `favoritos: []`, `novedades: []`) y lo equivalente para `UsuarioParaAvisoEquipo`.
- Tests en `packages/core/tests/` [COMPLETAR: carpeta real de tests de core]: un anónimo con `avisos_patrocinados=false` no genera patrocinado; con `true` sí y respeta el tope semanal con la clave por id de token; con `avisos_equipo=false` no entra al aviso del equipo; nunca genera favoritos ni novedades; respeta silencio; la `dedupeKey` lleva el id del token y no choca con la de un usuario.

### Cron `apps/web/app/api/cron/notificaciones/route.ts`
1. **Arreglo obligatorio aunque no hubiera anónimos:** la lectura de `push_tokens` hoy trae `user_id` sin filtro; con `user_id` nulo metería la clave `null` en `tokensPorUsuario`. Agregar `.not('user_id', 'is', null)` a esa consulta (y quitar `user_id` del tipo a `string`).
2. Segunda lectura paginada (`leerPaginado`, `order('id')`, mismo tamaño de página): `push_tokens` con `.is('user_id', null)`, `select('id, token, avisos_equipo, avisos_patrocinados')`. Si se trunca, mismo `tokensTruncados`.
3. Envíos previos de anónimos: `notification_sends` con `.in('push_token_id', lote)` (lotes `TAMANIO_LOTE_IN`, paginado como `leerEnLotesYPaginas`; esa función hoy filtra por `user_id`: generalizarla con el nombre de la columna o duplicarla chica).
4. Los anónimos entran a `usuarios` después de los usuarios con cuenta. Favoritos/novedades/preferencias de cuenta se leen **solo** con los `userIds` reales (no mezclar ids de token en esas consultas).
5. Al registrar: para cada mensaje cuyo `userId` pertenezca al `Set` de ids de token anónimo, insertar `{ user_id: null, push_token_id: mensaje.userId, … }`; para los demás, como hoy. Un `Set<string>` `idsAnonimos` alcanza.
6. `userIds.length === 0` (retorno temprano) pasa a considerar también los anónimos: si no hay ni usuarios ni anónimos, recién ahí.
7. Tokens inválidos: el `delete().in('token', invalidos)` ya cubre las filas anónimas (y borra sus `notification_sends` por cascada). Agregar un test que lo fije.
8. `details` de `job_runs`: sumar solo conteos (`anonimos: n`), nunca tokens ni ids.
9. Tests: no hay tests de la ruta que se puedan correr sin base más allá de lo existente [COMPLETAR: ver qué cubre `tests/` del cron hoy]; lo nuevo se prueba en core (puro) y, para el cableado, con el patrón de mock de Supabase que ya use el cron.

### Aviso del equipo `apps/web/lib/admin/avisos-equipo-actions.ts`
- `cargarUsuarios`: mismo `.not('user_id','is',null)` en la lectura actual, más una lectura de anónimos (`select('id, token, avisos_equipo')`, `is('user_id', null)`, paginada) y de sus envíos por `push_token_id` en la ventana de 36 h.
- `destinatariosAvisoEquipo` recibe los anónimos ya convertidos (`preferenciasDeAnonimo`).
- Reserva (`upsert … onConflict: 'dedupe_key', ignoreDuplicates`): para anónimos la fila lleva `user_id: null, push_token_id: id`, y el `select()` del upsert pide `user_id, push_token_id` para armar el `Set` de reservados (id de usuario o de token). `marcar SUCCESS` y `liberarReservas` ya van por `dedupe_key`, no cambian.
- El conteo («personas / teléfonos») pasa a incluir los anónimos: **la confirmación del admin cambia de número** (más gente). Mostrar en el panel cuántos son sin cuenta [COMPLETAR: tocar `/admin/avisos` solo si Mauro lo pide; hoy `ResumenAvisoEquipo` no distingue].
- `yaHuboHoy` es global por `kind = 'anuncio'`: no cambia.
- Tests: core (arriba) + los de `avisos-equipo` existentes [COMPLETAR: confirmar nombre de archivo] extendidos con un anónimo.

### Patrocinados
Ya contemplado en `usuarioParaTandaDeAnonimo` (solo `avisos_patrocinados = true`, tope semanal por clave con id de token). El conteo `destinatarios` de la campaña (`count` de `notification_sends` por `campaign_id`) ya incluye las filas anónimas porque cuenta por `campaign_id`. La medición de bajas a 48 h (`bajas_48h`, R58) mira `notification_preferences`: **no ve a los anónimos** que apagaron patrocinados. [COMPLETAR: revisar `lib/publicidad/bajas.ts` y decidir si se mide también por `push_tokens.avisos_patrocinados`]. Mientras tanto la pausa automática subestima las bajas.
Caso borde: una persona que recibió un patrocinado como anónima y se loguea esa misma semana puede recibir otro (la clave semanal cambia de id de token a `user_id`). Una vez por vínculo; se acepta.

### Radar
Sin cambios (solo usuarios con sesión; las lecturas de Radar no leen `push_tokens` anónimos).

## 82-d — App

### Archivos
| Archivo | Qué |
|---|---|
| `apps/mobile/lib/push/api.ts` (nuevo) | `registrarAnonimo({ token, plataforma, idioma, deviceId? })` y `cambiarPreferenciasAnonimas({ token, deviceId, … })`: `fetch` con el timeout de `lib/red.ts` (`TIMEOUT_RED_MS`, sin `AbortSignal.timeout`), JSON, nunca tira, nunca loguea el token ni `error.message` (mismo criterio de `registro.ts`). |
| `apps/mobile/lib/push/dispositivo.ts` (nuevo) | `leerDeviceId()` / `guardarDeviceId()` en `lib/secure-storage` (clave nueva, p. ej. `push-device-id`, junto a `clave-token.ts`). Si el servidor genera el id, el teléfono solo lo guarda. |
| `apps/mobile/lib/push/registro.ts` | `registrarToken`: con sesión → primero `registrarAnonimo` (asegura `device_id`), después la RPC `register_push_token` (como hoy); sin sesión → solo `registrarAnonimo`. Nueva `desvincularTokenDeEsteTelefono()` (RPC `unlink_push_token` con el token guardado; si falla, **fallback al borrado de hoy** por RLS para que un teléfono compartido no siga recibiendo avisos de la cuenta anterior). `borrarTokenDeEsteTelefono` queda para ese fallback. |
| `apps/mobile/lib/push/index.tsx` | Hoy `estado = !userId ? 'sin-sesion' : estadoSincronizado` y no sincroniza sin `userId`. Pasa a sincronizar también sin sesión (`preguntar: false` al arrancar: solo lee el permiso, y si está concedido renueva el registro → refresca `last_seen_at`); `'sin-sesion'` deja de ser un estado de push [COMPLETAR: revisar quién consume `'sin-sesion'` en `estado.ts` / `invitacion.ts` / tests]. Al cambiar `userId` (login): `registrarAnonimo` → RPC de vínculo → sembrar preferencias (abajo). |
| `apps/mobile/lib/push/invitacion.ts`, `components/InvitacionAvisos.tsx`, `app/bienvenida.tsx` | La pregunta de la R81 («¿Te avisamos?») ya no exige sesión: «Sí» → `activar()` (permiso + `registrarAnonimo`). Sin sesión no se llama a `activarPreferenciasAlAceptar` (necesita `userId`): el alta anónima ya nace con equipo = sí, patrocinados = no. |
| `apps/mobile/lib/notificaciones.ts` | `activarPreferenciasAlAceptar(userId)`: **82-e punto 3**: hoy manda `sponsored: false` siempre (línea del upsert) aunque ya hubiera fila; debe mandar `false` solo si no hay fila (o la lectura falla) y no incluirlo si la fila existe. Nueva `sembrarPreferenciasDeCuenta(userId, flags)`: si la cuenta **no** tiene fila en `notification_preferences`, upsert `announcements = avisosEquipo`, `sponsored = avisosPatrocinados` (los del dispositivo); si tiene fila, no toca nada (mandan las de la cuenta). |
| `apps/mobile/app/(tabs)/cuenta.tsx` | `salir()`: reemplazar `borrarTokenDeEsteTelefono()` por `desvincularTokenDeEsteTelefono()` (sigue antes de `signOut`; sigue sin tirar). En la vista **sin sesión** (hoy tiene el bloque de bienvenida, ~línea 600): sección «Avisos» con dos interruptores. |
| `apps/mobile/components/AvisosSinSesion.tsx` (nuevo) | Dos `Switch`: «Avisos de Qué Pinta Salta» y «Avisos patrocinados» (con una línea que diga que son anuncios pagos). Lee el estado de `registrarAnonimo` (flags) / último valor guardado y llama a `cambiarPreferenciasAnonimas`. Si no hay permiso de notificaciones, los interruptores llevan a pedirlo (reusar `usePush().activar` / `abrirAjustes`). Optimista con vuelta atrás y mensaje si falla. |
| `apps/mobile/lib/cuenta.ts` | La eliminación de cuenta borra hoy la clave del token (`CLAVE_TOKEN_PUSH`) por `removeItem` (72-e) sin tocar el servidor, porque `delete_my_account` ya borró la fila. Se mantiene; **no** borrar el `device_id` guardado (ver duda 6). Después de borrar la cuenta, en el próximo arranque se registra como anónimo. |
| `apps/mobile/lib/push/clave-token.ts` | Agregar `CLAVE_DEVICE_ID`. |

### URL de la API
La app **no tiene hoy** ninguna URL del sitio web configurada (solo `EXPO_PUBLIC_SUPABASE_URL` y otras en `lib/env.ts`; los links usan `https://www.quepintasalta.com.ar`). Propuesta: constante `URL_API = 'https://www.quepintasalta.com.ar'` en `lib/push/api.ts` (no es secreto; un preview no debería usarse desde la app). Alternativa: `EXPO_PUBLIC_API_URL` en `lib/env.ts` + `eas.json`. Duda 5.

### Tests (Vitest de la app, sin red)
- `api.ts`: arma el body, respeta el timeout, devuelve un resultado (no tira) con 200/400/429/500/red caída; el token no aparece en lo que se loguea.
- `registro.ts`: sin sesión llama a la API y NO a la RPC; con sesión llama primero a la API y después a la RPC (orden); `registrado:false` → `error-registro`; `desvincular` usa la RPC y cae al borrado si falla.
- `index.tsx`/estado: sin sesión + permiso concedido registra; sin sesión + sin permiso no pregunta al arrancar.
- `sembrarPreferenciasDeCuenta`: con fila no toca; sin fila siembra; lectura que falla no siembra.
- `activarPreferenciasAlAceptar` (82-e.3): con fila existente NO manda `sponsored`; sin fila manda `false`; lectura fallida manda `false`.
- 82-e.1 (camino «pendiente tras login») y 82-e.2 (la hoja no reaparece si SecureStore no guarda): ver `ops/revisiones/137-claude.md`, puntos 1 y 2; no se leyeron esta noche.
- Tests existentes que fijan lo que cambia y hay que actualizar a propósito: `tests/push-cuenta.test.ts` (verifica por texto que `borrarTokenDeEsteTelefono` se importa de `@/lib/push/registro` y se llama antes de `signOut`), `tests/eliminar-cuenta-token-push-72.test.ts`.

### Riesgos
- Cambia el estado `'sin-sesion'` de push que consumen varios componentes: es el cambio más ancho de la ronda; revisar todos los usos antes.
- `fetch` a un dominio propio desde la app: confirmar que la política de red de Android/iOS lo permite (HTTPS, no hay restricción conocida) y que el APK de prueba cerrada puede llegar a la ruta en producción: la ruta nueva **solo existe en producción después del merge y deploy**; antes de eso la app nueva recibe 404 (tratar como `error-registro`, no como bloqueo).
- Datos personales: el `device_id` y el token son identificadores del dispositivo, no de la persona, pero son datos: ver `privacidad.md`.
