# Precios de los modelos (Q6-4)

> **Precios por token confirmados** con las páginas oficiales el 3/11/2026.
> Los consultó Gemini en G-2 (#183) y están en
> `docs/evaluacion-ia/precios-fuentes.md`. Con eso, Flash-Lite queda en USD 0,30 / 2,50 y no en el
> 0,25 / 1,50 que había supuesto este banco.
>
> **Lo que sigue estimado:** los `tokens_por_imagen`. Las páginas de precios no
> los dan; hay que medirlos con la primera corrida `--real`. Si cambian, corregí la tabla y volvé a
> correr `npx tsx scripts/evaluar-ia.ts` (lee esta tabla cada vez).

El script `apps/web/scripts/evaluar-ia.ts` lee la tabla que está entre los dos
comentarios `precios:inicio` / `precios:fin`. Reglas para editarla:

- Una fila por modelo. `clave` es el nombre del modelo tal como lo usa la app.
- `proveedor`: `gemini` o `claude`.
- `entrada_usd_mtok` / `salida_usd_mtok`: dólares por millón de tokens, con
  punto decimal.
- `tokens_por_imagen`: los tokens de entrada que cuesta UNA imagen de flyer
  (Instagram, 1080×1350). Ver abajo cómo sale cada número.
- `estado`: `verificar` (sin confirmar), `confirmado` (alguien lo miró en la
  fuente) o `referencia` (solo para comparar; no es candidato).

<!-- precios:inicio -->
| clave | proveedor | entrada_usd_mtok | salida_usd_mtok | tokens_por_imagen | fuente | consultado | estado |
|---|---|---|---|---|---|---|---|
| gemini-3.5-flash-lite | gemini | 0.30 | 2.50 | 1120 | https://ai.google.dev/gemini-api/docs/pricing | 2026-11-03 | confirmado |
| claude-haiku-4-5 | claude | 1.00 | 5.00 | 1532 | https://platform.claude.com/docs/en/about-claude/pricing | 2026-11-03 | confirmado |
| claude-sonnet-4-5 | claude | 3.00 | 15.00 | 1532 | https://platform.claude.com/docs/en/about-claude/pricing | 2026-11-03 | referencia |
<!-- precios:fin -->

## De dónde sale cada número

- **gemini-3.5-flash-lite** (el modelo de hoy, `GEMINI_MODEL`): USD 0,30 de
  entrada (texto o imagen) y 2,50 de salida por millón, incluido el
  razonamiento. Es la página oficial consultada el 3/11 (G-2,
  `precios-fuentes.md`). En Gemini, la imagen se cobra como tokens de entrada
  al mismo precio que el texto.
- **claude-haiku-4-5** (el default de Claude en `lib/ia/claude.ts`): USD 1
  entrada / 5 salida por millón. La imagen se cobra como tokens de entrada.
- **claude-sonnet-4-5**: solo de referencia (USD 3 / 15), para ver cuánto
  costaría un modelo más grande si Haiku no alcanza en flyers.
- Las páginas oficiales: Google <https://ai.google.dev/gemini-api/docs/pricing>,
  Anthropic <https://www.anthropic.com/pricing> (detalle en
  <https://docs.claude.com/en/docs/about-claude/pricing>).

## Tokens por imagen (estimación estándar de cada proveedor)

Los flyers de Instagram son, casi siempre, 1080×1350 (4:5).

- **Gemini 3.x**: con la resolución por defecto, cada imagen cuesta un número
  fijo de tokens; el agente usa **1120** (la resolución «alta», que es la que
  usa Gemini 3 si no se pide otra). Con Gemini 2.x eran 258 tokens por
  mosaico de 768×768 (1080×1350 → 4 mosaicos → 1032). Verificar el valor de
  3.5 Flash-Lite: el modo `--real` lo mide (`promptTokenCount` incluye la
  imagen).
- **Claude**: `tokens ≈ ancho × alto / 750`, después de achicar la imagen para
  que el lado largo no pase de 1568 px y el total no pase de ~1,15 megapíxeles.
  1080×1350 = 1,46 MP → se achica a ~959×1198 → **1532** tokens
  (`tokensImagenClaude` en `apps/web/lib/ia/evaluacion/tokens.ts` hace la
  cuenta; un test controla que esta tabla diga lo mismo).

## Otros supuestos de la estimación (en `tokens.ts`)

- Texto → tokens por caracteres: Gemini 4 caracteres por token, Claude 3,5
  (su tokenizador parte más el castellano). Los caracteres fuera del alfabeto
  latino (emojis, letras «negrita» Unicode) pesan 2 o 3.
- Claude con salida JSON usa una herramienta forzada: suma ~313 tokens de
  entrada (el prompt de sistema de herramientas) y ~25 de salida (el bloque
  `tool_use`).
- El esquema JSON se cuenta como entrada en los dos proveedores.
- Si Gemini 3.5 Flash-Lite «piensa» por defecto, la salida real puede ser
  bastante más que la estimada (los tokens de razonamiento se cobran como
  salida). El modo `--real` lo mide.
