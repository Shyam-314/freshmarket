// config.js — reads .env and exposes one config object for the whole server.
require('dotenv').config();

function pick(name, fallback) {
    const value = process.env[name];
    if (value !== undefined && value !== '') return value;
    if (fallback !== undefined) return fallback;
    throw new Error('Missing ' + name + ' in .env — copy .env.example to .env and fill it in.');
}

const config = {
    port: Number(pick('PORT', '5000')),

    // true on a host (HTTPS + proxy) — enables trust proxy and secure cookies
    production: process.env.NODE_ENV === 'production',

    db: {
        host: pick('DB_HOST', 'localhost'),
        port: Number(pick('DB_PORT', '3306')),
        user: pick('DB_USER', 'root'),
        password: process.env.DB_PASSWORD || '',
        database: pick('DB_NAME', 'freshmarket'),
        // managed MySQL (Aiven, Railway, ...) only accepts TLS connections
        ssl: process.env.DB_SSL === 'true'
    },

    sessionSecret: pick('SESSION_SECRET', 'dev-only-secret-change-me'),
    sessionCookieName: 'freshmarket.sid',
    sessionMaxAge: 1000 * 60 * 60 * 24 * 7, // 7 days

    delivery: { fee: 49, freeAbove: 499 }
};

module.exports = config;
