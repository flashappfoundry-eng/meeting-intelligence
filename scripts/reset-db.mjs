// Reset database script
import pg from 'pg';
const { Client } = pg;

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('DATABASE_URL not set');
  process.exit(1);
}

const client = new Client({ connectionString });

async function main() {
  console.log('Connecting to database...');
  await client.connect();
  console.log('Connected!');
  
  // List current tables
  const tables = await client.query(`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public'
  `);
  console.log('Current tables:', tables.rows.map(r => r.tablename).join(', ') || 'none');
  
  // Drop and recreate schema
  console.log('Dropping public schema...');
  await client.query('DROP SCHEMA public CASCADE');
  console.log('Creating new public schema...');
  await client.query('CREATE SCHEMA public');
  await client.query('GRANT ALL ON SCHEMA public TO neondb_owner');
  await client.query('GRANT ALL ON SCHEMA public TO public');
  
  // Verify it's empty
  const verify = await client.query(`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public'
  `);
  console.log('Tables after reset:', verify.rows.map(r => r.tablename).join(', ') || 'none');
  
  await client.end();
  console.log('Done!');
}

main().catch(e => {
  console.error('Error:', e.message);
  process.exit(1);
});

