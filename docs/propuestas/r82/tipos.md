# Delta esperado de `packages/db/src/database.types.ts`

Escrito a mano a partir de `20261030120000_r82_avisos_sin_sesion.sql`. **No pegar**: la fuente de verdad es lo que genere `npm --prefix <worktree> run db:types` después de `migration up`. Esto sirve para comparar (el CI compara el archivo generado con el commiteado). Las columnas salen en orden alfabético, como en el resto del archivo.

## `push_tokens` (hoy en la línea ~395)

```ts
"push_tokens": {
  Row: {
    "avisos_equipo": boolean,"avisos_patrocinados": boolean,"created_at": string,"device_id": string | null,"id": string,"idioma": string | null,"last_seen_at": string,"platform": string,"token": string,"user_id": string | null
  }
  Insert: {
    "avisos_equipo"?: boolean,"avisos_patrocinados"?: boolean,"created_at"?: string,"device_id"?: string | null,"id"?: string,"idioma"?: string | null,"last_seen_at"?: string,"platform": string,"token": string,"user_id"?: string | null
  }
  Update: {
    "avisos_equipo"?: boolean,"avisos_patrocinados"?: boolean,"created_at"?: string,"device_id"?: string | null,"id"?: string,"idioma"?: string | null,"last_seen_at"?: string,"platform"?: string,"token"?: string,"user_id"?: string | null
  }
  Relationships: [
    
  ]
}
```

Cambios: `user_id` pasa a `string | null` (y a opcional en `Insert`); 4 columnas nuevas. Hoy la tabla no declara `Relationships` (la FK a `auth.users` no sale porque el esquema `auth` no se genera): debería seguir igual.

## `notification_sends` (hoy en la línea ~357)

```ts
"notification_sends": {
  Row: {
    "campaign_id": string | null,"channel": string,"dedupe_key": string,"event_id": string | null,"id": string,"kind": string,"push_token_id": string | null,"sent_at": string,"status": string,"user_id": string | null
  }
  Insert: {
    "campaign_id"?: string | null,"channel": string,"dedupe_key": string,"event_id"?: string | null,"id"?: string,"kind": string,"push_token_id"?: string | null,"sent_at"?: string,"status": string,"user_id"?: string | null
  }
  Update: {
    "campaign_id"?: string | null,"channel"?: string,"dedupe_key"?: string,"event_id"?: string | null,"id"?: string,"kind"?: string,"push_token_id"?: string | null,"sent_at"?: string,"status"?: string,"user_id"?: string | null
  }
  Relationships: [
    { foreignKeyName: "notification_sends_campaign_id_fkey" ... },   // sin cambios
    { foreignKeyName: "notification_sends_event_id_fkey" ... },      // sin cambios
    {
      foreignKeyName: "notification_sends_push_token_id_fkey"
      columns: ["push_token_id"]
      isOneToOne: false
      referencedRelation: "push_tokens"
      referencedColumns: ["id"]
    }
  ]
}
```

El orden de las `Relationships` lo decide el generador (alfabético por nombre de constraint: `campaign_id`, `event_id`, `push_token_id`).

## `Functions` (hoy desde la línea ~723)

Se suman cuatro entradas, en este orden alfabético dentro del objeto (el generador las ordena por nombre):

```ts
"purge_push_tokens_anonimos":
{ Args: { "p_days"?: number }; Returns: number
                           },
```
(entre `purge_notification_sends` y `record_event_metric`)

```ts
"register_anon_push_token":
{ Args: { "p_device_id": string,"p_idioma"?: string,"p_platform": string,"p_token": string }; Returns: boolean
                           },
```
(entre `record_event_metric` y `register_push_token`)

```ts
"set_push_preferences":
{ Args: { "p_avisos_equipo"?: boolean,"p_avisos_patrocinados"?: boolean,"p_device_id": string,"p_token": string }; Returns: boolean
                           },
```
(entre `resolve_venue_id` y `unmerge_event`)

```ts
"unlink_push_token":
{ Args: { "p_token": string }; Returns: boolean
                           },
```
(entre `set_push_preferences` y `unmerge_event`)

`register_push_token` no cambia: `{ Args: { "p_platform": string,"p_token": string }; Returns: undefined }`.

## Qué rompe en el typecheck cuando se aplican los tipos

- Todo código que lea `push_tokens.user_id` o `notification_sends.user_id` como `string` ahora recibe `string | null`. Hoy los toca el cron de notificaciones (`apps/web/app/api/cron/notificaciones/route.ts`, con tipos a mano, no los generados) y `avisos-equipo-actions.ts` (también a mano, con `as`): probablemente no falla nada, pero **buscar** `push_tokens` y `notification_sends` en `apps/web` y `apps/mobile` después de regenerar.
- `apps/mobile/lib/push/registro.ts` hace `supabase.from('push_tokens').delete().eq('token', …)`: sigue tipando igual.
