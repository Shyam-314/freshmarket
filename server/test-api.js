// test-api.js — exercises the real Express app (routes, validation, bcrypt,
// sessions, cookies) against an in-memory repository, so it runs without MySQL.
// Run with: npm test
'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const session = require('express-session');

const { createApp } = require('./app');
const { createMemoryRepo } = require('./testing/memory-repo');

const config = {
    port: 0,
    sessionSecret: 'test-secret',
    sessionCookieName: 'freshmarket.sid',
    sessionMaxAge: 1000 * 60 * 5,
    delivery: { fee: 49, freeAbove: 499 }
};

let server;
let base;

before(async () => {
    const app = createApp({
        repo: createMemoryRepo(),
        config,
        sessionStore: new session.MemoryStore()
    });
    server = app.listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    base = 'http://127.0.0.1:' + server.address().port;
});

after(() => new Promise(resolve => server.close(resolve)));

// ---------- tiny cookie-aware client ----------
function createClient() {
    let cookie = '';

    return async function call(path, { method = 'GET', body } = {}) {
        const headers = {};
        if (body !== undefined) headers['Content-Type'] = 'application/json';
        if (cookie) headers.Cookie = cookie;

        const response = await fetch(base + path, {
            method,
            headers,
            body: body === undefined ? undefined : JSON.stringify(body)
        });

        const setCookie = response.headers.getSetCookie ? response.headers.getSetCookie() : [];
        if (setCookie.length) {
            cookie = setCookie.map(value => value.split(';')[0]).join('; ');
        }

        const raw = await response.text();
        let data = null;
        if (raw) {
            try { data = JSON.parse(raw); } catch (error) { data = null; }
        }
        return { status: response.status, data };
    };
}

const address = {
    line: '12 Market Road', city: 'Pune', state: 'Maharashtra', pin: '411001', notes: ''
};
const customer = { name: 'M Shyam', email: 'shyam@example.com', phone: '9876543210' };

function orderPayload(overrides = {}) {
    return {
        items: [{ title: 'Apple', price: 224, quantity: 1, unit: 'kg' }],
        payment: 'cod',
        customer: { ...customer },
        address: { ...address },
        ...overrides
    };
}

async function register(call, email) {
    return call('/api/auth/register', {
        method: 'POST',
        body: { name: 'M Shyam', email, password: 'secret123' }
    });
}

// ---------- tests ----------

test('health reports the database as up', async () => {
    const call = createClient();
    const res = await call('/api/health');
    assert.equal(res.status, 200);
    assert.deepEqual(res.data, { status: 'ok', database: 'up' });
});

test('register creates an account, hashes the password and signs in', async () => {
    const call = createClient();
    const res = await register(call, 'reg@example.com');

    assert.equal(res.status, 201);
    assert.equal(res.data.user.email, 'reg@example.com');
    assert.equal(res.data.user.passwordHash, undefined);

    const me = await call('/api/auth/me');
    assert.equal(me.data.user.email, 'reg@example.com');
});

test('register rejects a duplicate email', async () => {
    const call = createClient();
    await register(call, 'dupe@example.com');
    const second = await register(call, 'dupe@example.com');

    assert.equal(second.status, 409);
    assert.match(second.data.error, /already exists/i);
});

test('register validates email and password length', async () => {
    const call = createClient();
    const badEmail = await call('/api/auth/register', {
        method: 'POST',
        body: { name: 'Test', email: 'not-an-email', password: 'secret123' }
    });
    assert.equal(badEmail.status, 400);

    const shortPassword = await call('/api/auth/register', {
        method: 'POST',
        body: { name: 'Test', email: 'short@example.com', password: 'abc' }
    });
    assert.equal(shortPassword.status, 400);
    assert.match(shortPassword.data.error, /8 characters/i);
});

