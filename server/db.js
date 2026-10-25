// db.js — MySQL pools. The promise pool is used for queries; express-mysql-session
// needs the classic callback pool, so both are created from the same config.
const mysql = require('mysql2');
const mysqlPromise = require('mysql2/promise');

const POOL_OPTIONS = {
    waitForConnections: true,
    queueLimit: 0,
    charset: 'utf8mb4',
    timezone: 'Z' // store/read TIMESTAMP values as UTC
};

// mysql2 needs an ssl object, not a boolean. Managed providers (Aiven, Railway,
// PlanetScale) present their own CA, so certificates are accepted as-is here.
function connectionOptions(dbConfig) {
    const { ssl, ...rest } = dbConfig;
    const options = { ...rest, ...POOL_OPTIONS };
    if (ssl) options.ssl = { rejectUnauthorized: false };
    return options;
}

function createPromisePool(dbConfig) {
    return mysqlPromise.createPool({
        ...connectionOptions(dbConfig),
        connectionLimit: 10
    });
}

function createCallbackPool(dbConfig) {
    return mysql.createPool({
        ...connectionOptions(dbConfig),
        connectionLimit: 5
    });
}

module.exports = { createPromisePool, createCallbackPool };
