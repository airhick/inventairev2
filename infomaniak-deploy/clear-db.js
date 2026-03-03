const mysql = require('mysql2/promise');

async function clearDb() {
    try {
        const connection = await mysql.createConnection({
            host: 'owia.myd.infomaniak.com',
            user: 'owia_ext',
            password: 'Lynx@t0r',
            database: 'owia_inventaire',
            port: 3306
        });

        console.log('✅ Connected to DB');

        // Truncate the items table
        console.log('Truncating items table...');
        await connection.execute('TRUNCATE TABLE items');
        console.log('✅ items table cleared successfully!');

        // Truncate custom_fields
        console.log('Truncating custom_fields table...');
        await connection.execute('TRUNCATE TABLE custom_fields');
        console.log('✅ custom_fields table cleared successfully!');

        await connection.end();

    } catch (error) {
        console.error('❌ Connection or Execution Failed:');
        console.error(error);
    }
}

clearDb();
