import { createAdminClient } from '@/lib/supabase/server';
import { MovieShowings } from '@/lib/types';
import * as cheerio from 'cheerio';

/**
 * Generates a clean URL-friendly slug from a raw movie title
 */
export function normalizeMovieTitle(title: string): string {
  // 1. Quitar contenido entre paréntesis y corchetes (ej: (Doblada), [Subtitulado])
  let cleaned = title.replace(/\(.*?\)/g, '').replace(/\[.*?\]/g, '');

  // 2. Normalizar a minúsculas y quitar acentos
  cleaned = cleaned
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  // 3. Quitar modificadores técnicos y palabras clave comunes de cartelera
  const modifiers = [
    /\b2d\b/g,
    /\b3d\b/g,
    /\bxd\b/g,
    /\bdbox\b/g,
    /\bd-box\b/g,
    /\bhd\b/g,
    /\bcastellano\b/g,
    /\bcast\b/g,
    /\bdoblada\b/g,
    /\bdob\b/g,
    /\bsubtitulada\b/g,
    /\bsubt\b/g,
    /\bsub\b/g,
    /\bpreestreno\b/g,
    /\bpre-estreno\b/g,
    /\blive action\b/g,
  ];

  for (const mod of modifiers) {
    cleaned = cleaned.replace(mod, '');
  }

  // 4. Convertir a slug (caracteres no alfanuméricos -> guiones)
  cleaned = cleaned
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');

  // Quitar guiones al principio y final
  cleaned = cleaned.replace(/^-+|-+$/g, '');

  return cleaned;
}

/**
 * Format raw movie titles for cleaner, premium client display
 */
export function cleanMovieTitleForDisplay(title: string): string {
  let cleaned = title.replace(/\(.*?\)/g, '').replace(/\[.*?\]/g, '');
  
  // Quitar modificadores técnicos
  const modifiers = [
    /\b2d\b/gi,
    /\b3d\b/gi,
    /\bxd\b/gi,
    /\bdbox\b/gi,
    /\bd-box\b/gi,
    /\bhd\b/gi,
    /\bcastellano\b/gi,
    /\bcast\b/gi,
    /\bdoblada\b/gi,
    /\bdob\b/gi,
    /\bsubtitulada\b/gi,
    /\bsubt\b/gi,
    /\bsub\b/gi,
    /\bpreestreno\b/gi,
    /\bpre-estreno\b/gi,
    /\blive action\b/gi,
  ];

  for (const mod of modifiers) {
    cleaned = cleaned.replace(mod, '');
  }

  cleaned = cleaned.replace(/\s+/g, ' ').trim();

  // Convertir a capitales apropiadas en español
  return cleaned
    .toLowerCase()
    .split(' ')
    .map(word => {
      if (word.length === 0) return '';
      const minorWords = ['y', 'de', 'el', 'la', 'los', 'las', 'en', 'con', 'para', 'por', 'un', 'una', 'al', 'del'];
      if (minorWords.includes(word)) return word;
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(' ')
    .replace(/^\w/, c => c.toUpperCase());
}

/**
 * Scrapes Cinemark structured MovieTheater LD+JSON for a given kompleks
 */
async function scrapeCinemark(
  url: string,
  cinemaKey: string,
  cinemaName: string,
  todayStr: string,
  addMovieShowing: (
    rawTitle: string,
    posterUrl: string,
    cinemaKey: string,
    cinemaName: string,
    bookingUrl: string,
    formatType: string,
    time: string
  ) => void
) {
  console.log(`[cinema-scraper] Fetching Cinemark page: ${url}`);
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
      'Accept-Language': 'es-ES,es;q=0.9'
    },
    next: { revalidate: 0 }
  });
  
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  }
  
  const html = await res.text();
  const $ = cheerio.load(html);

  let movieTheaterJson: any = null;
  $('script[type="application/ld+json"]').each((i, el) => {
    try {
      const parsed = JSON.parse($(el).text());
      const objects = Array.isArray(parsed) ? parsed : [parsed];
      for (const obj of objects) {
        if (obj?.['@type'] === 'MovieTheater') {
          movieTheaterJson = obj;
          break;
        }
      }
    } catch (e) {
      // Ignorar JSON inválidos en scripts
    }
  });

  if (!movieTheaterJson) {
    console.warn(`[cinema-scraper] MovieTheater JSON-LD no encontrado para ${cinemaName}`);
    return;
  }

  const events = movieTheaterJson.event || [];
  console.log(`[cinema-scraper] Encontrados ${events.length} eventos en ${cinemaName}`);

  for (const event of events) {
    const rawTitle = event.workPresented?.name;
    const posterUrl = event.workPresented?.image || '';
    const videoFormat = event.videoFormat || '2D';
    const bookingUrl = event.offers?.url || url;
    const startDateStr = event.startDate;

    if (!rawTitle || !startDateStr) continue;

    // Extraer fecha y hora en formato seguro
    const match = startDateStr.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/);
    if (!match) continue;

    const showDate = match[1];
    const showTime = match[2];

    // Filtrar solo para el día de hoy
    if (showDate !== todayStr) continue;

    // Detectar idioma
    const upperTitle = rawTitle.toUpperCase();
    const isSub = upperTitle.includes('SUB') || upperTitle.includes('ORIGINAL');
    const langSuffix = isSub ? 'Subtitulada' : 'Doblada';
    const formatType = `${videoFormat} ${langSuffix}`;

    addMovieShowing(
      rawTitle,
      posterUrl,
      cinemaKey,
      cinemaName,
      bookingUrl,
      formatType,
      showTime
    );
  }
}

