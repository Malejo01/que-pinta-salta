# R82 — Cómo aplicar lo propuesto (de día)

Worktree: `<worktree>`, rama `ronda/82-avisos-sin-sesion`. Todo lo de esta carpeta se escribió de noche **sin poder probarlo**: el SQL no corrió contra ninguna base (ni local), los tipos están hechos a mano y el diseño no se tipó.

## Contenido
| Archivo | Para qué |
|---|---|
| `20261030120000_r82_avisos_sin_sesion.sql` | La migración. A `supabase/migrations/` (versión posterior a `20261019120000`). |
| `r82_avisos_sin_sesion.test.sql` | pgTAP de 58 casos. A `supabase/tests/database/`. |
| `tipos.md` | Delta esperado de `packages/db/src/database.types.ts` (solo para comparar). |
| `diseno-82-bcd.md` | Diseño de 82-b, 82-c y 82-d: archivos, contratos, tests, riesgos y dudas. |
| `privacidad.md` | Texto propuesto para la política de privacidad (va en el PR, no en las páginas legales). |

## Pasos (en este orden)

1. Copiar:
   - `propuesto/20261030120000_r82_avisos_sin_sesion.sql` → `qps-wt/25/supabase/migrations/20261030120000_r82_avisos_sin_sesion.sql`
   - `propuesto/r82_avisos_sin_sesion.test.sql` → `qps-wt/25/supabase/tests/database/r82_avisos_sin_sesion.test.sql`
2. Base local arriba (`npx supabase start`) y aplicar la migración. Comandos exactos (base **local** solamente):
   ```
   npx supabase migration up --workdir <worktree>
   npx supabase test db --workdir <worktree>
   npm --prefix <worktree> run db:types
   ```
   Para probar también desde cero (como el CI): `npx supabase db reset --workdir <worktree>`.
3. Comparar el diff de `packages/db/src/database.types.ts` con `tipos.md`. Si el generador difiere (orden, `Relationships`), manda el generador. Commitear migración + test + tipos juntos (el CI «Migraciones y tipos» falla si los tipos no coinciden).
4. `npm --prefix <worktree> run typecheck` (con los tipos nuevos pueden aparecer errores de `user_id: string | null`; ver el final de `tipos.md`).
5. Recién ahí, implementar 82-b/c/d/e con `diseno-82-bcd.md` como especificación.

**Requiere aplicación en prod por Mauro** (la migración no se aplica sola; PR en borrador, nunca automergear). Es compatible hacia atrás: las columnas nuevas tienen default o aceptan NULL, la app vigente (`register_push_token`) sigue andando, y el cron de hoy sigue funcionando **salvo** que aparezca una fila anónima antes de desplegar el cambio de 82-c (el cron viejo leería `user_id` nulo). Como la API que crea filas anónimas llega en el mismo deploy, aplicar la migración **junto con** el merge de la ronda.

## Lo que puede fallar al probar (probable, no verificado)
- `col_is_null` / `has_column` con esquema explícito: firma `(schema, tabla, columna, descripción)`; si la versión de pgTAP exige otra, ajustar.
- Test 15: `proconfig = array['search_path=""']` copia el idioma de `qps_190_delete_my_account.test.sql`.
- Tests 18–38 llaman funciones de `service_role` como `postgres`; si el rol de la sesión de test no puede, envolver con `set local role service_role`.
- El test de `qps_190` (caso 4) lista las FK a `auth.users`/`profiles`: la nueva FK va a `push_tokens`, así que **no** debería cambiar. Verificar igual.
- `rls_lint.test.sql`: no se agregan policies, no debería cambiar.
- Confirmar que `notification_preferences.sponsored` existe con ese nombre (la migración lo usa en `unlink_push_token`; el código web lo lee, la migración de la etapa 2 / D2 lo agregó).

## Dudas para Mauro
1. **Quién manda en una fila con cuenta.** El plan dice «aviso del equipo a todas las filas con `avisos_equipo = true`, con y sin usuario». Se propone que para filas con cuenta siga mandando `notification_preferences.announcements` (lo que la persona ya eligió) y que `push_tokens.avisos_*` valga solo para filas anónimas. Si preferís lo del plan al pie de la letra, hay que sincronizar las dos fuentes (más código y casos borde).
2. **Reinstalar / borrar datos de la app:** el token suele repetirse con otro `device_id`; con la regla estricta (token + deviceId deben coincidir) esa instalación no puede cambiar sus interruptores. Alternativa laxa: quitar el `where` del `DO UPDATE` de `register_anon_push_token` (último que registra gana); más cómodo, más débil si alguien conoce un token.
3. **Origen del `device_id`:** la app no tiene hoy fuente de azar (no hay `expo-crypto`). Recomiendo que lo genere el servidor y lo devuelva en `registrar` (sin dependencia). Si preferís que lo genere el teléfono, hace falta `expo-crypto` (dependencia nativa, requiere tu OK y un build nuevo).
4. **Límite de tasa:** no existe nada en el repo. Propuse uno en memoria por instancia (sin dependencia, con la limitación conocida). ¿Alcanza para empezar o querés el contador en base (Opción B)?
5. **URL de la API en la app:** la app no tiene URL del sitio configurada. Propongo constante `https://www.quepintasalta.com.ar` en el código. ¿O mejor `EXPO_PUBLIC_API_URL`?
6. **Al borrar la cuenta**, la app conserva su `device_id` (identifica la instalación, no a la persona) y se re-registra como anónima en el próximo arranque, así que el teléfono puede seguir recibiendo avisos del equipo sin cuenta. Si querés que eliminar la cuenta también corte los avisos, hay que apagarlos explícitamente (hoy no lo hace).
7. **Al cerrar sesión**, la fila anónima copia `announcements`/`sponsored` de la cuenta. Un `sponsored` que quedó en `true` por el default de la base se copia tal cual. Si preferís que los patrocinados vuelvan siempre a `false` al cerrar sesión, es un cambio de una línea en `unlink_push_token`.
8. **Limpieza de anónimos:** `purge_push_tokens_anonimos` (180 días, mínimo 30) existe pero nadie la llama todavía. ¿La engancho a la limpieza de `notification_sends` (QPS-238 / job_runs)?
9. **Bajas de patrocinados de anónimos:** la medición de `bajas_48h` no los ve (ver `diseno-82-bcd.md`, Patrocinados).
10. **Texto de privacidad:** `privacidad.md` tiene varios `[COMPLETAR]` (plazos, terceros, contacto, formulario de Play); no se leyeron las páginas legales.
