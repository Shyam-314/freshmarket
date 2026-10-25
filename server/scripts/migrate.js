// migrate.js — creates the database (if needed) and applies server/sql/schema.sql.
// Usage: npm run migrate
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const config = require('../config');

function splitStatements(sql) {
    return sql
        .split(/;\s*(?:\r?\n|$)/)
        .map(part => part.replace(/^\s*--.*$/gm, '').trim())
        .filter(Boolean);
}

(async () => {
    const { database, ssl, ...connectionOptions } = config.db;

    if (!/^[A-Za-z0-9_]+$/.test(database)) {
        throw new Error('DB_NAME may only contain letters, digits and underscores.');
    }

    const connection = await mysql.createConnection({
        ...connectionOptions,
        ...(ssl ? { ssl: { rejectUnauthorized: false } } : {})
    });

    await connection.query(
        'CREATE DATABASE IF NOT EXISTS `' + database + '` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci'
    );
    await connection.changeUser({ database });

    const schema = fs.readFileSync(path.join(__dirname, '..', 'sql', 'schema.sql'), 'utf8');
    const statements = splitStatements(schema);

    for (const statement of statements) {
        await connection.query(statement);
    }

    const [tables] = await connection.query('SHOW TABLES');
    const names = tables.map(row => Object.values(row)[0]);

    console.log('Database "' + database + '" is ready. Tables: ' + names.join(', '));
    await connection.end();
})().catch(error => {
    console.error('Migration failed:', error.message);
    console.error('Check that MySQL is running and that DB_USER/DB_PASSWORD in .env are correct.');
    process.exit(1);
});
