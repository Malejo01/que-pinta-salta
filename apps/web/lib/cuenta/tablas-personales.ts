/**
 * Listas de tablas y columnas que toca el borrado de una cuenta de usuario
 * (`POST /api/cuenta/eliminar`, ver tarea 37-b).
 *
 * El esquema completo está en `supabase/migrations/`. Acá solo se declara,
 * para cada tabla pública con alguna columna "de usuario", qué le pasa a esa
 * fila cuando se borra la cuenta:
 *
 * - `TABLAS_A_BORRAR`: se borra la fila entera (`DELETE ... WHERE columna = userId`,
 *   o `WHERE id = userId` para `profiles`).
 * - `COLUMNAS_A_DESVINCULAR`: la columna pasa a `null` y la fila se queda,
 *   sin autor (contenido público: eventos, alias, etc.).
 *
 * El test `tests/cuenta/tablas-personales.test.ts` parsea
 * `packages/db/src/database.types.ts` y exige que toda columna de usuario que
 * encuentra esté en exactamente una de las dos listas de abajo. Si agregás
 * una tabla o columna nueva (p. ej. `algo.submitted_by`), el test se pone en
 * rojo hasta que la sumes aquí.
 *
 * ## Por qué `duplicate_dismissals` se borra y no se desvincula
 *
 * `duplicate_dismissals.decided_by` es `NOT NULL` y su FK
 * (`duplicate_dismissals_decided_by_fkey`, hacia `public.profiles(id)`) no
 * tiene cláusula `on delete`, o sea que es `NO ACTION`
 * (`supabase/migrations/20261011120000_merge_events.sql:278`). No se puede
 * poner esa columna en `null` porque violaría el `NOT NULL`, y si quedara una
 * fila apuntando al usuario, el cascade de `auth.admin.deleteUser()` sobre
 * `profiles` fallaría por violación de FK y el borrado de cuenta se caería
 * entero. Por eso esta tabla va en `TABLAS_A_BORRAR`: se pierde la decisión
 * "este par no es duplicado", así que ese par de eventos puede volver a
 * aparecer como candidato en `/admin/revision`. Solo un admin puede insertar
 * en esta tabla (RLS), así que para una cuenta de usuario común hay siempre 0
 * filas; el caso real es cuando se borra una cuenta admin.
 *
 * Queda anotado para Mauro (lo decide el lead, no esta tarea): una migración
 * que haga `decided_by` nullable y la FK `on delete set null` evitaría borrar
 * la fila. No se escribe esa migración acá.
 *
 * ## `scrape_runs.triggered_by`: columna de usuario que el plan original no listaba
 *
 * Además de `duplicate_dismissals` (que sí estaba marcado como hallazgo del
 * lead), al parsear el esquema aparece `scrape_runs.triggered_by`
 * (`uuid` nullable, FK `scrape_runs_triggered_by_fkey` hacia `auth.users(id)
 * ON DELETE SET NULL`, `supabase/migrations/20261002160000_baseline.sql:377,784`).
 * Es una columna `*_by` que identifica quién disparó una corrida de scraping
 * manualmente. Como la FK ya es `ON DELETE SET NULL` contra `auth.users`, la
 * base la deja en `null` sola en cuanto `deleteUser()` borra la fila de
 * `auth.users` — no hace falta que el código la toque antes. Se lista en
 * `COLUMNAS_A_DESVINCULAR` igual, para que quede documentada (mismo criterio
 * que `venue_aliases.created_by` y `venue_review_queue.reviewed_by`, que
 * también desvincula el motor de la base y no el código de esta tarea).
 *
 * ## Orden de las tres operaciones
 *
 * 1. **Desvincular** (`COLUMNAS_A_DESVINCULAR`): hace falta hacerlo a mano
 *    para `events.created_by` y `aliases.created_by`, porque esas dos FKs
 *    apuntan a `public.profiles(id)` sin `on delete` (`NO ACTION`): si no se
 *    ponen en `null` antes, el borrado de la fila de `profiles` (paso 2 o el
 *    cascade del paso 3) falla. Las otras tres de esta lista
 *    (`venue_aliases.created_by`, `venue_review_queue.reviewed_by`,
 *    `scrape_runs.triggered_by`) apuntan a `auth.users(id) ON DELETE SET
 *    NULL`: la base las deja en `null` sola en el paso 3, pero se incluyen
 *    acá igual porque también son "contenido que queda sin autor".
 * 2. **Borrar** (`TABLAS_A_BORRAR`): el orden *dentro* de este array también
 *    es carga útil, no decoración. Se borran primero las filas que son del
 *    usuario (favoritos, tokens, preferencias, etc.), después
 *    `duplicate_dismissals` (por lo explicado arriba) y **`profiles` va
 *    último**: cualquier fila que la referencie con una FK `NO ACTION` (hoy
 *    `duplicate_dismissals.decided_by`) tiene que estar borrada antes, o el
 *    `DELETE FROM profiles` falla por violación de FK. Si se agrega una
 *    tabla nueva con una FK `NO ACTION` hacia `profiles(id)`, va antes que
 *    `profiles` en este array.
 * 3. **`auth.admin.deleteUser()`**: borra la fila de `auth.users`. Por
 *    `profiles.id → auth.users(id) ON DELETE CASCADE`
 *    (baseline:774), arrastra `profiles` si no se borró ya en el paso 2, y
 *    dispara los `ON DELETE SET NULL` del resto de FKs hacia `auth.users`.
 *
 * `ORDEN_BORRADO_DE_CUENTA` deja ese orden en un array para que el test lo
 * pueda comprobar sin inventar una aserción que no mida nada.
 */

