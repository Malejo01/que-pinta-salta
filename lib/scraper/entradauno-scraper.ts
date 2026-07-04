import slugify from 'slugify';
import { saveEventsToSupabase, type SaveResult } from './save-to-supabase';
import type { Event } from '../types';

const CARTELERA_JSON_URL = 'https://s3.sa-east-1.amazonaws.com/contenido.general.entradauno/cache/12/cartelera.json';

// Categorías comerciales prioritarias para monetización/Google Ads
const COMMERCIAL_CATEGORIES = new Set(['recitales', 'teatro', 'humor', 'deportes', 'espectaculos']);

/**
 * Detecta si el evento es realmente gratis analizando título y descripción
 */
function isTextFree(title: string, description: string): boolean {
  const text = `${title} ${description}`.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return /gratis|gratuito|entrada libre|sin costo|libre y gratuit/.test(text);
}

/**
 * Retorna la mejor imagen disponible para el evento (prioriza resoluciones altas sobre miniaturas)
 */
function getBestImage(rawEvent: any): string {
  const images = rawEvent.listaImagen || [];
  
  // Preferencias de etiquetas de imagen
  const tagsPreference = ['WEB_DESTACADO', 'WEB_CARRUSEL_CHICO', 'WEB_CARRUSEL_GRANDE', 'WEB_TOP', 'MAIL_TOP'];
  
  for (const tag of tagsPreference) {
    const found = images.find((img: any) => img.listaIdEtiqueta?.includes(tag));
    if (found && found.cUri) {
      return found.cUri;
    }
  }
  
  // Si no se encuentra ninguna imagen etiquetada, usar los fallbacks en este orden:
  if (rawEvent.cImagenBanner) return rawEvent.cImagenBanner;
  if (rawEvent.cImagenEquityBanner) return rawEvent.cImagenEquityBanner;
  if (rawEvent.cImagenBannerMovil) return rawEvent.cImagenBannerMovil;
  if (rawEvent.cImagenEquityThumb) return rawEvent.cImagenEquityThumb;
  
  return '';
}

/**
 * Infiere la categoría basada en palabras clave del título del evento
 */
function inferCategory(nombre: string): string {
  const n = nombre.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  if (/recital|concierto|show\b|banda\b|tour\b|homenaje|tributo|rock|metal|pop|folklore|cumbia/.test(n)) return 'recitales';
  if (/ballet|danza/.test(n))                                  return 'teatro'; // Agrupar danza/ballet en teatro o categoria general
  if (/stand.?up|standup|comedia|humor|monolo/.test(n))         return 'teatro'; // Teatro/Humor es comercial
  if (/infantil|niños|para chicos|titeres|magia|circo/.test(n))  return 'teatro'; // Infantil comercial
  if (/teatro|obra\b|drama|tragicomedia/.test(n))              return 'teatro';
  if (/deport|futbol|basket|tenis|maraton|ciclismo/.test(n))   return 'deportes';
  if (/museo|arqueolog|antropolog|visita|exposi/.test(n))      return 'cine'; // O cine/otros si no es masivo
  return 'teatro'; // Valor por defecto
}

/**
 * Limpia y decodifica el HTML de la descripción
 */
function cleanDescription(encoded: string): { description: string; short_description: string } {
  if (!encoded) return { description: '', short_description: '' };
  try {
    const html = decodeURIComponent(encoded);
    const text = html
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n')
      .replace(/<[^>]+>/g, '') // Quitar etiquetas HTML
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#039;/g, "'")
      .replace(/\n{3,}/g, '\n\n')
      .trim();

    return {
      description: text,
      short_description: text.substring(0, 160) + (text.length > 160 ? '...' : '')
    };
  } catch {
    return { description: '', short_description: '' };
  }
}

/**
 * Normaliza las fechas del formato API de EntradaUno a formato ISO
 */
function toISO(isoString: string): string {
  return isoString.includes('T') ? isoString : `${isoString}T00:00:00`;
}

/**
 * Scrapea los eventos de EntradaUno haciendo un fetch directo a su S3 JSON.
 * Filtra los eventos de Salta, detecta comerciales y los inserta/actualiza en Supabase.
 */
