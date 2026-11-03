# Precios de IA — fuentes oficiales

Consultado el **2026-11-03** (G-2, Gemini). Precios en USD por millón de tokens (MTok), tarifa estándar de pago. Lo que no se encontró en la página oficial queda vacío; no se estimó nada.

## Fuentes oficiales

- Gemini API: https://ai.google.dev/gemini-api/docs/pricing (consultada 2026-11-03)
- Claude API: https://platform.claude.com/docs/en/about-claude/pricing (consultada 2026-11-03)

## Modelo que usa QPS

`GEMINI_MODEL = 'gemini-3.5-flash-lite'` en `apps/web/lib/ai/gemini.ts:14`.

## Tabla

| Modelo | Entrada (texto) | Entrada (imagen) | Salida (incl. razonamiento) | Imagen generada | Con caché (lectura) | Batch (entrada / salida) |
|---|---|---|---|---|---|---|
| **Gemini 3.5 Flash-Lite** (`gemini-3.5-flash-lite`, el de QPS) | 0,30 | 0,30 | 2,50 | | 0,03 | 0,15 / 1,25 |
| Claude Haiku 4.5 | 1,00 | 1,00 | 5,00 | | 0,10 | |
| Claude Sonnet 5 | 2,00 | 2,00 | 10,00 | | 0,20 | |
| Claude Sonnet 4.6 | 3,00 | 3,00 | 15,00 | | 0,30 | |
| Claude Sonnet 4.5 | 3,00 | 3,00 | 15,00 | | 0,30 | |

## Notas

- **Imágenes de entrada (flyers):** en ambos proveedores se cobran como tokens de entrada, al mismo precio que el texto. Para Gemini 3.5 Flash-Lite la página dice «$0.30 (text / image / video / audio)». Para Claude, la página habla de «billed as image input» y remite a su sección de Vision.
- **Cantidad de tokens por imagen:** no se tomó de las páginas de precios. Vacío; hay que medirlo con una llamada real o con el contador de tokens de cada API.
- **Imagen generada:** QPS no genera imágenes. Para Gemini la página lista modelos de imagen aparte (p. ej. Gemini 3.1 Flash Image); no se incluyen porque QPS no los usa. Claude no tiene precio de generación de imágenes en la página: vacío.
- **Capa gratuita:** Gemini 3.5 Flash-Lite tiene capa gratuita («Free of charge») pero con «Used to improve our products: Yes». La capa de pago es «No». Importante para los flyers de usuarios.
- **Caché (lectura):** Gemini 3.5 Flash-Lite 0,03; la página agrega 1,00 USD por millón de tokens por hora de almacenamiento.
- **Tokenizador de Claude:** la página aclara que Claude 4.7 y posteriores usan un tokenizador que produce ~30 % más tokens para el mismo texto. Sonnet 4.6 y anteriores, Haiku 4.5 y Sonnet 4.5 usan el anterior. Sonnet 5 es posterior a 4.7, así que su precio por token puede salir más caro por texto de lo que sugiere la tabla (no medido).
- **Precios con fecha de cambio:** en la página de Gemini otros modelos (p. ej. algunas filas de Gemini 3.x Flash/Pro) tienen precios «hasta el 30 de noviembre de 2026» y otros distintos desde el 1 de diciembre; **el de Gemini 3.5 Flash-Lite no mostró esa distinción** en la consulta. Reverificar antes de decidir.
- **Comparación rápida** (sólo aritmética sobre la tabla): por la misma cantidad de tokens, Haiku 4.5 sale ≈ 3,3× más caro en entrada y 2× en salida que Gemini 3.5 Flash-Lite.