import type { Database } from "@qps/db"

/** Nombre de una tabla del esquema `public` (no incluye vistas). */
type TablaPublica = keyof Database["public"]["Tables"]

/** Columnas de la fila (`Row`) de una tabla pública dada. */
type ColumnaDeTabla<T extends TablaPublica> = keyof Database["public"]["Tables"][T]["Row"] & string

/**
 * Una entrada `{ tabla, columna }` tipada: si `tabla` no existe en
 * `Database['public']['Tables']` o `columna` no es una columna de esa tabla,
 * no compila. Así una tabla o columna mal escrita (o renombrada en una
 * migración futura) revienta en `npm run typecheck`, no en producción.
 */
type EntradaTablaPersonal<T extends TablaPublica = TablaPublica> = {
  [K in T]: {
    tabla: K
    columna: ColumnaDeTabla<K>
    /** Por qué esta fila/columna se maneja así; obligatorio para que quede documentado. */
    comentario: string
  }
}[T]

/**
 * Tablas donde se borra la fila entera del usuario cuando se borra la
 * cuenta. Ver el comentario del módulo para el porqué de cada una y, en
 * particular, por qué `duplicate_dismissals` está acá y no en
 * `COLUMNAS_A_DESVINCULAR`.
 */
export const TABLAS_A_BORRAR: readonly EntradaTablaPersonal[] = [
  {
    tabla: "favorites",
    columna: "user_id",
    comentario: "Favoritos del usuario (FK a profiles, ya tiene ON DELETE CASCADE en la base).",
  },
  {
    tabla: "user_favorites",
    columna: "user_id",
    comentario: "Favoritos del usuario, tabla nueva (FK a auth.users, ya tiene ON DELETE CASCADE).",
  },
  {
    tabla: "event_attendance",
    columna: "user_id",
    comentario: "\"Voy\" / \"Me interesa\" del usuario (FK a auth.users, ON DELETE CASCADE).",
  },
  {
    tabla: "push_tokens",
    columna: "user_id",
    comentario: "Tokens de notificaciones push del usuario (user_id es la PK).",
  },
  {
    tabla: "notification_preferences",
    columna: "user_id",
    comentario: "Preferencias de notificaciones del usuario (user_id es la PK).",
  },
  {
    tabla: "notification_sends",
    columna: "user_id",
    comentario: "Historial de envíos de notificaciones al usuario (FK a auth.users, ON DELETE CASCADE).",
  },
  {
    tabla: "user_radar_settings",
    columna: "user_id",
    comentario: "Configuración del Radar del usuario (FK a auth.users, ON DELETE CASCADE).",
  },
  {
    tabla: "user_followed_categories",
    columna: "user_id",
    comentario: "Categorías que sigue el usuario en el Radar (FK a auth.users, ON DELETE CASCADE).",
  },
  {
    tabla: "user_followed_venues",
    columna: "user_id",
    comentario: "Venues que sigue el usuario en el Radar (FK a auth.users, ON DELETE CASCADE).",
  },
  {
    tabla: "user_followed_instagram_accounts",
    columna: "user_id",
    comentario: "Cuentas de Instagram que sigue el usuario en el Radar (FK a auth.users, ON DELETE CASCADE).",
  },
  {
    tabla: "duplicate_dismissals",
    columna: "decided_by",
    comentario:
      "decided_by es NOT NULL y su FK a profiles es NO ACTION (sin on delete): no se puede poner en null " +
      "sin violar el NOT NULL, y dejar la fila rompe el borrado de cuenta completo por violación de FK al " +
      "borrar profiles. Se borra la fila; se pierde la decisión 'este par no es duplicado' y el par puede " +
      "volver a aparecer como candidato en /admin/revision. Solo pasa con cuentas admin (es la única RLS " +
      "que puede insertar acá). Tiene que ir ANTES que profiles en este array (ver el comentario de la " +
      "entrada de profiles y el del módulo): si profiles se borra primero, esta fila todavía existe y " +
      "sigue apuntando al perfil con una FK NO ACTION, así que el DELETE de profiles falla.",
  },
  {
    tabla: "profiles",
    columna: "id",
    comentario:
      "Perfil del usuario. Tiene que ser la ÚLTIMA entrada de este array: es un invariante del orden, no " +
      "una preferencia. Cualquier fila que todavía referencie profiles(id) con una FK NO ACTION (hoy " +
      "duplicate_dismissals.decided_by) tiene que estar borrada antes, o el DELETE FROM profiles falla por " +
      "violación de FK y el borrado de cuenta se cae a mitad de camino. Si se agrega una tabla nueva que " +
      "referencie profiles(id) sin 'on delete' (NO ACTION), esa tabla va ANTES que profiles acá, nunca " +
      "después. (En la práctica, si esta entrada no se ejecutara, profiles también la arrastraría el " +
      "cascade de auth.users al correr deleteUser() -- profiles.id -> auth.users(id) ON DELETE CASCADE --, " +
      "pero se lista acá para que el orden del array sea explícito y el test lo pueda comprobar.)",
  },
]

