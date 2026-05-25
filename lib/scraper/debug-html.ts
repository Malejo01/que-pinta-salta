import puppeteer from 'puppeteer';
import * as fs from 'fs';

async function main() {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto('https://norteticket.com/?subcategoria=Salta', { waitUntil: 'networkidle2' });
  const html = await page.content();
  await browser.close();

  // Guardar HTML completo para inspección
  fs.writeFileSync('lib/scraper/debug-page.html', html, 'utf-8');
  console.log('HTML guardado en lib/scraper/debug-page.html');
  console.log('Tamaño:', html.length, 'bytes');
}

main();
