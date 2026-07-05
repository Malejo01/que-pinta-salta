const fs = require('fs');
const cheerio = require('cheerio');

function run() {
  const html = fs.readFileSync('cinemark_alto_noa.html', 'utf8');
  const $ = cheerio.load(html);
  
  // Find all application/ld+json tags
  const ldJsonScripts = $('script[type="application/ld+json"]');
  console.log(`Found ${ldJsonScripts.length} application/ld+json scripts`);
  
  ldJsonScripts.each((i, el) => {
    const text = $(el).text();
    try {
      const parsed = JSON.parse(text);
      if (parsed['@type'] === 'MovieTheater') {
        console.log(`Script ${i} is MovieTheater for:`, parsed.name);
        console.log(`Number of events:`, parsed.event ? parsed.event.length : 0);
        if (parsed.event && parsed.event.length > 0) {
          console.log(`Sample event keys:`, Object.keys(parsed.event[0]));
          console.log(`Sample event:`, JSON.stringify(parsed.event[0], null, 2));
          
          // Let's summarize the movies we found
          const movieMap = {};
          parsed.event.forEach(evt => {
            const movieName = evt.workPresented?.name;
            if (!movieName) return;
            if (!movieMap[movieName]) {
              movieMap[movieName] = {
                image: evt.workPresented.image,
                formats: new Set(),
                dates: new Set(),
                times: new Set()
              };
            }
            if (evt.videoFormat) movieMap[movieName].formats.add(evt.videoFormat);
            if (evt.startDate) {
              const dt = new Date(evt.startDate);
              const dateStr = dt.toISOString().split('T')[0];
              const timeStr = dt.toTimeString().split(' ')[0].substring(0, 5);
              movieMap[movieName].dates.add(dateStr);
              movieMap[movieName].times.add(timeStr);
            }
          });
          
          console.log(`Found ${Object.keys(movieMap).length} movies:`);
          Object.entries(movieMap).forEach(([name, data]) => {
            console.log(`- ${name}:`);
            console.log(`  Poster: ${data.image}`);
            console.log(`  Formats:`, Array.from(data.formats));
            console.log(`  Dates count:`, data.dates.size);
            console.log(`  Sample Times:`, Array.from(data.times).slice(0, 5));
          });
        }
      }
    } catch (e) {
      console.error(`Error parsing script ${i}:`, e.message);
    }
  });
}

run();
