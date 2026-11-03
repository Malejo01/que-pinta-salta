# Fuentes nuevas: candidatas y cómo sumarlas (Q5-10)

> **Estado al 3/11/2026:** en esta tanda **no se sumó ninguna fuente**. El entorno de la sesión en la nube no tiene salida a esos dominios: el proxy de red respondió 403 a `salta.gob.ar`, `cultura.salta.gob.ar`, `municipalidadsalta.gob.ar` y `vamos.com.ar`. Sin poder leer **robots.txt** y los **términos**, y sin **HTML real grabado** para los tests, escribir un scraper sería adivinar. La regla de la tanda es descartar una fuente que no se pueda verificar, así que queda este plan.
>
> Para destrabarlo hay dos caminos. Uno: **sumar esos dominios a «Allowed domains»** en la configuración de red del entorno de la nube (https://code.claude.com/docs/en/cloud-environments#network-access). El otro: correr los pasos de abajo en una máquina local.

## Las tres candidatas (salen de la auditoría, §5)

| # | Fuente | Por qué | Hueco que cubre | Qué verificar antes |
|---|---|---|---|---|
| 1 | **Agenda cultural de la Provincia** (Ministerio de Cultura de Salta: agenda pública de museos, teatros y centros culturales provinciales) | Fuente oficial; publica la programación de la Casa de la Cultura, el Teatro Provincial, la Usina Cultural y los museos | Teatro, recitales chicos, infantil y talleres, que la auditoría marca bajos | robots.txt; términos de reutilización (si dice «datos abiertos», mejor); si hay **RSS, iCal o API**, preferirlo al HTML |
| 2 | **Agenda de la Municipalidad de Salta Capital** (cultura y eventos de la ciudad) | Ferias, actividades en plazas y en centros vecinales | **Barrios sin cobertura**, ferias y deportes | Lo mismo. Si publica en redes y no en la web, va por el flujo de Instagram (cuenta oficial) y no por scraper |
| 3 | **`vamos` (ticketera que ya existe)**: reparar, no sumar | Callada desde el 4/9. Ya está el scraper (`lib/scraper/vamos-scraper.ts` y `vamos-parsers.ts`) | Recupera eventos de ticketera | Que siga siendo público y permitido (robots.txt); grabar el HTML actual en `lib/scraper/` como los `debug-*.html` y ajustar `vamos-parsers.ts` con un test |

Descartadas de entrada:
- Agregadores de terceros: copian eventos de otros y los términos suelen prohibir extraer.
- Google y Facebook: los términos prohíben el scraping.

## Cómo se suma una fuente (el framework que ya existe)

1. **Permiso**:
   - leer `https://<dominio>/robots.txt` y los términos, y anotar la fecha y lo que dicen en este archivo;
   - si prohíben el acceso automatizado, **descartar** y anotar el motivo.
2. **HTML grabado**: guardar una página real de la cartelera como fixture del test (como `lib/scraper/debug-*.html`), sin datos personales.
3. **Proveedor**: `apps/web/app/api/cron/scrape/providers/<fuente>.ts`, con la misma forma que `entradauno` (devuelve el arreglo y **no escribe**). Los parsers van en `lib/scraper/<fuente>-parsers.ts`, puros y con tests sobre el HTML grabado.
4. **Filtro de Salta Capital**: `lib/scraper/salta-capital.ts`, como hacen las demás.
5. **Desactivada por defecto**: el cron solo la llama con un flag (por ejemplo, `FUENTE_<NOMBRE>_ACTIVA=1`). El flag lo prende Mauro en Vercel; el agente no toca variables.
6. **Prueba en seco**: `apps/web/scripts/dry-run-<fuente>.ts`, como `dry-run-entradauno.ts`. Llama al proveedor e imprime lo que traería, sin escribir:
   ```bash
   cd apps/web
   npx tsx scripts/dry-run-<fuente>.ts
   ```
7. **Prioridad entre fuentes**: sumar la fuente a `lib/scraper/source-priority.ts`, que decide quién gana en una fusión.
8. **Ritmo**: un pedido por segundo como máximo, User-Agent propio (`QuePintaSalta/1.0 …`) y una sola corrida por día dentro del cron de ticketeras.