test('login rejects a wrong password and accepts the right one', async () => {
    const call = createClient();
    await register(call, 'login@example.com');

    const wrong = await call('/api/auth/login', {
        method: 'POST',
        body: { email: 'login@example.com', password: 'nope' }
    });
    assert.equal(wrong.status, 401);

    const right = await call('/api/auth/login', {
        method: 'POST',
        body: { email: 'login@example.com', password: 'secret123' }
    });
    assert.equal(right.status, 200);
    assert.equal(right.data.user.email, 'login@example.com');

    const me = await call('/api/auth/me');
    assert.equal(me.data.user.email, 'login@example.com');
});

test('orders require a signed-in session', async () => {
    const call = createClient();
    const list = await call('/api/orders');
    assert.equal(list.status, 401);

    const create = await call('/api/orders', { method: 'POST', body: orderPayload() });
    assert.equal(create.status, 401);
});

test('placing an order recalculates the total on the server', async () => {
    const call = createClient();
    await register(call, 'order@example.com');

    const res = await call('/api/orders', { method: 'POST', body: orderPayload() });

    assert.equal(res.status, 201);
    assert.match(res.data.order.id, /^FM\d{6}$/);
    assert.equal(res.data.order.subtotal, 224);
    assert.equal(res.data.order.delivery, 49);
    assert.equal(res.data.order.total, 273);
});

test('delivery is free at or above ₹499', async () => {
    const call = createClient();
    await register(call, 'free@example.com');

    const res = await call('/api/orders', {
        method: 'POST',
        body: orderPayload({
            items: [
                { title: 'Apple', price: 224, quantity: 2, unit: 'kg' },
                { title: 'Banana', price: 62, quantity: 1, unit: 'kg' }
            ]
        })
    });

    assert.equal(res.status, 201);
    assert.equal(res.data.order.subtotal, 510);
    assert.equal(res.data.order.delivery, 0);
    assert.equal(res.data.order.total, 510);
});

test('a client-sent total is ignored', async () => {
    const call = createClient();
    await register(call, 'tamper@example.com');

    const res = await call('/api/orders', {
        method: 'POST',
        body: orderPayload({ total: 1, subtotal: 1, delivery: 0 })
    });

    assert.equal(res.status, 201);
    assert.equal(res.data.order.total, 273);
});

test('each user only sees their own orders', async () => {
    const alice = createClient();
    const bob = createClient();
    await register(alice, 'alice@example.com');
    await register(bob, 'bob@example.com');

    await alice('/api/orders', { method: 'POST', body: orderPayload() });

    const aliceOrders = await alice('/api/orders');
    const bobOrders = await bob('/api/orders');

    assert.equal(aliceOrders.data.orders.length, 1);
    assert.equal(bobOrders.data.orders.length, 0);
});

test('invalid order payloads are rejected', async () => {
    const call = createClient();
    await register(call, 'invalid@example.com');

    const emptyCart = await call('/api/orders', {
        method: 'POST',
        body: orderPayload({ items: [] })
    });
    assert.equal(emptyCart.status, 400);

    const badPin = await call('/api/orders', {
        method: 'POST',
        body: orderPayload({ address: { ...address, pin: '12' } })
    });
    assert.equal(badPin.status, 400);

    const badQuantity = await call('/api/orders', {
        method: 'POST',
        body: orderPayload({ items: [{ title: 'Apple', price: 224, quantity: 0, unit: 'kg' }] })
    });
    assert.equal(badQuantity.status, 400);
});

test('logout destroys the session', async () => {
    const call = createClient();
    await register(call, 'logout@example.com');

    const beforeLogout = await call('/api/auth/me');
    assert.equal(beforeLogout.data.user.email, 'logout@example.com');

    const loggedOut = await call('/api/auth/logout', { method: 'POST' });
    assert.equal(loggedOut.status, 204);

    const afterLogout = await call('/api/auth/me');
    assert.equal(afterLogout.data.user, null);

    const orders = await call('/api/orders');
    assert.equal(orders.status, 401);
});

test('unknown API routes return JSON 404', async () => {
    const call = createClient();
    const res = await call('/api/nope');
    assert.equal(res.status, 404);
    assert.equal(res.data.error, 'Not found.');
});
