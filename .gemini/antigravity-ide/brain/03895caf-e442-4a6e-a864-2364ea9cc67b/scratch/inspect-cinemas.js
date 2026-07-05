const cheerio = require('cheerio');
const fs = require('fs');

async function testCinemark() {
  const url = 'https://www.cinemark.com.ar/cartelera/saltaaltonoa';
  console.log(`Fetching ${url}...`);
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8'
      }
    });
    if (!res.ok) throw new Error(`HTTP status ${res.status}`);
    const html = await res.text();
    fs.writeFileSync('cinemark_alto_noa.html', html);
    console.log('Saved cinemark_alto_noa.html. Length:', html.length);
    
    // Check if there's any JSON/script tag containing movie information or state
    const $ = cheerio.load(html);
    console.log('Script tags count:', $('script').length);
    
    // Search for self-closed or structured scripts (like self-hydration state or window.__NEXT_DATA__ equivalent)
    $('script').each((i, el) => {
      const type = $(el).attr('type');
      const id = $(el).attr('id');
      const src = $(el).attr('src');
      const text = $(el).text();
      if (!src && text.length > 500) {
        console.log(`Script ${i}: id=${id}, type=${type}, length=${text.length}, preview=${text.substring(0, 150)}...`);
        if (text.includes('billboard') || text.includes('movie') || text.includes('pelicula') || text.includes('title')) {
          console.log(`  -> Script ${i} looks interesting! (contains movie keywords)`);
        }
      }
    });

    // Let's search the HTML text directly for some common Spanish/movie terms
    const lowerHtml = html.toLowerCase();
    const keywords = ['hora', 'formato', 'doblada', 'subtitulada', 'pelicula', 'carrusel', 'complejo'];
    keywords.forEach(kw => {
      console.log(`HTML contains "${kw}":`, lowerHtml.includes(kw));
    });
  } catch (error) {
    console.error('Error fetching Cinemark:', error);
  }
}

async function testOpera() {
  const url = 'https://cineopera.com.ar';
  console.log(`Fetching ${url}...`);
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8'
      }
    });
    if (!res.ok) throw new Error(`HTTP status ${res.status}`);
    const html = await res.text();
    fs.writeFileSync('cine_opera.html', html);
    console.log('Saved cine_opera.html. Length:', html.length);
    
    const $ = cheerio.load(html);
    console.log('Opera Links:');
    $('a').each((i, el) => {
      const href = $(el).attr('href');
      const text = $(el).text().trim();
      if (href) {
        console.log(`- ${href} (Text: ${text})`);
      }
    });
  } catch (error) {
    console.error('Error fetching Cine Opera:', error);
  }
}

async function run() {
  await testCinemark();
  console.log('\n----------------------------------------\n');
  await testOpera();
}

run();
