import puppeteer from 'puppeteer';
import * as fs from 'fs';

async function main() {
const browser = await puppeteer.launch({ headless: true });
const page = await browser.newPage();
await page.goto('https://norteticket.com/GRAN-PENA-DE-LOS-NOCHEROS/', { waitUntil: 'networkidle2', timeout: 30000 });
const html = await page.content();
await browser.close();

fs.writeFileSync('lib/scraper/debug-nocheros.html', html);
console.log('Tamaño HTML:', html.length);

const keywords = ['advertencia', 'texto-evento', 'col-lg-8', 'Los Nocheros se', 'descripcion', 'info-event', 'Para mayores'];
  for (const kw of keywords) {
    const idx = html.indexOf(kw);
    if (idx > -1) {
      console.log(`\n=== "${kw}" en pos ${idx} ===`);
      console.log(html.slice(Math.max(0, idx - 80), idx + 400));
    } else {
      console.log(`\n--- "${kw}" NO encontrado ---`);
    }
  }
}

main();
