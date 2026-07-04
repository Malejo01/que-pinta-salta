import * as cheerio from 'cheerio';
import type { Event } from '../types';

export const VAMOS_BASE_URL = 'https://www.vamos.gob.ar';
const CARTELERA_API = 'https://api-ecommerce-live-salta.entradauno.com/v1/api/v2/Cartelera';

// Headers requeridos por la API de EntradaUno (Salta)
const API_HEADERS: Record<string, string> = {
  'origin':                 'https://www.vamos.gob.ar',
  'referer':                'https://www.vamos.gob.ar/',
  'accept':                 'application/json, text/plain, */*',
  'accept-language':        'es-ES,es;q=0.9',
  'user-agent':             'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  'xe1-devicefingerprint':  'b27f82310d0afbd238501dd2e5ba489f',
  'e1-cc':                  'null',
  'cdevicefingerprint':     'b27f82310d0afbd238501dd2e5ba489f',
  'xp1_devicefingerprint':  'b27f82310d0afbd238501dd2e5ba489f',
};

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

// ─── Tipos de la API ───────────────────────────────────────────────────────

type ApiFuncion = {
  idFuncion: number;
  idEstablecimiento: number;
  dFuncion: string;      // ISO datetime start
  dFuncionHasta: string; // ISO datetime end
};

type ApiEvento = {
  idEspectaculoCartel: number;
  idEspectaculoCartelTipo: number;
  listaIdEspectaculoCartelCategoria: number[];
  cNombre: string;
  cDescripcion: string;          // URL-encoded HTML
  cDescripcion_l172: string;     // URL-encoded HTML short
  cSeo: string;
  cHashValidacion: string;
  fPrecioDesde: number;
  cImagenEquityThumb: string;
  cImagenBanner: string;
  cImagenEquityBanner: string;
  cWebUri: string;
  oFuncionMenor: { oFuncionFecha: { dFuncion: string } } | null;
  oFuncionLista: ApiFuncion[] | null;
  listaIdEstablecimiento: number[];
  nCantidadFunciones: number;
};

type ApiEstablecimiento = {
  idEstablecimiento: number;
  cNombre: string;
  cDomicilio: string;
  cSeo: string;
  cGoogleMapTag: string | null;
};

type ApiResponse = {
  nCode: number;
  oData: {
    oCartelera: {
      listaEspectaculoCartel: ApiEvento[];
      listaEstablecimiento: ApiEstablecimiento[];
    };
  };
};

// ─── Tipo de salida normalizado ────────────────────────────────────────────

export type VamosEventNormalized = {
  title: string;
  description: string;
  short_description: string;
  category_id: string;
  venue_name: string;
  venue_address: string;
  start_date: string;
  end_date: string | null;
  price_min: number;
  is_free: boolean;
  ticket_url: string;
  image_url: string;
};

// ─── Mapeo de categorías por keywords del nombre ───────────────────────────

export function inferVamosCategory(nombre: string): string {
  const n = nombre.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  if (/recital|concierto|show\b|banda\b|tour\b/.test(n))      return 'recitales';
  if (/ballet|danza/.test(n))                                  return 'ballet';
  if (/stand.?up|standup|comedia/.test(n))                     return 'humor';
  if (/humor/.test(n))                                         return 'humor';
  if (/infantil|niños|para chicos|topa\b|magia|circo/.test(n)) return 'infantil';
  if (/teatro|obra\b|drama|tragicomedia|monolo/.test(n))       return 'teatro';
  if (/deport|futbol|basket|tenis|maraton|ciclismo/.test(n))   return 'deportes';
  if (/museo|arqueolog|antropolog|vid\s*y\s*el\s*vino|explora/.test(n)) return 'espectaculos';
  return 'espectaculos';
}

// ─── Decode descripción HTML URL-encoded ──────────────────────────────────

