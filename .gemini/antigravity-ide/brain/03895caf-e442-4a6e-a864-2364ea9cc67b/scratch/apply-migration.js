process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

// Read connection string from .env.local in the current working directory
const envPath = path.join(process.cwd(), '.env.local');
const envContent = fs.readFileSync(envPath, 'utf8');

let connectionString = '';
envContent.split('\n').forEach(line => {
  if (line.startsWith('POSTGRES_URL_NON_POOLING=')) {
    connectionString = line.substring('POSTGRES_URL_NON_POOLING='.length).trim();
  }
});

// If connectionString has quotes, strip them
if (connectionString.startsWith('"') && connectionString.endsWith('"')) {
  connectionString = connectionString.substring(1, connectionString.length - 1);
} else if (connectionString.startsWith("'") && connectionString.endsWith("'")) {
  connectionString = connectionString.substring(1, connectionString.length - 1);
}

if (!connectionString) {
  console.error('Error: Could not find POSTGRES_URL_NON_POOLING in .env.local');
  process.exit(1);
}

console.log('Using connection string host:', connectionString.split('@')[1] || connectionString);

const migrationPath = path.join(process.cwd(), 'supabase/migrations/20260705_create_cinema_movies.sql');
const migrationSql = fs.readFileSync(migrationPath, 'utf8');

async function run() {
  const client = new Client({
    connectionString: connectionString,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log('Connected to PostgreSQL database.');

    console.log('Executing migration script...');
    await client.query(migrationSql);
    console.log('Migration SQL executed successfully!');
  } catch (error) {
    console.error('Migration failed:', error);
  } finally {
    await client.end();
    console.log('Database connection closed.');
  }
}

run();
