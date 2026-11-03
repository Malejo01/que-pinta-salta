# Seguridad de los datos (Play Console): qué junta la app

Verificado contra el código de `ronda/integracion-q4` (build 7) el 3/11/2026. Cada fila dice **de dónde sale** en el código, para poder revisarla.

> **⚠ No leí la ficha actual de «Seguridad de los datos»** (está en Play Console, fuera del repo). La columna «¿Cambia?» marca lo que **seguro** es nuevo o distinto en el build 7. El resto hay que compararlo a mano contra lo declarado.

## Resumen para el formulario

| ¿Recopila datos? | Sí |
|---|---|
| ¿Comparte datos con terceros? | Sí: **solo el identificador de publicidad con Google (AdMob)**, para anuncios, después del consentimiento (UMP). El resto no se comparte. |
| ¿Cifrado en tránsito? | Sí (HTTPS a Supabase, a la API del sitio, a Expo y a Sentry). |
| ¿Se pueden borrar? | Sí: dentro de la app (Cuenta → Eliminar cuenta) y en `https://www.quepintasalta.com.ar/eliminar-cuenta`. |

## Detalle por tipo de dato

| Dato (categoría de Play) | Qué es | Para qué | ¿Obligatorio? | ¿Se comparte? | ¿Se borra? | En el código | ¿Cambia en el build 7? |
|---|---|---|---|---|---|---|---|
| **Información personal → Dirección de email** | El email de la cuenta (email y contraseña, o Google). | Cuenta, ingreso, Radar por email. | Opcional (la app se usa sin cuenta). | No. | Sí: `delete_my_account` borra `auth.users`, `profiles` y todo lo de la persona. | `lib/session`, `app/(tabs)/cuenta.tsx`, `supabase/migrations/…qps_190_delete_my_account.sql` | No |
| **Información personal → Nombre** | Con Google, el nombre del perfil de Google puede quedar en la cuenta de Supabase (`user_metadata`). | Cuenta. | Opcional. | No. | Sí (con la cuenta). | Supabase Auth (`signInWithIdToken`) | No (verificar si estaba declarado) |
| **Información personal → ID de usuario** | El id de la cuenta (uuid de Supabase). | Funcionalidad: favoritos, Voy, seguir, preferencias de avisos. | Opcional. | No. | Sí. | `user_favorites`, `event_attendance`, `user_followed_*`, `notification_preferences`, `user_radar_settings` | No |
| **Actividad en la app → Otras acciones del usuario** | Eventos guardados, «Voy», lo que se sigue (lugares, categorías, cuentas de Instagram), preferencias de avisos y del Radar. | Funcionalidad y personalización (avisos, Radar). | Opcional, con cuenta. | No. | Sí (con la cuenta). | ídem | No |
| **Actividad en la app → Historial de búsqueda en la app** | Las últimas búsquedas de Buscar. | Mostrar «búsquedas recientes». | — | No. | **Solo en el teléfono** (AsyncStorage, `qps:busquedas:v1:recientes`): no se manda a ningún servidor. Q4-12 las borra también al eliminar la cuenta. | `apps/mobile/lib/busquedas-recientes.ts` | No se recopila (no sale del teléfono). Verificar que no figure como «recopilado». |
| **ID de dispositivo u otros → Token de notificaciones** | El token de Expo/FCM del teléfono. | Funcionalidad: mandar los avisos que la persona eligió. | Opcional (solo si activa los avisos). | Se entrega a Expo/Google (FCM) como **proveedores de servicio**, no como «compartir» en el sentido de Play. | Sí: se borra con la cuenta, cuando el token deja de valer, o a los 180 días sin uso si no hay cuenta. | `push_tokens`, `apps/mobile/lib/push/*` | **Sí: ahora también SIN cuenta** (R82, #146) |
| **ID de dispositivo u otros → device_id de la instalación** | Un uuid aleatorio que genera el servidor y la app guarda en el almacenamiento seguro. No es el ID de publicidad. | Seguridad: que solo ese teléfono pueda cambiar sus interruptores de avisos sin cuenta. | Opcional (con los avisos). | No. | Sí: con la fila del token (180 días sin uso). | `push_tokens.device_id`, `apps/mobile/lib/push/dispositivo.ts` | **Sí: nuevo** (#146) |
| **ID de dispositivo u otros → ID de publicidad** | El Advertising ID de Android (permiso `AD_ID`). | Publicidad (AdMob), solo después del consentimiento UMP. | — | **Sí: con Google (AdMob).** | Lo controla la persona desde los ajustes de Android. | `react-native-google-mobile-ads`, `apps/mobile/lib/anuncios/consentimiento.ts` | No (verificar que esté declarado) |
| **Ubicación aproximada** | — | — | — | — | — | `apps/mobile/lib/ubicacion.ts` (nadie la usa todavía) | **Sí:** el build 7 bloquea la precisa (`docs/play/ubicacion.md`). La aproximada **no sale del teléfono**: «no recopilada». |
| **Ubicación precisa** | — | — | — | — | — | Bloqueada en `app.config.ts` | **Sí: ya no se pide** (antes el manifiesto la tenía por las librerías) |
| **Información y rendimiento de la app → Registros de fallas / Diagnóstico** | Errores y fallas (Sentry): stack, modelo y versión de Android, versión de la app, un id de instalación de Sentry. **Sin email, IP ni nombre**: `sendDefaultPii: false` y `beforeSend` borra emails, tokens y JWT. | Diagnóstico de errores. | — | Sentry como proveedor de servicio. | Retención de Sentry `[COMPLETAR: plazo de la cuenta de Sentry]`. | `apps/mobile/lib/sentry.ts` | Q4-4 cambia qué errores de Google se mandan (menos eventos, sin datos personales). |
| **Actividad en la app → Interacciones** (métricas) | Cuántas veces se abre una ficha y cuántos clics a «Comprar», **por evento, sin ningún identificador** (ni usuario, ni dispositivo, ni IP en la base). | Estadísticas del sitio y reportes a anunciantes. | — | No (a los anunciantes van totales). | No hay dato personal que borrar. | `apps/mobile/lib/metricas.ts`, `docs/METRICAS.md` | No. Probablemente **no** cuenta como dato personal: confirmar cómo está declarado. |
| **Calendario** | La app **escribe** un evento en el calendario cuando la persona toca «Agregar al calendario». No lee el calendario. | Funcionalidad. | Opcional. | No. | Lo borra la persona desde su calendario. | `expo-calendar` (`writeOnlyCalendarPermission`) | No. **No es un dato recopilado** (no sale del teléfono). |

## Diferencias a revisar contra la ficha actual

1. **Avisos sin cuenta (nuevo en el build 7):** el token de notificaciones y el `device_id` se guardan también **sin cuenta**. Si la ficha decía que esos datos se asociaban a la cuenta o que solo se pedían con sesión, hay que actualizarla.
2. **Ubicación:** el build 6 tenía `ACCESS_FINE_LOCATION` en el manifiesto (lo agregaban `expo-location` y MapLibre, aunque nada lo usaba). Si la ficha declaraba «ubicación precisa», ahora se puede sacar. El build 7 solo tiene la aproximada, que no se recopila.
3. **ID de publicidad compartido con Google (AdMob):** verificar que esté declarado como **compartido**, para publicidad.
4. **Búsquedas recientes:** quedan solo en el teléfono. Si figuraban como recopiladas, se puede corregir.
5. **Nombre de Google:** verificar si está declarado (puede quedar en `user_metadata` de Supabase al entrar con Google).

## Lo que la app NO hace
- No lee contactos, fotos, archivos, micrófono ni cámara.
- No usa la ubicación en segundo plano.
- No vende datos.
- No manda a los anunciantes ningún identificador de la persona: los avisos patrocinados los manda Qué Pinta Salta y al anunciante le llegan solo totales.

## Q5-13 · Aperturas de la app (desde el build que lo trae)
| Tipo de dato | ¿Se recopila? | ¿Vinculado a la identidad? | ¿Se comparte? | Propósito | ¿Opcional? |
|---|---|---|---|---|---|
| Actividad en la app → Interacciones con la app | Sí: «la app se abrió hoy», con hashes diarios y semanales de un id aleatorio que no se guarda | **No** | No | Estadísticas | No (es anónimo y no identifica). *Alternativa:* un interruptor en Cuenta |

Detalle en `docs/METRICAS.md` («Uso de la app y panel /admin/uso»).

**Q6-7 (revisión de la Q5):** el id de métricas es un identificador aleatorio de la instalación que **sale del teléfono** (el servidor lo recibe y guarda solo sus hashes del día y de la semana). Lo conservador es declararlo también en la categoría que ya está marcada:

| Tipo de dato | ¿Se recopila? | ¿Vinculado a la identidad? | ¿Se comparte? | Propósito | ¿Opcional? |
|---|---|---|---|---|---|
| ID de dispositivo u otros → id de métricas de la instalación (`qps.metricas.id`) | Sí (se guarda solo su hash diario y semanal) | **No** | No | Estadísticas | No |

En la ficha alcanza con sumar «Estadísticas» como propósito de «ID de dispositivo u otros» (la categoría ya está por el token de avisos, el `device_id` y el ID de publicidad).
