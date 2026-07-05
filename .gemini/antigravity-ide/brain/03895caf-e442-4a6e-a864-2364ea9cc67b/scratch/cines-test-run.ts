import { loadEnvConfig } from '@next/env';
loadEnvConfig(process.cwd());

import { runCinemaScrapeAndSync } from '@/lib/scraper/cinema-scraper';

async function run() {
  console.log('Starting test execution of runCinemaScrapeAndSync...');
  try {
    const result = await runCinemaScrapeAndSync();
    console.log('Result:', result);
  } catch (error) {
    console.error('Execution failed:', error);
  }
}

run();
