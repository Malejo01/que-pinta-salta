import { GoogleGenAI } from '@google/genai'
import { GeminiExtractionResult, GeminiCategorySlug } from './types'

// Obtener la API key
const apiKey = process.env.GEMINI_API_KEY
if (!apiKey) {
  console.warn('[Gemini AI] Advertencia: GEMINI_API_KEY no está configurada en las variables de entorno.')
}

// Inicializar el cliente oficial de Google Gen AI
const ai = new GoogleGenAI({ apiKey })

// Lista de categorías válidas según el catálogo de base de datos
const VALID_CATEGORIES: GeminiCategorySlug[] = [
  'penas',
  'humor',
  'infantil',
  'ballet',
  'recitales',
  'teatro',
  'boliches',
  'cine',
  'ferias',
  'talleres',
  'deportes',
  'congresos',
  'automovilismo',
  'espectaculos',
  'museos',
]

/**
 * Llama a la API de Gemini 2.5 Flash para extraer los datos estructurados del flyer.
 */
export async function extractEventFromFlyer(
  imageBuffer: Buffer,
  mimeType: string,
  caption: string | null,
  instagramUsername: string | null
): Promise<GeminiExtractionResult> {
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY no está configurada. Verifica las variables de entorno.')
  }

  // Construir el System Prompt dinámicamente inyectando el username del autor del post
  const systemInstruction = `Eres un asistente experto en la movida cultural de Salta, Argentina (Contexto temporal: Julio 2026). Tu misión es extraer datos de eventos a partir de imágenes y descripciones de Instagram.

REGLAS CRÍTICAS:
- MODO CIEGO: Muchas veces la imagen es solo una persona o la miniatura de un video. Si la imagen no contiene texto claro, extrae TODA la información exclusivamente de la descripción (caption).
- LUGAR POR DEFECTO: El post fue publicado por la cuenta de Instagram: @${instagramUsername || 'desconocido'}. Si el texto o la imagen no especifican dónde es la fiesta, asume obligatoriamente que el evento es en el local de esa cuenta (ej. si publica @lametro, el lugar es 'La Metro').
- FIESTAS NÓMADES: Las fiestas 'La Fresh', 'Bresh', 'Party is dead' y 'Sex us Machina' son itinerantes. Si detectas estos nombres, es obligatorio buscar minuciosamente en el texto en qué boliche o salón se realizan esa noche en particular.
- FECHAS RELATIVAS: Si dice 'Hoy', usa la fecha de publicación del post. Si dice 'Mañana', suma un día. No dejes la fecha en null si se puede deducir.`

  // Convertir el buffer de imagen a base64
  const base64Image = imageBuffer.toString('base64')

  try {
    // Configurar la llamada forzando el formato JSON estricto
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [
        {
          inlineData: {
            data: base64Image,
            mimeType: mimeType,
          },
        },
        `Texto descriptivo de la publicación (Caption):\n${caption || 'Sin texto descriptivo.'}`,
      ],
      config: {
        systemInstruction: systemInstruction,
        temperature: 0.1, // Baja temperatura para reducir alucinaciones y ser más factual
        responseMimeType: 'application/json',
        responseSchema: {
          type: 'OBJECT',
          properties: {
            title: {
              type: 'STRING',
              description: 'Título descriptivo y conciso del evento o fiesta. Evitar frases de marketing.',
            },
            date: {
              type: 'STRING',
              description: 'Fecha del evento en formato YYYY-MM-DD. Si no se puede determinar con absoluta certeza basándose en la imagen, el texto o la fecha actual (Julio 2026), poner null.',
            },
            start_time: {
              type: 'STRING',
              description: 'Hora de inicio del evento en formato HH:MM (ej. 21:00, 00:30, 23:45). Si no está explícito, poner null.',
            },
            price: {
              type: 'INTEGER',
              description: 'Precio numérico de la entrada general. Si se menciona que es gratis, free access, entrada libre, poner 0. Si no se especifica el precio o dice "consultar", poner null.',
            },
            venue_name: {
              type: 'STRING',
              description: 'Nombre del lugar o establecimiento físico donde ocurre el evento (ej. La Metro, Usina Cultural, Balderrama, etc.).',
            },
            category_slug: {
              type: 'STRING',
              description: 'La categoría del evento. Debe ser obligatoriamente uno de los siguientes valores exactos.',
              enum: VALID_CATEGORIES,
            },
            artists: {
              type: 'ARRAY',
              items: { type: 'STRING' },
              description: 'Lista de nombres de bandas, solistas, DJs, comediantes o invitados especiales que participan.',
            },
          },
          required: [
            'title',
            'date',
            'start_time',
            'price',
            'venue_name',
            'category_slug',
            'artists',
          ],
        },
      },
    })

    const responseText = response.text
    if (!responseText) {
      throw new Error('La respuesta de Gemini está vacía.')
    }

    const parsed = JSON.parse(responseText) as GeminiExtractionResult
    return parsed
  } catch (error) {
    console.error('[Gemini AI] Error llamando a Gemini:', error)
    throw error
  }
}
