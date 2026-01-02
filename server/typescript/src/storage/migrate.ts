#!/usr/bin/env bun
/**
 * Database Migration Script
 * 
 * Initializes or updates the PostgreSQL database schema
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { Pool } from 'pg';
import { config } from '../config';

async function migrate() {
  // console.log('🔄 Starting database migration...');
  // console.log(`📍 Database: ${config.databaseUrl}`);

  const pool = new Pool({
    connectionString: config.databaseUrl,
  });

  try {
    // Test connection
    // console.log('🔌 Testing database connection...');
    await pool.query('SELECT NOW()');
    // console.log('✅ Database connection successful');

    // Read schema file
    // console.log('📖 Reading schema file...');
    const schemaPath = join(__dirname, 'schema.sql');
    const schema = readFileSync(schemaPath, 'utf-8');
    // console.log('✅ Schema file loaded');

    // Execute schema
    // console.log('⚙️  Executing schema...');
    await pool.query(schema);
    // console.log('✅ Schema executed successfully');

    // Verify tables
    // console.log('🔍 Verifying tables...');
    const result = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `);

    // console.log('✅ Tables created:');
    result.rows.forEach(_row => {
      // console.log(`   - ${_row.table_name}`);
    });

    // Verify views
    const viewsResult = await pool.query(`
      SELECT table_name 
      FROM information_schema.views 
      WHERE table_schema = 'public'
      ORDER BY table_name
    `);

    if (viewsResult.rows.length > 0) {
      // console.log('✅ Views created:');
      viewsResult.rows.forEach(_row => {
        // console.log(`   - ${_row.table_name}`);
      });
    }

    // console.log('\n🎉 Migration completed successfully!');
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Run migration
migrate().catch(error => {
  console.error('❌ Unexpected error:', error);
  process.exit(1);
});
