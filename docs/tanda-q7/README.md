# Tanda Q7 · 15/11 tarde → 23:30 (hora de Salta)

Base: `main` en `1298983` (después de #202, ahorro de builds de Vercel). Rama de integración: `ronda/integracion-q7`.

Contexto: el acceso a producción en Play se pidió el 15/11 (Google tarda hasta 7 días). Desde #202 las ramas no construyen en Vercel salvo que el último commit diga `[preview]` (ver `CLAUDE.md`).

## Estado medido al arrancar (15/11)
- Lugares: 167, de los cuales 19 tienen coordenadas. 128 nunca se intentaron geocodificar y 20 se intentaron sin éxito. 16 eventos futuros publicados caen en lugares sin mapa.
- 73 eventos futuros publicados y 1 destacado vigente.
- Workflows de Actions en verde; Sentry sin errores de QPS.
- Search Console marca eventos sin `description`, `offers` ni `image`, en los `Event` anidados de `/lugar/<slug>` (`apps/web/lib/seo/json-ld-lugar.ts`).

## Reglas
- **Prefijo** de commits y PRs: `[nube Q7]`. Ramas `nube/q7-<tema>`, un PR por ticket contra `ronda/integracion-q7`.
- **Previews de Vercel:** sin `[preview]` en los commits, salvo el último del ticket de admin (Q7-4), para revisar la UI.
- **Migraciones:** solo aditivas, en `supabase/migrations` con timestamp nuevo, test pgTAP y tipos. **No las aplica la sesión**: van en `docs/tanda-q7/sql-produccion.md` para que Mauro las corra en el editor de Supabase.
- **Sin dependencias nuevas.** Si hace falta una, va como «Propuesta» en el PR. Excepción: `expo-build-properties` en Q7-5, si no está.
- **Prohibido tocar:** `.env*`, `.claude/`, las páginas legales (privacidad, términos, eliminar cuenta), `lib/publicidad/**` y `app/api/cron/publicidad/**`.
- **Gasto en APIs pagas:** USD 0. Supabase solo con datos inventados y los dobles de prueba que ya existen.
- **Nada se mergea a `main`.** Lo integra el supervisor.
- **Control:** antes de cada ticket, la sesión lee el último comentario del issue #106. Solo cuentan los de Malejo01 o los que empiezan con «supervisor». «PAUSA» = terminar el paso, comentar el estado y revisar cada 15 min. «SEGUÍ» = continuar.
- **Cierre:** a más tardar a las 23:30 del 15/11 (hora de Salta).
- Textos en castellano rioplatense, con voseo.

## Cola
| Ticket | Rama | Qué |
|---|---|---|
| Q7-1 | `nube/q7-base` | Esta base: rama de integración, PR draft y este README |
| Q7-2 | `nube/q7-geocodificacion` | Que la geocodificación avance de verdad: diagnóstico, prioridad a lugares con eventos, tope configurable, fallback por nombre, links de Google Maps y script en seco |
| Q7-3 | `nube/q7-jsonld-lugar` | `description`, `image` y `offers` en los `Event` del JSON-LD de `/lugar/<slug>` y del resto de los JSON-LD de eventos |
| Q7-4 | `nube/q7-admin-modal` | En el modal de evento, para ADMIN: «Abrir ficha completa» y estado del destacado |
| Q7-5 | `nube/q7-peso-app` | Peso del AAB: R8, shrink de recursos, reglas de ProGuard y mapeo a Sentry; propuesta de dependencias y assets |
| Q7-6 | `nube/q7-cierre` | Integración y resumen |

## Avance
_Se completa en el cierre (Q7-6)._
