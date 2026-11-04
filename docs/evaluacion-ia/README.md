# Banco de evaluación de IA (Q6-4)

Mide, con datos reales de Qué Pinta Salta, qué tan bien hace la IA los tres
trabajos que tiene en la app y cuánto cuesta cada proveedor, para decidir
**por uso** si conviene pasar de Gemini (el de hoy) a Claude:

| uso | qué hace la IA en la app | dónde está el pedido |
|---|---|---|
| **flyers** | imagen + caption de Instagram → JSON del evento (fecha, hora, lugar, precio, categoría…) | `apps/web/lib/ai/llamadas-ia.ts` (`extractEventFromFlyer`) |
| **traducción** | título y descripción al inglés para `/en` | `apps/web/lib/ai/traducir-evento.ts` |
| **clasificación** | categoría (slug) de los eventos que quedaron sin categoría | `apps/web/lib/ai/clasificar-categoria.ts` (`scripts/revisar-calidad.ts --ia`) |

El banco usa **esas mismas funciones** para armar los pedidos: si alguien
cambia un prompt o un esquema en la app, el banco mide el nuevo.

## Archivos

| archivo | qué tiene |
|---|---|
| `flyers.json` | 30 flyers reales (caption + URL de la imagen en storage) con lo que quedó **publicado después de una revisión humana**, y lo que había extraído la IA de producción en su momento (`ia_produccion`). |
| `traduccion.json` | 30 eventos reales de la cola de traducción con una traducción de referencia. En producción no hay ninguna traducción revisada, así que **todas** las referencias las escribió el agente (`referencia: "agente"`). |
| `clasificacion.json` | 30 eventos reales con su categoría publicada; `fuente_categoria` dice si la puso una persona (`manual`) o un scraper. |
| `precios.md` | precios por millón de tokens y tokens por imagen de cada modelo, con fuente y fecha. **Verificar antes de decidir** (se armó sin navegar). |
| `volumenes.json` | cuántas llamadas por mes hace la app de cada uso (sacado de producción, con las consultas). |

Cada fixture dice arriba el criterio con que se eligieron los casos y la
consulta (solo `select`) con que se sacaron. **Sin datos personales**:
teléfonos y emails reemplazados por `[telefono]` / `[email]`, y las
@menciones de personas o comercios por `@[cuenta]`; solo quedan las cuentas
públicas que lista `cuentas_publicas` (lugares y productoras que la app
sigue, y algunas cuentas oficiales de artistas). Un test
(`tests/ia/evaluacion-fixtures.test.ts`) falla si alguien agrega un email, un
teléfono o una mención que no esté en esa lista.

Las imágenes **no están en el repo**: el entorno donde se armó no podía
bajarlas (`imagen: "no-descargada"`, con la URL pública de storage). El modo
en seco igual estima sus tokens; el modo real las baja de esa URL.

## Cómo correrlo

Desde `apps/web`:

```bash
# EN SECO (por defecto, gratis): valida los fixtures, arma los pedidos reales
# sin llamar a nadie, estima tokens y el costo mensual por modelo.
npx tsx scripts/evaluar-ia.ts
npx tsx scripts/evaluar-ia.ts --salida /tmp/informe.json   # además, el informe en JSON

# REAL (PAGO): llama al modelo con los mismos pedidos y mide la calidad.
# Sin --confirmo-costo solo muestra el costo máximo estimado y no llama.
npx tsx scripts/evaluar-ia.ts --real --proveedor ambos
npx tsx scripts/evaluar-ia.ts --real --proveedor ambos --confirmo-costo --tope 30
npx tsx scripts/evaluar-ia.ts --real --proveedor claude --uso flyers --tope 10 --confirmo-costo
```

- `--proveedor gemini|claude|ambos` (obligatorio con `--real`). Gemini usa
  `GEMINI_MODEL` (`gemini-3.5-flash-lite`); Claude, `IA_MODELO_CLAUDE` o
  `claude-haiku-4-5`. Para probar Sonnet: `IA_MODELO_CLAUDE=claude-sonnet-4-5`.
