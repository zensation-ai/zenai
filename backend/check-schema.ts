import { pool } from './src/utils/database';

async function checkSchema() {
  try {
    const result = await pool.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'api_keys'
      ORDER BY ordinal_position;
    `);
    
    console.log('api_keys table columns:');
    console.log(result.rows);
    
    await pool.end();
  } catch (error: any) {
    console.error('Error:', error.message);
    await pool.end();
    process.exit(1);
  }
}

checkSchema();