export async function scrapeEntradaUno(): Promise<SaveResult> {
  const accumulated: SaveResult = { inserted: 0, skipped: 0, errors: [] };

  try {
    console.log('[entradauno] Obteniendo cartelera desde CDN S3...');
    const res = await fetch(CARTELERA_JSON_URL, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json'
      },
      next: { revalidate: 0 } // Desactivar cache en Next.js
    });

    if (!res.ok) {
      throw new Error(`Error HTTP ${res.status}: ${res.statusText}`);
    }

    const payload = await res.json();
    const oCartelera = payload.oData?.oCartelera;
    if (!oCartelera) {
      throw new Error('Estructura de cartelera no válida en JSON de EntradaUno');
    }

    const rawEvents = oCartelera.listaEspectaculoCartel || [];
    const rawVenues = oCartelera.listaEstablecimiento || [];
    
    console.log(`[entradauno] Recibidos ${rawEvents.length} eventos y ${rawVenues.length} establecimientos en total.`);

    // 1. Filtrar establecimientos de Salta
    // - cZona === 'Salta'
    // - idProvincia === 16 (Provincia de Salta en el sistema de EntradaUno)
    const saltaVenues = rawVenues.filter((v: any) => 
      (v.cZona && v.cZona.toLowerCase().trim() === 'salta') ||
      (v.idProvincia === 16)
    );
    
    const saltaVenueIds = new Set(saltaVenues.map((v: any) => v.idEstablecimiento));
    const venueMap = new Map(saltaVenues.map((v: any) => [v.idEstablecimiento, v]));

    console.log(`[entradauno] Filtrados ${saltaVenues.length} establecimientos en Salta.`);

    // 2. Filtrar y procesar eventos asociados a los venues de Salta
    const eventsToSave: Partial<Omit<Event, 'venue'> & { venue?: string }>[] = [];

    for (const rawEvent of rawEvents) {
      const eventVenueIds = rawEvent.listaIdEstablecimiento || [];
      const belongsToSalta = eventVenueIds.some((id: number) => saltaVenueIds.has(id));

      if (!belongsToSalta) continue;

      // Obtener el primer venue asociado
      const primaryVenueId = eventVenueIds.find((id: number) => saltaVenueIds.has(id));
      const venueObj: any = venueMap.get(primaryVenueId);
      const venueName = venueObj ? venueObj.cNombre : 'Salta';

      // Fechas y funciones
      const functions = (rawEvent.oFuncionLista ?? [])
        .filter((f: any) => f.dFuncion)
        .sort((a: any, b: any) => a.dFuncion.localeCompare(b.dFuncion));

      if (functions.length === 0 && !rawEvent.oFuncionMenor) {
        console.warn(`[entradauno] Saltando "${rawEvent.cNombre}": sin funciones/fecha.`);
        continue;
      }

      const start_date = functions.length > 0
        ? toISO(functions[0].dFuncion)
        : toISO(rawEvent.oFuncionMenor.oFuncionFecha.dFuncion);

      const end_date = functions.length > 1
        ? toISO(functions[functions.length - 1].dFuncion)
        : null;

      // Clasificación e inferencia comercial
      const categorySlug = inferCategory(rawEvent.cNombre);
      const isCommercial = COMMERCIAL_CATEGORIES.has(categorySlug);

      // Limpieza de descripción
      const { description, short_description } = cleanDescription(
        rawEvent.cDescripcion || rawEvent.cDescripcion_l172
      );

      // Slug
      const slug = slugify(rawEvent.cNombre, { lower: true, strict: true });

      // Link directo de compra
      const ticketUrl = `https://entradauno.com/landing/${rawEvent.cSeo}` +
        `?idEspectaculoCartel=${rawEvent.idEspectaculoCartel}` +
        `&cHashValidacion=${rawEvent.cHashValidacion}`;

      // Imagen
      const image_url = getBestImage(rawEvent);

      const price_min = rawEvent.fPrecioDesde ?? 0;
      const is_free = price_min === 0 && isTextFree(rawEvent.cNombre, description || '');

      eventsToSave.push({
        title: rawEvent.cNombre.trim(),
        slug,
        description: description || null,
        short_description: short_description || null,
        category_id: categorySlug, // Se resuelve en saveEventsToSupabase
        venue: venueName,
        start_date,
        end_date,
        is_free,
        price_min,
        ticket_url: ticketUrl,
        image_url: image_url || null,
        is_commercial: isCommercial,
        gallery_urls: [],
        tags: ['entradauno', 'scraped']
      });
    }

    if (eventsToSave.length === 0) {
      console.log('[entradauno] Ningún evento de Salta encontrado para procesar.');
      return accumulated;
    }

    console.log(`[entradauno] Guardando ${eventsToSave.length} evento(s) en Supabase...`);
    
    // Guardar en base de datos usando el cargador consolidado (que ahora incluye de-duplicación)
    const result = await saveEventsToSupabase(eventsToSave, 'entradauno');
    accumulated.inserted += result.inserted;
    accumulated.skipped += result.skipped;
    accumulated.errors.push(...result.errors);

    console.log(
      `[entradauno] Proceso finalizado. Insertados: ${accumulated.inserted}, ` +
      `Fucionados/Saltados: ${accumulated.skipped}, Errores: ${accumulated.errors.length}`
    );

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[entradauno] Error fatal en scraper:', msg);
    accumulated.errors.push(msg);
  }

  return accumulated;
}
