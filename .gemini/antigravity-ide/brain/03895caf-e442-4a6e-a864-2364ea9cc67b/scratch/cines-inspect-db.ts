import { loadEnvConfig } from '@next/env';
loadEnvConfig(process.cwd());

import { createAdminClient } from '@/lib/supabase/server';

async function run() {
  const supabase = createAdminClient();
  const { data: movies, error } = await supabase
    .from('cinema_movies')
    .select('*');
    
  if (error) {
    console.error('Error fetching:', error);
    return;
  }
  
  console.log(`Found ${movies.length} movies in cinema_movies table:`);
  movies.forEach(movie => {
    console.log(`\n========================================`);
    console.log(`Title: ${movie.title}`);
    console.log(`Slug: ${movie.slug}`);
    console.log(`Poster: ${movie.poster_url}`);
    console.log(`Currently Showing: ${movie.is_currently_showing}`);
    console.log(`Showings:`, JSON.stringify(movie.showings, null, 2));
  });
}

run();