- `--tope N`: llamadas por uso y proveedor (1 a 30, por defecto 5). Con
  `--tope 30 --proveedor ambos` son 180 llamadas: **≈ USD 0,20** con la
  estimación de hoy (lo imprime antes de empezar).
- Claves: `GEMINI_API_KEY` y/o `ANTHROPIC_API_KEY`, del entorno o de
  `apps/web/.env.local`. Si falta la del proveedor pedido, el script falla
  claro **antes** de la primera llamada. Si un proveedor responde «sin
  crédito» o «clave inválida», se corta ese proveedor.
- Cada llamada real queda en `ia_llamadas` con `uso = 'prueba'` (si están
  `NEXT_PUBLIC_SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY`), así no se mezcla
  con el consumo de la app.
- No está programado en ningún cron ni workflow (lo fija un test).

## Qué mide cada métrica

### Flyers: acierto por campo

Para cada flyer se normaliza lo esperado y lo que devolvió el modelo, y se
compara campo por campo:

| campo | normalización | correcto si |
|---|---|---|
| fecha | `YYYY-MM-DD` en hora de Salta (acepta `31/10/2026`, ISO con o sin zona) | es el mismo día |
| hora | `HH:MM` 24 h (acepta `21 hs`, `21.30`, `9 pm`…). En la base, 00:00 = «sin hora» → se espera `null` | misma hora, o los dos `null` |
| lugar | minúsculas, sin tildes ni puntuación, `&` → `y` | similitud ≥ 0,8 con el venue o alguno de sus alias (igual, igual sin espacios, uno contiene al otro, mismas palabras sin «la/el/de/salta/club/peña…», o Dice de bigramas) |
| precio | número entero, `gratis` (0 o «entrada libre») o `null` (no se sabe; la base guarda 0 cuando no se sabe y `is_free` dice si es gratis) | igual |
| categoría | slug | igual (se informa aparte, no entra en el total) |

**Total** = % de aciertos sobre los 4 campos principales de todos los casos.
También se cuentan los casos «perfectos» (los 4 bien).

### Traducción: rúbrica de 0 a 4 (automática)

Un punto por criterio:

1. **Conserva**: los nombres propios (lugar, artistas y `nombres_a_conservar`)
   y **todos** los números del original (fechas, horas, precios; `$28.000` y
   `$28,000` cuentan igual) siguen en la traducción.
2. **Sin castellano**: menos del 5 % de las palabras son castellano (una
   lista de palabras que no existen en inglés: «de», «la», «noche»,
   «entrada», «sábado», «importado»…), sin contar los nombres a conservar,
   los #hashtags ni las @menciones.
3. **Largo razonable**: el largo total queda entre 0,6 y 1,6 veces el de la
   referencia (0,5–2 si la referencia es muy corta).
4. **Sin agregados**: no aparecen números ni URLs que no estaban, y si el
   evento no tiene descripción, `description_en` es `null`.

En el modo real además se informa cuántas respuestas pasan
`validarTraduccion` (el control de producción: si no pasa, el evento se
muestra en castellano con «(in Spanish)»).

### Clasificación

% de slugs correctos y la matriz de confusión resumida (los errores más
frecuentes, «esperado → obtenido (casos)»), más el acierto por categoría.

### Estimación de tokens y costo (modo en seco)

- Texto: caracteres / 4 (Gemini) o / 3,5 (Claude); los emojis y las letras
  «negrita» Unicode pesan 2 o 3. Se cuenta el prompt de sistema, el prompt y
  el esquema JSON.
- Imagen: tokens fijos por imagen de `precios.md` (Gemini 3: 1120; Claude:
  ancho × alto / 750 después de achicar → 1532 para 1080×1350).
- Claude con salida JSON usa una herramienta forzada: +313 tokens de entrada
  y +25 de salida.
- Salida: la respuesta esperada como JSON; en flyers se suponen 350
  caracteres de transcripción (`flyer_text`) y 45 de título.
- Costo por mes = costo promedio por llamada × llamadas por mes de
  `volumenes.json`.

Es una aproximación: el modo real imprime los tokens **medidos** por uso
para corregirla. El riesgo más grande es que Gemini 3.5 Flash-Lite «piense»
por defecto (los tokens de razonamiento se cobran como salida).

## Cómo leer el informe

