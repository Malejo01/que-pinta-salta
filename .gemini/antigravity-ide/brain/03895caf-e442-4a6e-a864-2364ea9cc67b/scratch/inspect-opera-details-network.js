const puppeteer = require('puppeteer');

async function run() {
  console.log('Launching browser with Puppeteer...');
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();
  
  console.log('Registering response interceptor...');
  page.on('response', async (response) => {
    const url = response.url();
    const status = response.status();
    const type = response.request().resourceType();
    
    if (type === 'fetch' || type === 'xhr' || url.includes('/api') || url.includes('adro.studio')) {
      try {
        const text = await response.text();
        console.log(`URL: ${url} [Status: ${status}, Type: ${type}]`);
        console.log(`Response snippet: ${text.substring(0, 800)}`);
        console.log('--------------------------------------------------');
      } catch (err) {
        // Some responses might fail to read
      }
    }
  });

  try {
    // We navigate to a details page (we know 2f1cd7eb0d4287867e83e07a4d69a74e is Minions Monstruos 2D from previous run)
    const detailUrl = 'https://cineopera.com.ar/pelicula/84/2f1cd7eb0d4287867e83e07a4d69a74e';
    console.log(`Navigating to ${detailUrl}...`);
    await page.goto(detailUrl, { waitUntil: 'networkidle2', timeout: 30000 });
    
    console.log('Navigation complete, waiting 5 seconds...');
    await new Promise(resolve => setTimeout(resolve, 5000));
  } catch (error) {
    console.error('Error during browser execution:', error);
  } finally {
    await browser.close();
    console.log('Browser closed.');
  }
}

run();
