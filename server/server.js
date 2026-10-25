// server.js — wires config → MySQL pools → repository → Express app.
const session = require('express-session');
const MySQLStore = require('express-mysql-session')(session);

const config = require('./config');
const { createPromisePool, createCallbackPool } = require('./db');
const { createRepository } = require('./repo');
const { createApp } = require('./app');

async function main() {
    const promisePool = createPromisePool(config.db);

    // Fail fast with a readable message instead of a stack trace on first request
    await promisePool.query('SELECT 1');

    const callbackPool = createCallbackPool(config.db);
    const sessionStore = new MySQLStore({
        createDatabaseTable: true,
        clearExpired: true,
        checkExpirationInterval: 15 * 60 * 1000,
        expiration: config.sessionMaxAge,
        schema: {
            tableName: 'sessions',
            columnNames: { session_id: 'session_id', expires: 'expires', data: 'data' }
        }
    }, callbackPool);

    const repo = createRepository(promisePool);
    const app = createApp({ repo, config, sessionStore });

    const httpServer = app.listen(config.port, () => {
        console.log('FreshMarket is running on http://localhost:' + config.port);
        console.log('Database: ' + config.db.user + '@' + config.db.host + ':' + config.db.port + '/' + config.db.database);
    });

    httpServer.on('error', error => {
        if (error.code === 'EADDRINUSE') {
            console.error('\nPort ' + config.port + ' is already in use.');
            console.error('Close the other "npm start" window, or set a different PORT in .env.');
        } else {
            console.error('\nServer error: ' + error.message);
        }
        process.exit(1);
    });
}

main().catch(error => {
    console.error('\nCould not start FreshMarket: ' + (error.message || error.code || 'unknown error'));

    if (error.code === 'ECONNREFUSED') {
        console.error('MySQL does not seem to be running. Start the MySQL service and check DB_HOST/DB_PORT in .env.');
    } else if (error.code === 'ER_ACCESS_DENIED_ERROR') {
        console.error('MySQL rejected the login. Check DB_USER/DB_PASSWORD in .env.');
    } else if (error.code === 'ER_BAD_DB_ERROR') {
        console.error('The database does not exist yet. Run "npm run migrate" first.');
    }

    process.exit(1);
});