1. **Fixtures**: si algo no pasa la validación, el script corta y lista los
   problemas.
2. **Tokens y costo**: por uso y por modelo, por llamada, por 1000 llamadas
   y por mes; y el total mensual de los tres usos.
3. **Línea de base sin gasto**: lo que la IA de producción ya había
   extraído de esos mismos flyers contra lo publicado (antes del 15/9/2026
   era `gemini-2.5-flash`; después, `gemini-3.5-flash-lite`). Es el número a
   batir en flyers.
4. **Autocontrol**: las métricas aplicadas a lo esperado contra sí mismo.
   Tiene que dar 100 % y 4/4; si no, el fixture o la métrica están mal.
5. En **--real**: las mismas tablas por modelo, más llamadas fallidas, tokens
   medidos y costo real de la corrida.

Ojo al leer:

- **30 casos**: cada caso es 3,3 puntos. Diferencias de 1 o 2 casos son
  ruido.
- **Lugar y categoría esperados pueden estar sesgados a favor de Gemini**:
  quien revisó partió de lo que propuso la IA y muchas veces lo dejó (por
  eso la línea de base da 100 % en lugar).
- **Hora**: varios flyers se publicaron con una hora que no está escrita en
  la imagen ni en el caption (quien revisó la conocía). El prompt pide no
  inventar la hora, así que esos casos los va a errar cualquier modelo
  (están marcados con `nota: "Caso difícil…"`).
- `flyer-29`: el caption dice «jueves 22» y quedó publicado el 23; puede ser
  un error de la revisión.

## Qué decisión ayuda a tomar y con qué umbrales

La decisión es, **por uso**, si cambiar el default de Gemini a Claude. Con la
estimación de hoy los dos cuestan poco (≈ USD 0,31/mes Gemini y ≈ USD 1,3/mes
Claude Haiku para los tres usos), así que **decide la calidad**, no el costo.
Correr primero `--real --proveedor ambos --tope 30 --confirmo-costo` (≈ USD
0,20) y después:

| uso | pasar a Claude si… | si no |
|---|---|---|
| **flyers** | el total (4 campos) de Claude supera al de Gemini por **≥ 5 puntos** (≥ 6 campos más de 120) **y** no es peor por más de 1 caso en fecha ni en hora | quedarse con Gemini |
| **traducción** | Claude pasa `validarTraduccion` en **≥ 90 %** y saca **≥ 3,5** de rúbrica, **y** Gemini no llega a esos dos números. Hoy esto es urgente: el 3/11 la corrida de producción descartó las 100 traducciones del día (0 traducidas) | quedarse con Gemini y revisar por qué descarta |
| **clasificación** | Claude acierta **≥ 3 casos más** de 30 (10 puntos). El volumen es mínimo: hoy no hay eventos sin categoría | quedarse con Gemini |

Si Haiku no alcanza en flyers, repetir solo ese uso con
`IA_MODELO_CLAUDE=claude-sonnet-4-5 … --uso flyers` (≈ 3 veces el costo de
Haiku; sigue siendo ≈ USD 3/mes con el volumen actual).

Hoy `IA_PROVEEDOR` elige un proveedor para **toda** la app. Elegir por uso
necesita un agregado chico en `lib/ia/seleccion.ts` (por ejemplo
`IA_PROVEEDOR_FLYERS`, `IA_PROVEEDOR_TRADUCCION`), que no está en este
ticket.

## Salida real del modo en seco (3/11/2026)

`npx tsx scripts/evaluar-ia.ts` desde `apps/web`, con los fixtures, precios y
volúmenes de esta carpeta:

