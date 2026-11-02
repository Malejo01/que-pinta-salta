# 18 · R74 · El aviso "falta la audiencia" por `fuente_audiencia` necesita migración

**Contexto.** QPS-346 pide que el aviso del admin ("Es la audiencia del mes anterior: cargala a mano") salga de `fuente_audiencia` y no de comparar números (`audiencia_web_28d === 0 || === la del vigente`). Pero el cron ya escribe `fuente_audiencia = 'manual'` en el ciclo que nace con la audiencia del anterior, y el check `ad_price_cycles_fuente_audiencia_check` solo admite `'vercel'` y `'manual'`: no hay valor para "copiada del anterior". El plan dice "sin migraciones: si una tarea la necesita, se corta y se pregunta". El resto de 74-d (tabla en 360 px, `pattern` del dólar, alcance estimado, "DolarAPI") está commiteado (`892765b`).

**Opciones**
1. **(Recomendada)** Una migración chica en otra ronda (de día): sumar `'anterior'` al check; el cron escribe `fuente_audiencia = 'anterior'` cuando copia la del ciclo previo (o 0), el admin la pasa a `'manual'` al cargarla y el aviso sale de `fuente_audiencia === 'anterior'`. SQL propuesto:
   `alter table public.ad_price_cycles drop constraint ad_price_cycles_fuente_audiencia_check, add constraint ad_price_cycles_fuente_audiencia_check check (fuente_audiencia in ('vercel', 'manual', 'anterior'));` + `npm run db:types` (el tipo `fuenteAudiencia` de `@qps/core/publicidad/formula` suma `'anterior'`). Es lo único que distingue de verdad "la cargó Mauro" de "la copió el cron".
2. Dejar el aviso por igualdad de números (como está): falla solo si la audiencia real coincide exacta con la del mes anterior (el aviso sigue aunque ya se cargó).
3. Sin migración: reusar `'vercel'` para "no la cargó nadie" — no, sería mentir sobre la fuente.

**Tarea parada:** el último punto de 74-d (solo ese).
**Sigo con:** 74-a, 74-b, 74-c y 74-q de la R74.
