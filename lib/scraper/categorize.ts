/**
 * Infers category slug based on keywords found in the title, description, or venue name
 */
export function inferCategorySlug(title: string, description: string = '', venueName: string = ''): string {
  const textClean = `${title} ${description}`.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const venueClean = venueName.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const combined = `${textClean} ${venueClean}`;

  if (/peña|folklore|folkloric|chacarera|zamba|carnavalito|copla|baguala|chamame|atuel/.test(combined)) return 'penas';
  if (/stand.?up|standup|comedia|humor|monolo|unipersonal|chistes|camilo nicolas|juampi gonzalez|trinche/.test(combined)) return 'humor';
  if (/infantil|niños|para chicos|titeres|magia|circo|plim plim|payaso|canticuenticos|pequeño pez/.test(combined)) return 'infantil';
  
  // Ballet/danza can be matched in title/description
  if (/ballet|danza|baile/.test(textClean)) return 'ballet';
  
  // Check recitales/conciertos before teatro to avoid theater venue name false positives
  if (/recital|concierto|show\b|banda\b|tour\b|gira\b|homenaje|tributo|rock|metal|pop|cumbia|trap|rap|sinfonica|orquesta|instrumental/.test(textClean)) return 'recitales';
  if (/teatro|obra\b|drama|tragicomedia|escena/.test(textClean)) return 'teatro';
  
  if (/alternativ|gotica|gótica|dark\b|tributo.*banda|fiesta.*tematica|kpop/.test(combined)) return 'alternativo';
  
  if (/boliche|disco|electronica|dj\b|fiesta|club\b|party|dance|cachengue|retro/.test(combined)) return 'boliches';
  if (/\bcine\b|\bcartelera\b|\bpelicula\b|\bfilm\b|\bproyeccion\b|\bcortometraje\b/.test(textClean)) return 'cine';
  
  if (/feria|mercado|artesanal|gastronomia|exposicion|expo\b/.test(combined)) return 'ferias';
  if (/taller|curso|workshop|clase|seminario|charla/.test(combined)) return 'talleres';
  if (/deporte|futbol|basket|tenis|padel|rugby|maraton|ciclismo|carrera|torneo/.test(combined)) return 'deportes';
  if (/congreso|simposio|conferencia|encuentro/.test(combined)) return 'congresos';
  if (/automovilismo|rally|karting|motociclismo/.test(combined)) return 'automovilismo';
  if (/museo|museos|galeria\b|galerias\b/.test(combined)) return 'museos';
  
  return 'espectaculos'; // Default fallback
}

/**
 * Resolves a category ID using database aliases first, falling back to local keyword inference
 */
export async function resolveCategoryWithAliases(
  supabase: any,
  title: string,
  description: string = '',
  venueName: string = ''
): Promise<string | null> {
  const combined = `${title} ${venueName} ${description}`.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  try {
    // 1. Check database aliases first (allows admins to override classifications)
    const { data: aliases } = await supabase
      .from('aliases')
      .select('alias, target_id')
      .eq('target_type', 'category');

    if (aliases && aliases.length > 0) {
      for (const item of aliases) {
        if (!item.alias || !item.target_id) continue;
        const cleanAlias = item.alias.toLowerCase().trim()
          .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        
        // Escape special chars and match as word boundaries or exact match
        const escaped = cleanAlias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(`\\b${escaped}\\b`, 'i');
        if (regex.test(combined)) {
          console.log(`[resolveCategoryWithAliases] Matched alias "${cleanAlias}" for target_id "${item.target_id}" on: ${title}`);
          return item.target_id;
        }
      }
    }
  } catch (err) {
    console.error('[resolveCategoryWithAliases] Error reading aliases:', err);
  }

  // 2. Infer slug from title / description / venue
  const slug = inferCategorySlug(title, description, venueName);

  // 3. Resolve the slug to ID in database
  try {
    const { data: category } = await supabase
      .from('categories')
      .select('id')
      .eq('slug', slug)
      .single();

    if (category?.id) {
      return category.id;
    }
  } catch (err) {
    console.error(`[resolveCategoryWithAliases] Error resolving slug "${slug}":`, err);
  }

  // 4. Fallback: default to the first category sorted alphabetically by slug to be deterministic
  try {
    const { data: defaultCat } = await supabase
      .from('categories')
      .select('id')
      .order('slug', { ascending: true })
      .limit(1)
      .single();

    return defaultCat?.id || null;
  } catch (err) {
    console.error('[resolveCategoryWithAliases] Error getting fallback category:', err);
    return null;
  }
}