```text
# Banco de evaluación de IA — en seco (no se llamó a ningún modelo)

Fixtures: 30 flyers, 30 traducciones, 30 clasificaciones (extraídos de producción el 2026-11-03). Formato y datos personales: OK.

## Pedidos armados con lib/ai (los mismos que manda la app)
| uso           | pedidos | con imagen | caracteres (prom., sistema + prompt) | maxTokens |
|---------------|---------|------------|--------------------------------------|-----------|
| Flyers        | 30      | 30         | 1.666                                | 4096      |
| Traducción    | 30      | 0          | 860                                  | 2048      |
| Clasificación | 30      | 0          | 368                                  | 256       |

## Tokens y costo estimados por llamada y por mes
Volúmenes de producción (últimos 30 días al 2026-11-03): 252 flyers, 274 traducciones, 40 clasificaciones por mes.

| uso           | modelo                   | tokens entrada | tokens salida | por llamada | por 1000   | por mes     |
|---------------|--------------------------|----------------|---------------|-------------|------------|-------------|
| Flyers        | gemini-3.5-flash-lite    | 2.063          | 136           | USD 0,00096 | USD 0,9587 | USD 0,2416  |
| Flyers        | claude-haiku-4-5         | 2.920          | 180           | USD 0,00382 | USD 3,82   | USD 0,9631  |
| Flyers        | claude-sonnet-4-5 (ref.) | 2.920          | 180           | USD 0,0115  | USD 11,47  | USD 2,89    |
| Traducción    | gemini-3.5-flash-lite    | 302            | 57            | USD 0,00023 | USD 0,2324 | USD 0,0637  |
| Traducción    | claude-haiku-4-5         | 655            | 90            | USD 0,00110 | USD 1,10   | USD 0,3027  |
| Traducción    | claude-sonnet-4-5 (ref.) | 655            | 90            | USD 0,00331 | USD 3,31   | USD 0,9081  |
| Clasificación | gemini-3.5-flash-lite    | 174            | 5             | USD 0,00006 | USD 0,0645 | USD 0,00258 |
| Clasificación | claude-haiku-4-5         | 509            | 31            | USD 0,00066 | USD 0,6628 | USD 0,0265  |
| Clasificación | claude-sonnet-4-5 (ref.) | 509            | 31            | USD 0,00199 | USD 1,99   | USD 0,0795  |

**Total mensual estimado (los tres usos):**

| modelo                | USD por mes | precio     |
|-----------------------|-------------|------------|
| gemini-3.5-flash-lite | USD 0,3079  | confirmado |
| claude-haiku-4-5      | USD 1,29    | confirmado |
| claude-sonnet-4-5     | USD 3,88    | referencia |

> Precios de docs/evaluacion-ia/precios.md: «verificar» = sin confirmar en la página oficial. Tokens por aproximación de caracteres (ver README).

## Línea de base sin gasto: lo que extrajo la IA de producción vs. lo publicado
|                       | casos | fecha          | hora           | lugar         | precio         | total (4 campos) | categoría      |
|-----------------------|-------|----------------|----------------|---------------|----------------|------------------|----------------|
| gemini-2.5-flash      | 7     | 71,4 % (5/7)   | 28,6 % (2/7)   | 100 % (7/7)   | 85,7 % (6/7)   | 71,4 % (20/28)   | 85,7 % (6/7)   |
| gemini-3.5-flash-lite | 23    | 65,2 % (15/23) | 65,2 % (15/23) | 100 % (23/23) | 95,7 % (22/23) | 81,5 % (75/92)   | 100 % (23/23)  |
| todos                 | 30    | 66,7 % (20/30) | 56,7 % (17/30) | 100 % (30/30) | 93,3 % (28/30) | 79,2 % (95/120)  | 96,7 % (29/30) |

## Autocontrol (lo esperado contra sí mismo: tiene que dar 100 % y 4/4)
|        | casos | fecha         | hora          | lugar         | precio        | total (4 campos) | categoría     |
|--------|-------|---------------|---------------|---------------|---------------|------------------|---------------|
| flyers | 30    | 100 % (30/30) | 100 % (30/30) | 100 % (30/30) | 100 % (30/30) | 100 % (120/120)  | 100 % (30/30) |

|             | casos | rúbrica (0–4) | 4 de 4        | conserva      | sin castellano | largo         | sin agregados | pasa validarTraduccion |
|-------------|-------|---------------|---------------|---------------|----------------|---------------|---------------|------------------------|
| referencias | 30    | 4             | 100 % (30/30) | 100 % (30/30) | 100 % (30/30)  | 100 % (30/30) | 100 % (30/30) | 100 % (30/30)          |

Clasificación: 100 % (30/30) correctas. Confusiones: ninguna.
```