/**
 * Scrapes Cine Ópera REST API for movie lists and showtimes
 */
async function scrapeCineOpera(
  todayStr: string,
  addMovieShowing: (
    rawTitle: string,
    posterUrl: string,
    cinemaKey: string,
    cinemaName: string,
    bookingUrl: string,
    formatType: string,
    time: string
  ) => void
) {
  console.log('[cinema-scraper] Obteniendo cartelera de Cine Ópera...');
  const playingRes = await fetch('https://apiv2.gaf.adro.studio/nowPlaying/84', {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    },
    next: { revalidate: 0 }
  });
  
  if (!playingRes.ok) {
    throw new Error(`HTTP ${playingRes.status} al obtener nowPlaying`);
  }
  
  const playingJson = await playingRes.json();
  if (playingJson.status !== 'ok' || !Array.isArray(playingJson.data)) {
    throw new Error('Estructura de respuesta no válida en Cine Ópera nowPlaying API');
  }

  const movies = playingJson.data;
  console.log(`[cinema-scraper] Encontradas ${movies.length} películas en cartelera de Cine Ópera.`);

  for (const movie of movies) {
    const pref = movie.pref;
    const rawTitle = movie.nombre;
    const posterUrl = movie.poster?.path || '';

    if (!pref || !rawTitle) continue;

    console.log(`[cinema-scraper] Obteniendo horarios para Cine Ópera: ${rawTitle} (${pref})...`);
    try {
      const detailRes = await fetch(`https://apiv2.gaf.adro.studio/movie/84/${pref}`, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        next: { revalidate: 0 }
      });
      
      if (!detailRes.ok) {
        console.error(`[cinema-scraper] Error al obtener detalles de pref ${pref}: HTTP ${detailRes.status}`);
        continue;
      }
      
      const detailJson = await detailRes.json();
      if (detailJson.status !== 'ok' || !detailJson.data || !Array.isArray(detailJson.data.showtimes)) {
        console.warn(`[cinema-scraper] No se encontraron horarios para: ${rawTitle}`);
        continue;
      }

      const showtimes = detailJson.data.showtimes;
      const bookingUrl = `https://cineopera.com.ar/pelicula/84/${pref}`;

      for (const showtime of showtimes) {
        const dateStr = showtime.fechaHora?.date;
        if (!dateStr) continue;

        const match = dateStr.match(/^(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2})/);
        if (!match) continue;

        const showDate = match[1];
        const showTime = match[2];

        // Filtrar solo para el día de hoy
        if (showDate !== todayStr) continue;

        const isSub = showtime.lenguaje?.toUpperCase().includes('SUB') || showtime.lenguaje?.toUpperCase().includes('ORIG');
        const langSuffix = isSub ? 'Subtitulada' : 'Doblada';
        const formatType = `${showtime.formato || '2D'} ${langSuffix}`;

        addMovieShowing(
          rawTitle,
          posterUrl,
          'cine_opera',
          'Cine Ópera',
          bookingUrl,
          formatType,
          showTime
        );
      }
    } catch (err) {
      console.error(`[cinema-scraper] Error procesando película de Cine Ópera: ${rawTitle}`, err);
    }
  }
}

