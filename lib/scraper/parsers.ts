import type { Event } from '../types';
import * as cheerio from 'cheerio';
import slugify from 'slugify';
import { inferCategorySlug } from './categorize';

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

function isTextFree(title: string, description: string): boolean {
  const text = `${title} ${description}`.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return /gratis|gratuito|entrada libre|sin costo|libre y gratuit/.test(text);
}

/**
 * Parsea todos los eventos de la página de Salta de Norteticket.
 * Usa el selector real del DOM: div#boxEvent (card desktop), evitando
 * duplicados mobile (div.d-sm-none) y ruido del navbar/footer.
 */
export function parseAllEventsFromHtml(html: string): Partial<Omit<Event, 'venue'> & { venue?: string }>[] {
  const $ = cheerio.load(html);
  const events: Partial<Omit<Event, 'venue'> & { venue?: string }>[] = [];

  // Selector exacto: solo los cards desktop de eventos (evita mobile y modales del nav)
  $('div#boxEvent').each((_, card) => {
    const $card = $(card);

    // Título: h4.card-title dentro del card
    const title = $card.find('h4.card-title').first().text().trim();
    if (!title) return;

    // Imagen: img dentro de div.imagebox-container
    let image_url = $card.find('div.imagebox-container img').first().attr('src') || '';
    if (image_url && !image_url.startsWith('http')) {
      image_url = 'https://norteticket.com' + image_url;
    }

    // Fecha, venue y precio en p.card-text dentro de col-12.text-left
    // Remover SVG de cada <p> para obtener solo el texto limpio
    const $dataContainer = $card.find('div.col-12.text-left');
    const cardTexts = $dataContainer.find('p.card-text').map((_, el) => {
      const $p = $(el).clone();
      $p.find('svg').remove();
      return $p.text().replace(/\s+/g, ' ').trim();
    }).get();

    // cardTexts[0] = fecha  ("23/05/2026, 09:00")
    // cardTexts[1] = venue  ("Autódromo M. M. de Güemes, Salta, Salta")
    // cardTexts[2] = precio ("Desde ARS 25000")
    const fechaText  = cardTexts[0] || '';
    const venueText  = cardTexts[1] || '';
    const precioText = cardTexts[2] || '';

    // Parsear fecha a ISO 8601
    let start_date = '';
    const dateMatch = fechaText.match(/(\d{2})\/(\d{2})\/(\d{4}),\s*(\d{2}:\d{2})/);
    if (dateMatch) {
      const [, day, month, year, time] = dateMatch;
      start_date = `${year}-${month}-${day}T${time}:00`;
    }

    // Venue: limpiar espacios extra
    const venue = venueText.trim();

    // Precio: extraer primer número después de "ARS"
    let price_min = 0;
    let is_free = false;
    const priceMatch = precioText.match(/ARS\s*(\d+)/i);
    if (priceMatch) {
      price_min = parseInt(priceMatch[1], 10);
      is_free = price_min === 0;
    } else {
      is_free = isTextFree(title, precioText);
    }

    // URL de compra: a.buy-button
    let ticket_url = $card.find('a.buy-button').first().attr('href') || '';
    if (ticket_url && !ticket_url.startsWith('http')) {
      ticket_url = 'https://norteticket.com' + ticket_url.trim();
    }

    // Slug único basado en título + fecha
    const slug = slugify(`${title}-${start_date}`, { lower: true, strict: true });

    events.push({
      title,
      slug,
      start_date,
      price_min,
      is_free,
      ticket_url,
      image_url,
      gallery_urls: image_url ? [image_url] : [],
      venue,
      status: 'PUBLISHED',
      is_featured: false,
      view_count: 0,
      created_by: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
  });

  return events;
}

/**
 * Scrapea la página de detalle de un evento y retorna descripción y categoría.
 */
export async function parseEventDetail(url: string): Promise<{ description: string; short_description: string; category_id: string; }> {
  if (!url) return { description: '', short_description: '', category_id: 'uncategorized' };

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT },
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`HTTP error ${response.status} fetching ${url}`);
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    // Descripción: localizar el comentario "INSERTA DESCRIPCION DEL EVENTO CON TEXTO ENRIQUECIDO"
    // y tomar el div.mt-3 inmediatamente siguiente, que contiene los <p> del texto rico.
    // Fallback: div.advertencia .p-2 para eventos sin texto enriquecido (solo aviso/nota).
    const richParas: string[] = [];
    $('*').contents().filter(function () {
      return this.type === 'comment' && (this as any).data?.includes('ENRIQUECIDO');
    }).each((_, commentNode) => {
      $(commentNode).next('div').find('p').each((_, el) => {
        const text = $(el).text().replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
        if (text) richParas.push(text);
      });
    });

    let description: string;
    if (richParas.length > 0) {
      description = richParas.join('\n\n');
    } else {
      // Fallback: texto del aviso "IMPORTANTE" (div.advertencia > div.p-2, no h4.p-2)
      description = $('div.advertencia div.p-2')
        .first()
        .text()
        .replace(/\u00a0/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    }

    // Short description: primer párrafo, máximo 160 chars
    const firstPara = richParas[0] || description;
    const short_description = firstPara ? firstPara.slice(0, 160) : '';

    // Categoría: inferir por keywords en título + descripción
    const title = $('h1').first().text().trim();
    const category_id = inferCategorySlug(title, description);

    return { description, short_description, category_id };

  } catch (e) {
    console.warn('Error en parseEventDetail:', url, e);
    return { description: '', short_description: '', category_id: 'uncategorized' };
  }
}


