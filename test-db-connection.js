const mysql = require('mysql2/promise');
require('dotenv').config({ path: '.env.local' });

async function testConnection() {
  console.log('\n========================================');
  console.log('Testing Emega Database Connection');
  console.log('========================================\n');
  
  console.log('Configuration:');
  console.log('  Host:', process.env.EMEGA_DB_HOST || 'track.emega.com.au');
  console.log('  User:', process.env.EMEGA_DB_USER);
  console.log('  Database:', process.env.EMEGA_DB_NAME || 'emega');
  console.log('  Port:', process.env.EMEGA_DB_PORT || 3306);
  console.log('  Password:', process.env.EMEGA_DB_PASSWORD ? '***' + process.env.EMEGA_DB_PASSWORD.slice(-3) : 'NOT SET');
  console.log('\n');
  
  let connection;
  
  try {
    console.log('Attempting to connect...');
    
    connection = await mysql.createConnection({
      host: process.env.EMEGA_DB_HOST || 'track.emega.com.au',
      user: process.env.EMEGA_DB_USER,
      password: process.env.EMEGA_DB_PASSWORD,
      database: process.env.EMEGA_DB_NAME || 'emega',
      port: parseInt(process.env.EMEGA_DB_PORT || 3306),
      connectTimeout: 10000,
      ssl: {
        rejectUnauthorized: false
      }
    });
    
    console.log('✅ Connected successfully!\n');
    
    console.log('Fetching tables...');
    const [rows] = await connection.execute('SHOW TABLES');
    console.log(`✅ Found ${rows.length} tables:\n`);
    
    rows.forEach((row, index) => {
      console.log(`  ${index + 1}. ${Object.values(row)[0]}`);
    });
    
    console.log('\n========================================');
    console.log('✅ Database connection test PASSED!');
    console.log('========================================\n');
    
  } catch (error) {
    console.error('\n========================================');
    console.error('❌ Database connection test FAILED!');
    console.error('========================================\n');
    console.error('Error message:', error.message);
    console.error('Error code:', error.code);
    console.error('SQL State:', error.sqlState);
    console.error('\nPossible issues:');
    console.error('  • Database server is not accessible from your network');
    console.error('  • Your IP address is not whitelisted');
    console.error('  • Incorrect credentials');
    console.error('  • Port 3306 is blocked by firewall');
    console.error('  • SSL/TLS configuration issue\n');
  } finally {
    if (connection) {
      await connection.end();
      console.log('Connection closed.\n');
    }
  }
}

testConnection();