function decodeHtmlDescription(encoded: string): { description: string; short_description: string } {
  if (!encoded) return { description: '', short_description: '' };
  try {
    const html = decodeURIComponent(encoded);
    // Strip HTML tags
    const text = html
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n')
      .replace(/<[^>]+>/g, '')
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
      short_description: text.slice(0, 160),
    };
  } catch {
    return { description: '', short_description: '' };
  }
}

// ─── Helpers de fecha ─────────────────────────────────────────────────────

function toISO(isoString: string): string {
  // La API devuelve "2026-05-27T11:00:00" — ya es ISO, solo normalizar
  return isoString.includes('T') ? isoString : `${isoString}T00:00:00`;
}

// ─── Fetch de la API ───────────────────────────────────────────────────────

/**
 * Llama a la API de EntradaUno y retorna todos los eventos de la cartelera
 * junto con el mapa de establecimientos (venues).
 */
export async function fetchVamosCartelera(): Promise<{
  eventos: ApiEvento[];
  venues: Map<number, ApiEstablecimiento>;
}> {
  const res = await fetch(CARTELERA_API, { headers: API_HEADERS });
  if (!res.ok) {
    throw new Error(`[vamos] API respondió ${res.status}: ${res.statusText}`);
  }

  const data: ApiResponse = await res.json();
  if (data.nCode !== 200) {
    throw new Error(`[vamos] API nCode=${data.nCode}`);
  }

  const { listaEspectaculoCartel, listaEstablecimiento } = data.oData.oCartelera;

  const venueMap = new Map<number, ApiEstablecimiento>();
  for (const v of listaEstablecimiento) {
    venueMap.set(v.idEstablecimiento, v);
  }

  return { eventos: listaEspectaculoCartel, venues: venueMap };
}

// ─── Normalización de un evento ───────────────────────────────────────────

/**
 * Convierte un evento de la API al formato interno del scraper.
 * Retorna null si no hay fecha válida.
 */
export function normalizeVamosEvento(
  evento: ApiEvento,
  venues: Map<number, ApiEstablecimiento>
): VamosEventNormalized | null {
  // ── Fechas ──
  const funciones = (evento.oFuncionLista ?? [])
    .filter(f => f.dFuncion)
    .sort((a, b) => a.dFuncion.localeCompare(b.dFuncion));

  if (funciones.length === 0 && !evento.oFuncionMenor) return null;

  const start_date = funciones.length > 0
    ? toISO(funciones[0].dFuncion)
    : toISO(evento.oFuncionMenor!.oFuncionFecha.dFuncion);

  const end_date = funciones.length > 1
    ? toISO(funciones[funciones.length - 1].dFuncion)
    : null;

  // ── Venue ──
  const venueId = evento.listaIdEstablecimiento?.[0] ?? 0;
  const venue = venues.get(venueId);
  const venue_name = venue?.cNombre ?? '';
  const venue_address = venue?.cDomicilio ?? '';

  // ── Descripción ──
  const { description, short_description } = decodeHtmlDescription(
    evento.cDescripcion || evento.cDescripcion_l172
  );

  // ── Categoría ──
  const category_id = inferVamosCategory(evento.cNombre);

  // ── Precio ──
  const price_min = evento.fPrecioDesde ?? 0;
  const is_free = price_min === 0 && isTextFree(evento.cNombre, description || '');

  // ── Imagen ──
  const image_url = getBestImage(evento);

  // ── URL de landing ──
  const ticket_url = `${VAMOS_BASE_URL}/landing/${evento.cSeo}` +
    `?idEspectaculoCartel=${evento.idEspectaculoCartel}` +
    `&cHashValidacion=${evento.cHashValidacion}`;

  return {
    title: evento.cNombre.trim(),
    description,
    short_description,
    category_id,
    venue_name,
    venue_address,
    start_date,
    end_date,
    price_min,
    is_free,
    ticket_url,
    image_url,
  };
}
