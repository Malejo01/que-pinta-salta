# Propuesta: lugares para chicos en el mapa

| | |
|---|---|
| **Estado** | Propuesta. No hay código ni migración: el SQL de abajo es un borrador para que el equipo local escriba la migración real |
| **Fecha** | 2026-10-27 |
| **Rama** | `nube/q3-lugares-para-chicos` (solo este documento) |
| **Pedido** | Testers de la beta: "ver qué hay para llevar a los chicos cerca de casa" |
| **Encaja con** | El chip «Para chicos» de eventos (`packages/core/src/filtros/publico.ts`, `esParaChicos`, rama `nube/q3-mapa-filtros`) y el mapa con pin arrastrable de `/admin/lugares` que suma la R65 (PR #98) |
| **Decide** | Mauro (preguntas abiertas en el §6.4) |

**En una línea.** Peloteros, salones de juegos, plazas con juegos y espacios culturales infantiles entran como **lugares permanentes**: una tabla nueva `lugares_permanentes` colgada 1 a 1 de `venues`, cargada a mano y verificada por un admin, y una **capa aparte** en `/mapa` («Lugares para chicos») que se prende sola con el chip «Para chicos». "Cerca de casa" se resuelve en el navegador, sin que la posición salga del dispositivo.

---

## 1. Problema y alcance

Hoy `/mapa` dibuja un pin por lugar **con eventos** en la fecha elegida (`armarPinesDelMapa` en `packages/core/src/mapa/pines.ts`). Un pelotero, una plaza con juegos o una ludoteca no tienen "eventos": están abiertos todos los días con un horario. Para el mapa no existen. Y el chip «Para chicos» que suma la otra rama filtra **eventos** (categoría `infantil` o tags `infantil`, `apto-chicos`, `ninos`, `chicos`, `familia`): un martes a la tarde sin funciones infantiles, el mapa con «Para chicos» prendido sale vacío aunque haya tres plazas con juegos a cinco cuadras.

Lo que piden los testers no es una agenda: es **dónde puedo ir con los chicos, cerca, ahora o este finde**.

### Qué entra

| Tipo (`tipo`) | Ejemplos | Por qué entra |
|---|---|---|
| `pelotero` | Peloteros, inflables, salas de juego blando | Abren al público con horario fijo |
| `salon_juegos` | Salones de juegos y de cumpleaños infantiles que **abren al público** (no solo con reserva cerrada) | Es la consulta más repetida de la beta |
| `plaza_juegos` | Plazas y parques con juegos infantiles | Gratis, abiertas, son lo primero que alguien busca "cerca de casa" |
| `espacio_cultural_infantil` | Ludotecas, bibliotecas infantiles, museos con propuesta infantil permanente | Es una agenda **cultural**: es lo más alineado con el producto |

Criterio para que un lugar entre: es un espacio físico con dirección pública, abierto a cualquiera (pagando o no), con propuesta pensada para chicos, en Salta Capital (ver la pregunta abierta sobre el Gran Salta).

### Qué no entra

- **Comercios en general**: jugueterías, casas de ropa infantil, locales de comida "con pelotero" donde el juego es accesorio, kioscos. No es un directorio comercial.
- **Reseñas, puntajes, fotos o comentarios de usuarios.** No hay contenido de usuarios: todo lo carga y lo firma un admin.
- **Servicios a domicilio** (animadores, alquiler de inflables, catering): no tienen lugar al que ir.
- **Emprendimientos que funcionan en una casa particular** y no publican esa dirección como comercial (ver §5).
- **Escuelas, jardines y guarderías**: no son un plan de fin de semana y tienen otras reglas.
- **Eventos.** Una función de títeres sigue siendo un evento en `events`, con su categoría `infantil`, y la sigue encontrando el chip «Para chicos». Esta propuesta no toca la ingesta.

---

## 2. Modelo de datos

### 2.1 ¿Extender `venues` o tabla aparte?

| Opción | A favor | En contra |
|---|---|---|
| **A.** Columnas nuevas en `venues` | Una sola tabla | `venues` es de la ingesta: la crea `upsertVenue`, la fusiona el plan de canónicos (`canonical_venue_id`, `venue_review_queue`) y tiene lectura pública de **todas** sus filas. Sumarle ~20 columnas que solo usan 50 filas de ~1000, más un estado de publicación propio, mezcla dos ciclos de vida |
| **B.** Tabla aparte, sin relación con `venues` | Independiente de la ingesta | Un museo o una biblioteca que también tiene eventos quedaría dos veces, con dos direcciones y dos pines que se desincronizan |
| **C. `venues` + `lugares_permanentes` (1 a 1)** | La ubicación vive en un solo lugar (`venues.latitude/longitude`, que ya corrige el admin con la R65). Un lugar puede tener eventos **y** ser permanente. El estado, la verificación y los datos para chicos quedan en una tabla chica con su propia RLS | Una relación más que cuidar cuando se fusionan venues |

**Decisión: C.** `lugares_permanentes.venue_id` es único y apunta a un venue **canónico** (`canonical_venue_id is null`). El venue pone nombre, dirección y coordenadas; la tabla nueva pone todo lo demás. Una plaza que nunca tuvo eventos se crea como venue desde el admin (§3.1), igual que la ingesta crea los suyos.

El nombre de la tabla es genérico a propósito (`lugares_permanentes`, no `lugares_chicos`): si mañana entran bibliotecas o ferias permanentes para todo público, se suma un `tipo` y no una tabla.

### 2.2 Campos

| Campo | Tipo | Para qué |
|---|---|---|
| `venue_id` | uuid, único | El lugar (nombre, dirección, coordenadas) |
| `tipo` | text + CHECK | `pelotero`, `salon_juegos`, `plaza_juegos`, `espacio_cultural_infantil` |
| `estado` | text + CHECK | `borrador` → `publicado` → `archivado` (con `motivo_archivo`) |
| `descripcion_corta` | text ≤ 280 | Texto **propio**, escrito por el admin (no copiado de la web del lugar) |
| `edad_min`, `edad_max` | smallint 0–17, null = sin límite | "De 2 a 10 años". Las dos null = todas las edades |
| `horarios` | jsonb con forma fija (§2.3) | Días y franjas en hora de Salta |
| `acceso` | text + CHECK | `gratis`, `pago`, `consultar`. **No se guardan precios**: se vencen en semanas; `nota_precio` admite "entrada gratis los domingos" |
| `techado` | text + CHECK, null = sin dato | `techado`, `aire_libre`, `mixto` (en Salta importa: lluvia de verano y sol fuerte) |
| `tiene_rampa`, `tiene_bano_adaptado`, `tiene_cambiador` | boolean, **null = no verificado** | Se muestra solo lo verificado; null nunca se lee como "no" |
| `contacto_telefono`, `contacto_web`, `contacto_instagram` | text | Solo contacto **comercial publicado por el lugar** (§5) |
| `fuente`, `fuente_detalle` | text + CHECK, text | De dónde salió el dato: `visita`, `web_oficial`, `redes_oficiales`, `llamado`, `organismo_publico`. Google Maps y OpenStreetMap **no** son fuentes válidas (§3.3) |
| `verificado_at`, `verificado_por` | timestamptz, uuid | Última verificación. Obligatoria para publicar |
| `cargado_por` | uuid | Quién creó la ficha |

Por qué `text + CHECK` y no `create type ... as enum`: es la convención de las migraciones recientes (`ad_price_cycles.estado` en la R58, `event_attendance.kind` en la R47). Sumar o sacar un valor es cambiar un CHECK con `not valid` + `validate`, sin `alter type` y sin dejar valores huérfanos. En TypeScript el tipo se escribe como unión en `packages/core` (§2.5).

### 2.3 Forma de `horarios`

```json
{
  "version": 1,
  "siempre_abierto": false,
  "solo_con_reserva": false,
  "semana": {
    "lun": [],
    "mar": [{ "desde": "16:00", "hasta": "20:30" }],
    "mie": [{ "desde": "16:00", "hasta": "20:30" }],
    "jue": [{ "desde": "16:00", "hasta": "20:30" }],
    "vie": [{ "desde": "16:00", "hasta": "21:00" }],
    "sab": [{ "desde": "10:00", "hasta": "13:00" }, { "desde": "15:00", "hasta": "21:00" }],
    "dom": [{ "desde": "15:00", "hasta": "21:00" }]
  },
  "nota": "En vacaciones de invierno abre también de mañana."
}
```

Reglas (las valida un esquema Zod en la server action; el SQL solo exige objeto con `version`):

- Las horas son **hora de pared de Salta** (`HH:MM`), nunca UTC: es el mismo criterio del README para los formularios. No se convierten porque no son instantes, son "a qué hora abre los martes".
- Día **ausente** = no sabemos. Día con `[]` = cerrado. No es lo mismo y la lista lo dice distinto ("sin dato" contra "cerrado").
- `siempre_abierto: true` es para plazas: `semana` queda vacía y la lista dice "Espacio abierto".
- `solo_con_reserva: true` para salones que abren con turno: la lista dice "Con reserva" y no muestra franjas.
- Franjas sin cruzar la medianoche (`hasta > desde`); hasta dos por día.
- Feriados y excepciones no entran en el MVP: van en `nota` como texto.

### 2.4 SQL propuesto

> **Esto no es una migración.** Es el contrato que propone este documento. La migración la escribe el equipo local, con su nombre de archivo, su prueba en local y `npm run db:types` en el mismo commit, como las demás.

```sql
-- PROPUESTA (docs/propuestas/lugares-para-chicos.md). No aplicar tal cual.

create table if not exists public.lugares_permanentes (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references public.venues(id) on delete restrict,
  tipo text not null,
  estado text not null default 'borrador',
  descripcion_corta text null,
  edad_min smallint null,
  edad_max smallint null,
  horarios jsonb not null default '{"version": 1, "semana": {}}'::jsonb,
  acceso text not null default 'consultar',
  nota_precio text null,
  techado text null,
  tiene_rampa boolean null,
  tiene_bano_adaptado boolean null,
  tiene_cambiador boolean null,
  contacto_telefono text null,
  contacto_web text null,
  contacto_instagram text null,
  fuente text not null,
  fuente_detalle text null,
  verificado_at timestamptz null,
  verificado_por uuid null references auth.users(id) on delete set null,
  cargado_por uuid null references auth.users(id) on delete set null,
  motivo_archivo text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint lugares_permanentes_venue_key unique (venue_id),
  constraint lugares_permanentes_tipo_check check (
    tipo in ('pelotero', 'salon_juegos', 'plaza_juegos', 'espacio_cultural_infantil')
  ),
  constraint lugares_permanentes_estado_check check (estado in ('borrador', 'publicado', 'archivado')),
  constraint lugares_permanentes_edades_check check (
    (edad_min is null or edad_min between 0 and 17)
    and (edad_max is null or edad_max between 0 and 17)
    and (edad_min is null or edad_max is null or edad_min <= edad_max)
  ),
  constraint lugares_permanentes_acceso_check check (acceso in ('gratis', 'pago', 'consultar')),
  constraint lugares_permanentes_techado_check check (techado in ('techado', 'aire_libre', 'mixto')),
  constraint lugares_permanentes_horarios_check check (
    jsonb_typeof(horarios) = 'object' and horarios ? 'version'
  ),
  constraint lugares_permanentes_fuente_check check (
    fuente in ('visita', 'web_oficial', 'redes_oficiales', 'llamado', 'organismo_publico')
  ),
  constraint lugares_permanentes_publicado_check check (estado <> 'publicado' or verificado_at is not null),
  constraint lugares_permanentes_archivado_check check (estado <> 'archivado' or motivo_archivo is not null),
  constraint lugares_permanentes_urls_check check (
    (contacto_web is null or contacto_web ~* '^https?://')
    and (contacto_instagram is null or contacto_instagram ~* '^https://(www\.)?instagram\.com/')
  ),
  constraint lugares_permanentes_descripcion_check check (
    descripcion_corta is null or char_length(descripcion_corta) <= 280
  )
);

comment on table public.lugares_permanentes is
  'Lugares permanentes (peloteros, salones de juegos, plazas con juegos, espacios culturales infantiles), 1 a 1 con un venue canónico. Carga manual verificada por un admin. Lectura pública solo de los publicados.';

-- Lo que lee /mapa: los publicados, por tipo.
create index if not exists lugares_permanentes_publicados_idx
  on public.lugares_permanentes (tipo)
  where estado = 'publicado';

-- La cola de "para volver a verificar" del admin.
create index if not exists lugares_permanentes_revision_idx
  on public.lugares_permanentes (verificado_at)
  where estado = 'publicado';

-- FK a auth.users con índice (las recorre delete_my_account).
create index if not exists lugares_permanentes_cargado_por_idx
  on public.lugares_permanentes (cargado_por) where cargado_por is not null;
create index if not exists lugares_permanentes_verificado_por_idx
  on public.lugares_permanentes (verificado_por) where verificado_por is not null;

drop trigger if exists lugares_permanentes_updated_at on public.lugares_permanentes;
create trigger lugares_permanentes_updated_at
  before update on public.lugares_permanentes
  for each row execute function public.set_updated_at();

alter table public.lugares_permanentes enable row level security;

-- Una sola política de SELECT por rol: dos permisivas para `authenticated`
-- (pública + admin) las marca el advisor (multiple_permissive_policies).
drop policy if exists "lectura pública de publicados" on public.lugares_permanentes;
create policy "lectura pública de publicados"
  on public.lugares_permanentes for select
  to anon
  using (estado = 'publicado');

drop policy if exists "lectura de publicados o admin" on public.lugares_permanentes;
create policy "lectura de publicados o admin"
  on public.lugares_permanentes for select
  to authenticated
  using (estado = 'publicado' or (select public.is_admin()));

drop policy if exists "inserción admin" on public.lugares_permanentes;
create policy "inserción admin"
  on public.lugares_permanentes for insert
  to authenticated
  with check ((select public.is_admin()));

drop policy if exists "actualización admin" on public.lugares_permanentes;
create policy "actualización admin"
  on public.lugares_permanentes for update
  to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

drop policy if exists "borrado admin" on public.lugares_permanentes;
create policy "borrado admin"
  on public.lugares_permanentes for delete
  to authenticated
  using ((select public.is_admin()));

revoke all on public.lugares_permanentes from anon;
grant select on public.lugares_permanentes to anon;
grant select, insert, update, delete on public.lugares_permanentes to authenticated;
revoke truncate on public.lugares_permanentes from authenticated;
```

Notas sobre el SQL:

- `(select public.is_admin())` envuelto en `select`, como dejó `20261010120000_rls_initplan.sql`, para que Postgres lo evalúe una vez por consulta.
- `on delete restrict` en `venue_id`: borrar o fusionar un venue que tiene ficha falla en vez de dejarla huérfana. Quien fusione venues tiene que mover la ficha al canónico primero (o archivarla).
- Que el venue sea canónico y tenga coordenadas dentro de `ZONA_SALTA` para publicar lo controla la server action, no un trigger: es una regla de flujo y ya existe `coordenadasEnSalta`.
- `cargado_por` y `verificado_por` son uuids sin nombre ni email, igual que `events.created_by`. Un `select` anónimo sobre publicados los ve; si eso molesta, la alternativa es un grant por columnas para `anon` (pregunta abierta 6.4.8).

### 2.5 Lo que arrastra la migración

- `npm run db:types` en el mismo commit.
- **Cuenta borrada**: `cargado_por` y `verificado_por` son columnas `*_by` nuevas. Van en `COLUMNAS_A_DESVINCULAR` de `apps/web/lib/cuenta/tablas-personales.ts` y en `public.delete_my_account()`, como pide el comentario de `20261018130300_qps_190_delete_my_account.sql`. El test `tests/cuenta/tablas-personales.test.ts` avisa si falta.
- Prueba de RLS (anon no ve borradores ni escribe; un usuario común no escribe; admin sí), con el mismo patrón de las otras tablas.
- El tipo de dominio en `packages/core`, para que la app (R55) lo reuse tal cual. Solo la forma:

```ts
type TipoLugarPermanente = 'pelotero' | 'salon_juegos' | 'plaza_juegos' | 'espacio_cultural_infantil'
type Franja = { desde: string; hasta: string } // 'HH:MM', hora de Salta
type HorariosLugar = {
  version: 1
  siempre_abierto?: boolean
  solo_con_reserva?: boolean
  semana: Partial<Record<'lun' | 'mar' | 'mie' | 'jue' | 'vie' | 'sab' | 'dom', Franja[]>>
  nota?: string
}
```

---

## 3. Cómo se cargan

### 3.1 En `/admin/lugares`

`/admin/lugares` hoy tiene tres pestañas (Sin ubicación, Para revisar, A mano) sobre los venues canónicos, ordenados por cantidad de eventos. Se suma una cuarta, **«Para chicos»**, con:

1. **«Sumar lugar para chicos»**: primero busca entre los venues existentes por nombre (hay índice trigram, `venues_name_trgm_idx`) para no duplicar el museo que ya trae eventos. Si no está, crea el venue (nombre y dirección, `is_placeholder = false`) y después la ficha.
2. **El formulario de la ficha**: los campos del §2.2, con los horarios como una grilla de 7 días (cerrado / sin dato / franjas) y no como JSON a mano. Guarda siempre en `borrador`.
3. **«Publicar»**: exige ubicación dentro de Salta, `fuente`, `verificado_at` y al menos `tipo` y `acceso`. Si falta algo, dice qué.
4. **«Archivar»**: pide el motivo ("cerró", "se mudó", "ya no tiene juegos", "duplicado"). No se borra: queda el historial.
5. **Subfiltros**: Borradores · Publicados · Para volver a verificar · Archivados.

Escribe solo el admin (`is_admin()`), con la sesión, por server actions, igual que `guardarUbicacionManual`. No hay rol de colaborador para esto en el MVP.

### 3.2 La ubicación: el pin de la R65

Lo que suma la R65 (PR #98) resuelve justo esta parte: «Ubicar» abre un mapa MapLibre con el estilo de OpenFreeMap, el admin busca la dirección (Nominatim, un pedido por click, hasta 3 resultados dentro de Salta), **arrastra el pin** hasta la puerta o el sector de juegos, y «Guardar ubicación» graba con `geocode_source = 'manual'`. Para una plaza esto importa: la dirección es una esquina, pero los juegos están en un rincón, y el pin va a los juegos.

La ficha no tiene coordenadas propias: usa las del venue. Así, si alguien corrige la ubicación desde la pestaña Sin ubicación, la capa de chicos se entera sola.

### 3.3 Fuentes: qué se puede usar y qué no

| Fuente | Para qué | Se guarda algo de ahí |
|---|---|---|
| Visita, llamado, web o redes **del propio lugar**, organismo público (Municipalidad, Provincia) | Nombre, horarios, edades, accesibilidad, contacto | Sí: es la `fuente` de la ficha |
| **OpenStreetMap** | Mirar el mapa para ubicarse y confirmar que la plaza existe | **No.** Sus datos son ODbL: si se extraen y se guardan, hay que atribuir y la base que resulta queda con share-alike. Mirarlo para verificar no extrae nada. La búsqueda de Nominatim de la R65 solo **mueve el pin**; la posición final la decide el admin arrastrándolo |
| **Google Maps / Street View** | Mirar la fachada o los juegos para verificar | **No.** Los términos de Google Maps prohíben extraer, copiar o guardar su contenido (horarios, teléfonos, fotos, reseñas, coordenadas). Por eso `/admin/lugares` ya rechaza links de Google Maps (`coordenadas-manuales.ts`) |
| Directorios, listados de "los 10 mejores peloteros", agregadores | Ninguno | No |

**Nada de scraping.** Ni de Google, ni de OSM, ni de redes, ni de directorios. Son 30 a 80 lugares en Capital: es carga manual, y está bien que lo sea, porque el valor es que alguien lo verificó.

### 3.4 Verificación y revisión periódica

- Cada ficha publicada muestra "Verificado el 12/10/2026". Es honesto y le avisa a la persona qué tan fresco es el dato.
- Plazos de revisión: **90 días** para `pelotero` y `salon_juegos` (comercios, cambian de horario y cierran) y **180 días** para `plaza_juegos` y `espacio_cultural_infantil`. Es una función pura en `packages/core`, no una columna: cambiar el plazo no exige migración.
- La pestaña «Para chicos» muestra arriba "N lugares para volver a verificar" (usa `lugares_permanentes_revision_idx`).
- **Fase 2**: un aviso semanal por mail al admin con los vencidos (Resend ya está; un workflow de GitHub Actions como los de `.github/workflows/`). En el MVP alcanza con el contador.
- Si una ficha pasa **el doble** del plazo sin verificar, la lista pública agrega "Puede haber cambiado: confirmá antes de ir". No se despublica sola: un lugar que no cambió no tiene por qué desaparecer.

---

## 4. Cómo se ven en el mapa

### 4.1 Una capa aparte

- **Otra fuente GeoJSON** (`lugares-chicos`) y **otras capas** (`chicos-pines`, `chicos-toque`, `chicos-seleccion`), al lado de las de eventos que arma hoy `agregarFuenteYCapas` en `components/mapa/mapa-maplibre.tsx`. No se mezclan en la fuente de eventos: los pines de eventos dependen de la fecha y los de lugares no.
- **Forma distinta, no solo color.** Los eventos son círculos con el color `--primary`. Los lugares para chicos son una capa `symbol` con un ícono propio en SVG (una casita con un globo, registrada con `addImage`, sin sprites externos), anclado abajo (`icon-anchor: bottom`), con borde blanco. La diferencia se ve en blanco y negro y con daltonismo. La selección es un contorno con la misma forma, no un cambio de color.
- **Orden de capas**: la de chicos va **debajo** de la de eventos. Si un museo tiene ficha y además una función hoy, el círculo del evento queda arriba y el ícono asoma por arriba del punto; los dos se pueden tocar.
- Mismo blanco de toque que los eventos (`circle-radius: 22` transparente, unos 44 px).
- Un solo ícono para los cuatro tipos en el MVP; íconos por tipo, en la fase 3.

### 4.2 Cuándo está prendida (y la URL)

La URL es el único estado, como hoy con `cuando` y `dia`, y como `gratis`, `chicos` y `categoria` en `consultaDelMapa` de la otra rama. Se suma `capa=chicos` al final del orden fijo.

| Situación | Capa de chicos |
|---|---|
| `/mapa` sin parámetros | Apagada. El mapa queda exactamente como hoy |
| Toggle «Lugares para chicos» | Se prende y agrega `capa=chicos` |
| Chip «Para chicos» (eventos) | Prende el chip **y** la capa: agrega `chicos=1&capa=chicos` |
| Con el chip prendido, se apaga la capa | Queda `chicos=1` sin `capa`: eventos infantiles y nada más |
| Link viejo con `chicos=1` solo | Capa apagada (el link dice lo que muestra) |
| `gratis=1` con la capa prendida | Filtra también la capa: solo `acceso = 'gratis'` |
| `categoria=<slug>` | No afecta la capa (los lugares no tienen categoría de evento) |
| `cuando` / `dia` | No afectan la capa en el MVP. En la fase 3, "abierto ese día" según `horarios` |

**Decisión:** apagada por defecto, prendida automáticamente con el chip «Para chicos». Quien toca «Para chicos» está preguntando lo mismo que los testers; quien no lo toca no tiene por qué ver 40 íconos más.

El servidor lee `lugares_permanentes` **solo** con `capa=chicos` (son pocas filas, una consulta con el venue embebido). Sin la capa, `/mapa` hace las mismas consultas que hoy.

`?lugar=<uuid>` sigue funcionando: con la capa prendida, también vale para un lugar para chicos.

### 4.3 La lista

- Hoy `ListaLugares` es la lista de lugares con eventos. Con la capa prendida, abajo aparece una **sección separada** con su `<h2>` «Lugares para chicos». Los lugares pasan a `<h3>` dentro de cada sección.
- Cada lugar: nombre, tipo ("Plaza con juegos"), edades ("de 2 a 10 años"), horario de hoy o "Espacio abierto" o "Con reserva", acceso (gratis / pago / consultar), techado, accesibilidad **solo lo verificado** ("Rampa · Baño adaptado"), "Verificado el …", la web o el Instagram del lugar, «Ver en el mapa» y «Cómo llegar» (abre Google Maps con la dirección, como en la app: no le pasa la ubicación de nadie).
- Si el venue además tiene eventos en el filtro: "Este lugar también tiene eventos hoy" con un link al bloque de arriba.
- Los ids de los bloques no pueden chocar con los de eventos (`lugar-<venueId>`): la sección de chicos usa otro prefijo, y la selección pasa a ser `{ capa, venueId }`.
- Leyenda fija al pie de la sección: "Los datos los carga y verifica el equipo de Qué Pinta Salta. No inspeccionamos los lugares: confirmá horarios antes de ir."
- El estado vacío cambia: hoy, sin eventos, `/mapa` esconde el mapa y dice "No hay eventos con ubicación". Con la capa prendida, el mapa se muestra si hay eventos **o** lugares, y el contador dice "3 lugares con eventos · 18 lugares para chicos" (en el mismo `aria-live`).

### 4.4 Encaje con `pinesAGeoJson`

Se respeta la regla de `pines.ts`: el GeoJSON lleva **solo ids**, nada de texto ajeno, y el mapa no dibuja HTML (sin `Popup.setHTML`). Una función pura nueva en `packages/core/src/mapa/` arma la colección de lugares con `properties: { venueId, tipo }`. `tipo` es un valor propio de un CHECK (no texto de terceros) y sirve para elegir el ícono en la fase 3. Nombre, dirección, horarios y contacto los dibuja la lista, en React. Las coordenadas pasan por `aCoordenada` y `coordenadasEnSalta`, como las de eventos.

### 4.5 Accesibilidad

- El toggle es un `<button aria-pressed>` con texto visible «Lugares para chicos» e ícono decorativo (`aria-hidden`), con el mismo estilo y foco que los chips (`BASE_BOTON`, `min-h-11`).
- El mapa sigue siendo una `region` con nombre accesible. Con la capa prendida, el nombre pasa a "Mapa de lugares con eventos y lugares para chicos", y la ayuda `sr-only` aclara que la lista tiene los mismos lugares.
- **La lista es la alternativa completa**: todo lo que está en el mapa está en la lista, y funciona aunque MapLibre no cargue (`MapaDiferido`).
- «Ver en el mapa» lleva el nombre del lugar en `sr-only`, como hoy. `prefers-reduced-motion` se respeta igual que en `comportamientoDeScroll`.
- El ícono y su contorno cumplen 3:1 contra los dos estilos (claro y oscuro), como dejó la R73 para el rojo del tema oscuro.

### 4.6 "Cerca de casa"

Dos caminos, los dos **en el navegador**:

1. **«Cerca mío»**: el mismo nombre que ya usa la app. Pide `navigator.geolocation.getCurrentPosition` **solo al tocar el botón** (nunca al cargar), sin alta precisión, sin `watchPosition`, con timeout. La posición vive en el estado de React mientras la página está abierta.
2. **«O elegí tu barrio»**: un `<select>` con una lista corta de barrios y zonas de Capital (Centro, Tres Cerritos, Grand Bourg, Castañares, etc.), cada uno con un punto aproximado **cargado a mano por el equipo**, en una constante de `packages/core`. Sirve para quien no quiere dar la ubicación, o para buscar cerca de la casa de la abuela.

Con un origen elegido, la sección «Lugares para chicos» se **ordena por distancia**, calculada en el navegador con una función pura (haversine), y cada lugar dice "a 1,4 km en línea recta" (en línea recta, para no prometer recorrido). Sin origen, el orden es por tipo y nombre.

Lo que **no** pasa con la posición ni con el barrio: no van a la URL (un link compartido no lleva dónde vive quien lo compartió), no se mandan al servidor (ni server action, ni `fetch`, ni `router`), no se guardan (ni `localStorage`, ni cookie, ni base) y no van a la analítica. Si el mapa se centra en la posición, OpenFreeMap recibe el pedido de los tiles de esa zona: eso ya está contado en `/privacidad` y el párrafo del §5 lo repite.

Se puede fijar con un test estático, como el detector de la R65 para Nominatim: `getCurrentPosition` aparece en un solo archivo, dentro de un handler de click, y ese archivo no importa nada que escriba a la red.

---

## 5. Privacidad

### 5.1 La ubicación del navegador

`/privacidad` ya explica «Cerca mío» **en la app**. El sitio necesita el equivalente. Párrafo propuesto para la lista de "Qué datos tratamos" (no se toca la página en esta rama; va en el mismo PR que la fase 2):

> **Cuando uses «Cerca mío» en el mapa del sitio:** el navegador te pide permiso para usar tu ubicación, y solo cuando tocás ese botón. La usamos en tu navegador para ordenar los lugares por distancia y, si querés, centrar el mapa donde estás. Tu posición no se manda a nuestros servidores ni a terceros, no se guarda y no se agrega a la dirección de la página, así que tampoco viaja si compartís el link. Si elegís un barrio en lugar de usar tu ubicación, pasa lo mismo: queda en tu navegador mientras tenés la página abierta. Si el mapa se centra donde estás, el navegador le pide a OpenFreeMap las imágenes de esa zona, así que OpenFreeMap puede conocer de forma aproximada dónde estás (ver "Cuando mires el mapa"). Podés quitar el permiso cuando quieras desde la configuración de tu navegador.

Y en "Para qué los usamos", el ítem que hoy dice "en tu teléfono" pasa a: "Mostrarte lo que queda cerca cuando tocás «Cerca mío», en tu teléfono o en tu navegador, y mostrarte el mapa."

### 5.2 Los datos de los lugares

- Son datos **públicos de negocios y espacios** (nombre, dirección, horario, accesibilidad), no datos personales. No hace falta consentimiento para mostrarlos, pero sí que sean ciertos.
- **Contacto: solo el comercial que publica el propio lugar** (el teléfono de la vidriera, de la web o de la bio de Instagram del local). Muchos peloteros y salones son emprendimientos familiares: si el único teléfono es el celular personal de la dueña, y no lo publica como contacto del local, **no se carga**. Ante la duda, se deja solo la web o el Instagram del lugar.
- Lo mismo con la dirección: un salón que funciona en una casa particular entra solo si el lugar publica esa dirección como comercial.
- Cualquier lugar puede pedir una corrección o que lo saquen por el contacto del sitio. Se archiva con el motivo "pedido del lugar", en la semana.
- `cargado_por` y `verificado_por` son ids de admins, no de usuarios del público, y se desvinculan si la cuenta se borra (§2.5).

---

## 6. Fases, riesgos, métricas y preguntas

### 6.1 Fases

| Fase | Qué entra | Qué no |
|---|---|---|
| **0. Decisiones** | Mauro responde el §6.4. El equipo local escribe la migración a partir del §2.4 y la prueba en local | Código de la app |
| **1. MVP** (después de que se mergeen la R65 y el chip «Para chicos») | Tabla y RLS. Pestaña «Para chicos» en `/admin/lugares` (alta, formulario, publicar, archivar, contador de vencidos). Capa en `/mapa` con un ícono, el toggle, `capa=chicos`, el encendido con el chip y la sección en la lista. **Carga inicial de 20 a 30 lugares**, con prioridad en plazas y espacios culturales (gratis y estables) | Geolocalización, barrios, filtros dentro de la capa, app |
| **2. Cerca de casa** | «Cerca mío» y «Elegí tu barrio» en la web, orden por distancia, el texto nuevo de `/privacidad` **en el mismo PR**. Aviso semanal de vencidos al admin. Contador de uso (§6.3) | |
| **3. Afinar** | Filtros de la capa (tipo, edad, techado para días de lluvia, gratis). "Abierto ahora / ese día" con `horarios` y el reloj de Salta. Íconos por tipo. La capa en la app (la R55 reusa `packages/core`) | Ficha propia por lugar, salvo que Mauro la pida (§6.4) |

La fase 1 ya responde una parte del pedido sin geolocalización: con la capa prendida, cada uno mira su zona en el mapa.

### 6.2 Riesgos

| Riesgo | Mitigación |
|---|---|
| Datos desactualizados (horarios, precios, juegos rotos) | No se guardan precios. "Verificado el …" visible. Plazos de 90/180 días con contador y aviso. Leyenda "confirmá antes de ir" y aviso extra al pasar el doble del plazo |
| Un lugar cierra y sigue en el mapa | Archivar con motivo en un click. Corrección a pedido del lugar o de un usuario por el contacto del sitio. Los comercios (peloteros, salones) tienen el plazo corto |
| Duplicar un venue que ya trae la ingesta | El alta busca primero por nombre (trigram). Una ficha por venue (`unique`). `on delete restrict` frena una fusión que dejaría la ficha huérfana |
| Datos personales de emprendedores | Solo contacto y dirección comerciales publicados por el lugar (§5.2) |
| Que parezca que recomendamos o garantizamos la seguridad de un lugar | Leyenda fija: no inspeccionamos los lugares. Sin puntajes ni reseñas. Sin destacados pagos en la capa (pregunta 6.4.7) |
| El mapa se llena de íconos y se pierden los eventos | Capa apagada por defecto. Forma distinta y debajo de los eventos |
| Carga de trabajo: hoy el admin es una persona | MVP de 20 a 30 lugares. Plazos de revisión largos para lo estable. Si no hay tiempo de verificar, la ficha queda en borrador: es mejor no mostrar que mostrar mal |
| Confundir "evento para chicos" con "lugar para chicos" | Dos controles con nombre distinto, dos secciones en la lista y dos formas en el mapa. El chip prende los dos porque responden la misma pregunta |

### 6.3 Métricas: cómo saber si sirve

Ninguna mide personas ni posiciones: solo cantidades, como `event_metrics_daily` (`docs/METRICAS.md`).

- **Uso de la capa**: visitas a `/mapa` con `capa=chicos` sobre el total de visitas a `/mapa`. Si Vercel Analytics no separa el query param, un contador diario propio (día, acción) sin IP, user agent ni usuario.
- **Intención de ir**: toques en «Cómo llegar» y en la web o el Instagram de cada lugar, por lugar y por día (mismo contador, fase 2).
- **Uso de «Cerca mío» y del barrio**: cuántas veces se tocó, nunca dónde ni qué barrio.
- **Calidad de los datos**: porcentaje de fichas publicadas dentro del plazo de verificación (meta: 90 % o más), fichas archivadas por "cerró" o "pedido del lugar" por mes, correcciones recibidas.
- **Cualitativa**: a las dos o tres semanas de la fase 1, preguntarles a los testers de la beta que lo pidieron si lo usaron y qué les faltó.
- **Corte**: si a las seis semanas de la fase 1 la capa se prende en menos del 5 % de las visitas a `/mapa` y los testers no la usaron, no se sigue con la fase 3 y se revisa el alcance antes de cargar más lugares.

### 6.4 Preguntas abiertas para Mauro

1. **Zona**: ¿solo Salta Capital o también el Gran Salta (San Lorenzo, Vaqueros, Cerrillos, La Caldera)? `ZONA_SALTA` admite toda la provincia; el criterio es editorial.
2. **Quién carga y verifica**, y cuántas horas por semana hay. ¿Los plazos de 90 y 180 días están bien?
3. **Salones de cumpleaños que abren solo con reserva**: ¿entran con "Con reserva" o solo los que abren al público?
4. **Emprendimientos en casas particulares**: ¿afuera, como propone el §5.2, o adentro si publican la dirección?
5. **Encendido**: ¿la capa se prende sola con el chip «Para chicos» (propuesta) o siempre a mano?
6. **Ficha propia por lugar** (`/lugar/<slug>`, con datos estructurados para Google): ¿vale la pena o alcanza con la lista del mapa?
7. **Publicidad**: ¿un pelotero puede pagar para aparecer destacado en la capa? La propuesta es que **no**, al menos hasta tener métricas, para que la capa no parezca un listado pago.
8. **Ids de admins**: ¿está bien que `cargado_por`/`verificado_por` se puedan leer con la anon key (como `events.created_by`), o se hace un grant por columnas?
9. **Alta a pedido**: ¿un formulario para que los lugares propongan su ficha (que entra como borrador), o solo carga del equipo?
10. **Barrios**: ¿qué lista de barrios y zonas usamos en «Elegí tu barrio»? La propuesta es una lista corta, de 15 a 25, con puntos aproximados que carga el equipo a mano.
