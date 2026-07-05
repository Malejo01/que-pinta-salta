async function run() {
  const url = 'https://apiv2.gaf.adro.studio/movie/84/2f1cd7eb0d4287867e83e07a4d69a74e';
  console.log(`Fetching ${url}...`);
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    console.log('JSON structure keys:', Object.keys(json.data || {}));
    console.log('Movie detail:', json.data.movie);
    console.log('Showtimes detail (truncated):', JSON.stringify(json.data.showtimes, null, 2).substring(0, 2000));
  } catch (error) {
    console.error('Error:', error);
  }
}

run();