/**
 * Checks if a poster URL is valid (HTTP 200 and not empty/placeholder)
 */
async function isPosterUrlValid(url: string): Promise<boolean> {
  if (!url || url.includes('no-image') || url.trim() === '') return false;
  try {
    const res = await fetch(url, { method: 'HEAD', headers: { 'User-Agent': 'Mozilla/5.0' } });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Runs the scraper for all 3 cinemas, aggregates showtimes, upserts to DB and soft-deletes inactive listings
 */
export async function runCinemaScrapeAndSync() {
  const supabase = createAdminClient();
  
  // Calcular la fecha de hoy en Salta (UTC-3)
  const now = new Date();
  const saltaTime = new Date(now.toLocaleString("en-US", { timeZone: "America/Argentina/Salta" }));
  const todayStr = saltaTime.getFullYear() + '-' + 
    String(saltaTime.getMonth() + 1).padStart(2, '0') + '-' + 
    String(saltaTime.getDate()).padStart(2, '0');

  console.log(`[cinema-scraper] Iniciando scraper de cines para el día: ${todayStr}`);

  // Mapa para consolidar: slug -> { title, poster_url, showings: {} }
  const consolidatedMovies: Record<string, {
    title: string;
    poster_url: string;
    showings: MovieShowings;
  }> = {};

  // Función interna para acumular horarios
  function addMovieShowing(
    rawTitle: string,
    posterUrl: string,
    cinemaKey: string,
    cinemaName: string,
    bookingUrl: string,
    formatType: string,
    time: string
  ) {
    const slug = normalizeMovieTitle(rawTitle);
    if (!slug) return;

    if (!consolidatedMovies[slug]) {
      consolidatedMovies[slug] = {
        title: cleanMovieTitleForDisplay(rawTitle),
        poster_url: posterUrl,
        showings: {}
      };
    }

    const movie = consolidatedMovies[slug];
    
    // Si obtenemos una mejor imagen de portada, actualizarla (dar prioridad a Cinemark CDN o si estaba vacía)
    if (posterUrl) {
      if (!movie.poster_url || movie.poster_url.includes('no-image')) {
        movie.poster_url = posterUrl;
      } else if (posterUrl.includes('cinemark.com.ar') && !movie.poster_url.includes('cinemark.com.ar')) {
        movie.poster_url = posterUrl;
      }
    }

    if (!movie.showings[cinemaKey]) {
      movie.showings[cinemaKey] = {
        name: cinemaName,
        booking_url: bookingUrl,
        formats: []
      };
    }

    const cinema = movie.showings[cinemaKey];
    let format = cinema.formats.find(f => f.type === formatType);
    if (!format) {
      format = { type: formatType, times: [] };
      cinema.formats.push(format);
    }

    if (!format.times.includes(time)) {
      format.times.push(time);
    }
  }

  // 1. Scrapear Cinemark Alto NOA
  try {
    await scrapeCinemark(
      'https://www.cinemark.com.ar/cartelera/saltaaltonoa',
      'cinemark_altonoa',
      'Cinemark Alto NOA',
      todayStr,
      addMovieShowing
    );
  } catch (err) {
    console.error('[cinema-scraper] Error en Cinemark Alto NOA:', err);
  }

  // 2. Scrapear Cinemark Paseo Salta
  try {
    await scrapeCinemark(
      'https://www.cinemark.com.ar/cartelera/saltahiperlibertad',
      'cinemark_paseosalta',
      'Cinemark Paseo Salta',
      todayStr,
      addMovieShowing
    );
  } catch (err) {
    console.error('[cinema-scraper] Error en Cinemark Paseo Salta:', err);
  }

  // 3. Scrapear Cine Opera
  try {
    await scrapeCineOpera(
      todayStr,
      addMovieShowing
    );
  } catch (err) {
    console.error('[cinema-scraper] Error en Cine Ópera:', err);
  }

  // Ordenar los horarios cronológicamente para cada formato
  for (const slug in consolidatedMovies) {
    const movie = consolidatedMovies[slug];
    for (const cinemaKey in movie.showings) {
      const cinema = movie.showings[cinemaKey];
      cinema.formats.forEach(f => {
        f.times.sort();
      });
    }
  }

  // Sincronizar con Supabase mediante estrategia "Upsert"
  const scrapedSlugs = Object.keys(consolidatedMovies);
  console.log(`[cinema-scraper] Consolidación diaria completa: ${scrapedSlugs.length} películas encontradas.`);

  let insertedCount = 0;
  let updatedCount = 0;

  for (const slug of scrapedSlugs) {
    const movieData = consolidatedMovies[slug];
    
    // Verificar existencia previa
    const { data: existingMovie, error: fetchError } = await supabase
      .from('cinema_movies')
      .select('id, poster_url, showings')
      .eq('slug', slug)
      .maybeSingle();

    if (fetchError) {
      console.error(`[cinema-scraper] Error consultando slug ${slug}:`, fetchError);
      continue;
    }

    // Validar poster_url obtenida
    let finalPosterUrl = movieData.poster_url;
    const isValidNew = await isPosterUrlValid(finalPosterUrl);

    if (!isValidNew) {
      // Si la nueva URL da 404 o es inválida, verificar si existía una imagen previa en DB que sea válida
      if (existingMovie?.poster_url && await isPosterUrlValid(existingMovie.poster_url)) {
        finalPosterUrl = existingMovie.poster_url;
      } else {
        finalPosterUrl = '';
      }
    }

    if (existingMovie) {
      // Actualizar película existente
      const { error: updateError } = await supabase
        .from('cinema_movies')
        .update({
          title: movieData.title,
          poster_url: finalPosterUrl,
          is_currently_showing: true,
          showings: movieData.showings,
          updated_at: new Date().toISOString()
        })
        .eq('id', existingMovie.id);

      if (updateError) {
        console.error(`[cinema-scraper] Error actualizando película ${slug}:`, updateError);
      } else {
        updatedCount++;
      }
    } else {
      // Insertar nueva película
      const { error: insertError } = await supabase
        .from('cinema_movies')
        .insert({
          slug,
          title: movieData.title,
          poster_url: finalPosterUrl,
          is_currently_showing: true,
          showings: movieData.showings
        });

      if (insertError) {
        console.error(`[cinema-scraper] Error insertando película ${slug}:`, insertError);
      } else {
        insertedCount++;
      }
    }
  }

  // Gestión de Historial / Soft Delete
  // Desactivar películas marcadas como activas que no se encontraron en la cartelera de hoy
  let softDeletedCount = 0;
  try {
    const { data: activeMovies, error: activeFetchError } = await supabase
      .from('cinema_movies')
      .select('id, slug')
      .eq('is_currently_showing', true);

    if (activeFetchError) {
      throw activeFetchError;
    }

    const slugsSet = new Set(scrapedSlugs);
    const toSoftDelete = activeMovies?.filter(m => !slugsSet.has(m.slug)) || [];

    if (toSoftDelete.length > 0) {
      const idsToDelete = toSoftDelete.map(m => m.id);
      const { error: deleteError } = await supabase
        .from('cinema_movies')
        .update({
          is_currently_showing: false,
          updated_at: new Date().toISOString()
        })
        .in('id', idsToDelete);

      if (deleteError) {
        console.error('[cinema-scraper] Error ejecutando soft deletes:', deleteError);
      } else {
        softDeletedCount = toSoftDelete.length;
        console.log(`[cinema-scraper] Historial retenido: soft-deletados ${softDeletedCount} registros obsoletos.`);
      }
    }
  } catch (err) {
    console.error('[cinema-scraper] Error en proceso de soft delete:', err);
  }

  return {
    success: true,
    processed: scrapedSlugs.length,
    inserted: insertedCount,
    updated: updatedCount,
    softDeleted: softDeletedCount
  };
}
