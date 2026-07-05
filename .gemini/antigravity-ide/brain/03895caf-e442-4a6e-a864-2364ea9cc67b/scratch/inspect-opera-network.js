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
    
    // We are looking for fetch or xhr requests that return JSON data
    if (type === 'fetch' || type === 'xhr' || url.includes('/api/') || url.includes('json') || url.includes('opera') || url.includes('cine')) {
      try {
        const text = await response.text();
        console.log(`URL: ${url} [Status: ${status}, Type: ${type}]`);
        console.log(`Response snippet: ${text.substring(0, 500)}`);
        console.log('--------------------------------------------------');
      } catch (err) {
        // Some responses might fail to read (e.g. CORS or binary)
      }
    }
  });

  try {
    console.log('Navigating to https://cineopera.com.ar...');
    await page.goto('https://cineopera.com.ar', { waitUntil: 'networkidle2', timeout: 30000 });
    
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
