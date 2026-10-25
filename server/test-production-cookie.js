// test-production-cookie.js — verifies hosting behaviour: behind a proxy with
// NODE_ENV=production the session cookie must be Secure + HttpOnly.
'use strict';

const path = require('path');
const session = require('express-session');

// Works from the project (server/test-production-cookie.js) and the workspace copy
const ROOT = __dirname;
const SERVER_DIR = require('fs').existsSync(path.join(ROOT, 'server', 'app.js'))
    ? path.join(ROOT, 'server')
    : path.join(ROOT, '..', 'server');

const { createApp } = require(path.join(SERVER_DIR, 'app.js'));
const { createMemoryRepo } = require(path.join(SERVER_DIR, 'testing/memory-repo.js'));

const baseConfig = {
    sessionSecret: 'test-secret',
    sessionCookieName: 'freshmarket.sid',
    sessionMaxAge: 1000 * 60 * 5,
    delivery: { fee: 49, freeAbove: 499 }
};

async function cookieFor(production) {
    const app = createApp({
        repo: createMemoryRepo(),
        config: { ...baseConfig, production },
        sessionStore: new session.MemoryStore()
    });

    const server = app.listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    const port = server.address().port;

    try {
        const response = await fetch('http://127.0.0.1:' + port + '/api/auth/register', {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                // Render/Railway terminate TLS and forward this header; with
                // trust proxy enabled it makes req.secure true.
                'x-forwarded-proto': production ? 'https' : 'http'
            },
            body: JSON.stringify({ name: 'Cookie Tester', email: 'cookie@example.com', password: 'secret123' })
        });
        return { status: response.status, cookie: (response.headers.getSetCookie() || []).join('; ') };
    } finally {
        await new Promise(resolve => server.close(resolve));
    }
}

let failures = 0;
const check = (label, ok, detail = '') => {
    if (!ok) failures += 1;
    console.log((ok ? 'PASS ' : 'FAIL ') + label + (detail ? '  [' + detail + ']' : ''));
};

(async () => {
    const live = await cookieFor(true);
    check('register succeeds in production mode', live.status === 201, 'status ' + live.status);
    check('cookie is marked Secure over HTTPS', /;\s*Secure/i.test(live.cookie), live.cookie.slice(0, 90));
    check('cookie is HttpOnly', /HttpOnly/i.test(live.cookie));
    check('cookie is SameSite=Lax', /SameSite=Lax/i.test(live.cookie));

    const local = await cookieFor(false);
    check('local cookie is NOT Secure (works over http)', !/;\s*Secure/i.test(local.cookie));

    console.log('\n' + (failures === 0 ? 'PRODUCTION COOKIE CHECKS PASSED' : failures + ' CHECK(S) FAILED'));
    process.exit(failures === 0 ? 0 : 1);
})();