/**
 * Columnas que pasan a `null` cuando se borra la cuenta, para que el
 * contenido público (eventos, alias de venues, etc.) quede sin autor en vez
 * de desaparecer. Ver el comentario del módulo: las dos primeras hay que
 * desvincularlas a mano antes de borrar `profiles`; las otras tres ya las
 * deja en `null` la base (`ON DELETE SET NULL` hacia `auth.users`) cuando
 * corre `deleteUser()`, y se listan igual para que queden documentadas.
 */
export const COLUMNAS_A_DESVINCULAR: readonly EntradaTablaPersonal[] = [
  {
    tabla: "events",
    columna: "created_by",
    comentario:
      "FK a public.profiles(id) sin on delete (NO ACTION), nullable. Hay que ponerla en null a mano " +
      "antes de borrar profiles; si no, el borrado de profiles falla por esta FK. El plan original decía " +
      "que esta columna referencia auth.users: es falso, referencia profiles.",
  },
  {
    tabla: "aliases",
    columna: "created_by",
    comentario:
      "FK a public.profiles(id) sin on delete (NO ACTION), nullable. Mismo caso que events.created_by: " +
      "hay que ponerla en null a mano antes de borrar profiles. El plan original también se equivoca acá " +
      "diciendo que referencia auth.users.",
  },
  {
    tabla: "venue_aliases",
    columna: "created_by",
    comentario:
      "FK a auth.users(id) ON DELETE SET NULL. La base la deja en null sola cuando corre deleteUser(); " +
      "no hace falta tocarla a mano, se documenta acá igual.",
  },
  {
    tabla: "venue_review_queue",
    columna: "reviewed_by",
    comentario:
      "FK a auth.users(id) ON DELETE SET NULL. La base la deja en null sola cuando corre deleteUser(); " +
      "no hace falta tocarla a mano, se documenta acá igual.",
  },
  {
    tabla: "scrape_runs",
    columna: "triggered_by",
    comentario:
      "Hallazgo de esta tarea: el plan original no la listaba. FK scrape_runs_triggered_by_fkey hacia " +
      "auth.users(id) ON DELETE SET NULL, nullable (quién disparó una corrida de scraping a mano). La base " +
      "la deja en null sola cuando corre deleteUser(); se documenta acá igual, mismo criterio que " +
      "venue_aliases.created_by y venue_review_queue.reviewed_by.",
  },
]

/**
 * Pasos del borrado de cuenta, en orden. No es un detalle de implementación:
 * si se invierten los dos primeros, el borrado de `profiles` falla por las
 * FKs `NO ACTION` de `events.created_by` / `aliases.created_by` (ver el
 * comentario del módulo).
 */
export const ORDEN_BORRADO_DE_CUENTA = [
  "desvincular_contenido_publico",
  "borrar_filas_personales",
  "eliminar_usuario_de_auth",
] as const

export type PasoBorradoDeCuenta = (typeof ORDEN_BORRADO_DE_CUENTA)[number]
