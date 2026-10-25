// smoke.js — end-to-end check against a *running* server.
// Usage: npm start   (in another terminal)   then   npm run smoke
'use strict';

const BASE = process.env.SMOKE_URL || 'http://localhost:5000';

let cookie = '';

async function call(path, { method = 'GET', body } = {}) {
    const headers = {};
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (cookie) headers.Cookie = cookie;

    const response = await fetch(BASE + path, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body)
    });

    const setCookie = response.headers.getSetCookie ? response.headers.getSetCookie() : [];
    if (setCookie.length) cookie = setCookie.map(value => value.split(';')[0]).join('; ');

    const raw = await response.text();
    let data = null;
    if (raw) {
        try { data = JSON.parse(raw); } catch (error) { data = null; }
    }
    return { status: response.status, data, raw };
}

let failures = 0;

function check(label, condition, extra = '') {
    if (condition) {
        console.log('  OK   ' + label);
    } else {
        failures += 1;
        console.log('  FAIL ' + label + (extra ? '  (' + extra + ')' : ''));
    }
}

(async () => {
    console.log('Smoke testing ' + BASE + '\n');

    const health = await call('/api/health');
    check('GET /api/health → 200', health.status === 200, 'got ' + health.status);
    check('database reports up', health.data && health.data.database === 'up');

    const email = 'smoke' + Date.now() + '@example.com';
    const registered = await call('/api/auth/register', {
        method: 'POST',
        body: { name: 'Smoke Tester', email, password: 'secret123' }
    });
    check('register → 201', registered.status === 201, 'got ' + registered.status);
    check('register returns the user', registered.data && registered.data.user && registered.data.user.email === email);

    const me = await call('/api/auth/me');
    check('session cookie works', me.data && me.data.user && me.data.user.email === email);

    const order = await call('/api/orders', {
        method: 'POST',
        body: {
            items: [{ title: 'Apple', price: 224, quantity: 1, unit: 'kg' }],
            payment: 'cod',
            customer: { name: 'Smoke Tester', email, phone: '9876543210' },
            address: { line: '12 Market Road', city: 'Pune', state: 'Maharashtra', pin: '411001', notes: '' }
        }
    });
    check('place order → 201', order.status === 201, 'got ' + order.status);
    check('server-computed total ₹273', order.data && order.data.order && order.data.order.total === 273);

    const list = await call('/api/orders');
    check('order appears in history', list.data && list.data.orders && list.data.orders.length === 1);

    const logout = await call('/api/auth/logout', { method: 'POST' });
    check('logout → 204', logout.status === 204, 'got ' + logout.status);

    const after = await call('/api/auth/me');
    check('session gone after logout', after.data && after.data.user === null);

    console.log('\n' + (failures === 0 ? 'SMOKE TEST PASSED' : failures + ' SMOKE CHECK(S) FAILED'));
    process.exit(failures === 0 ? 0 : 1);
})().catch(error => {
    console.error('\nSmoke test could not run:', error.message);
    console.error('Is the server running? Start it with: npm start');
    process.exit(1);
});
