const mysql = require('mysql2/promise');

async function testConnection() {
    const configs = [
        {
            label: 'Existing Config (owia_inventory)',
            host: 'owia.myd.infomaniak.com',
            user: 'owia_inventory',
            password: 'Lynx@t0r', // Confirmed from screenshot
            database: 'owia_inventaire',
            port: 3306
        },
        {
            label: 'New Config (owia_temp_1)',
            host: 'owia.myd.infomaniak.com', // Assuming same host
            user: 'owia_temp_1',
            password: 'xTanFm1Au0pG', // From screenshot
            database: 'owia_inventaire',
            port: 3306
        }
    ];

    for (const config of configs) {
        console.log(`\n--- Testing ${config.label} ---`);
        console.log(`Host: ${config.host}`);
        console.log(`User: ${config.user}`);

        try {
            const connection = await mysql.createConnection({
                host: config.host,
                user: config.user,
                password: config.password,
                database: config.database,
                port: config.port,
                connectTimeout: 5000 // 5s timeout
            });

            console.log('✅ Successfully connected!');
            const [rows] = await connection.execute('SELECT 1 as val');
            console.log('Query Result:', rows);
            await connection.end();

        } catch (error) {
            console.error('❌ Connection Failed:');
            console.error('Error Code:', error.code);
            console.error('Error Message:', error.message);
        }
    }
}

testConnection();
