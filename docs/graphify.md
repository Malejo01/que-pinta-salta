# Graphify: decisión (R79)

**Qué es:** herramienta que arma un grafo del código para que el agente lo consulte en vez de leer archivos. [COMPLETAR: link y versión]

## Conclusión

**No conviene adoptarlo en este repo por ahora.** El monorepo (`apps/web`, `apps/mobile`, `packages/*`, `supabase/`) es grande, con 317 archivos versionados en `apps/web/tests` y 29 en `supabase/migrations` (conteo con `git ls-files`, 30/10). Armar y mantener el grafo (y que no quede desactualizado entre ramas y worktrees) tiene un costo que hoy no sabemos si se compensa.

## Plan

1. Probarlo primero en otro proyecto propio, más chico y de menor riesgo.
2. Si el resultado es bueno, recién ahí medirlo acá.

## Criterio para adoptarlo

Se adopta solo si logra un ahorro de **al menos 25 %** de tokens en tareas comparables, medido contra la línea de base de [`docs/tokens-baseline.md`](./tokens-baseline.md). Mismas tareas, mismo modelo, con y sin la herramienta. Por debajo de 25 % no se adopta.

## Qué no se hace mientras tanto

- No se agrega como dependencia ni como servidor MCP del repo.
- No se indexan `supabase/.data-dumps/`, `.env*` ni ningún dato personal.
