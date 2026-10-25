// app.js — Express application factory. Dependencies are injected so the API can
// be tested with an in-memory repository and a memory session store.
'use strict';

const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const STATIC_FILES = [
    'index.html', 'checkout.html', 'profile.html', 'signin.html', 'signup.html',
    'style.css', 'script.js', 'checkout.js', 'profile.js', 'auth.js', 'api.js'
];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PAYMENT_METHODS = ['cod', 'upi', 'card'];

function text(value, min = 1, max = 255) {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    if (trimmed.length < min || trimmed.length > max) return null;
    return trimmed;
}

function email(value) {
    const trimmed = text(value, 3, 190);
    if (!trimmed) return null;
    const lower = trimmed.toLowerCase();
    return EMAIL_RE.test(lower) ? lower : null;
}

function round2(value) {
    return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function publicUser(user) {
    return { id: user.id, name: user.name, email: user.email, joinedAt: user.joinedAt };
}

// Validates the order payload and recalculates totals on the server, so a
// tampered client cannot invent a free delivery or a wrong total.
function parseOrder(body, config) {
    const rawItems = body && Array.isArray(body.items) ? body.items : [];
    if (rawItems.length === 0) return { error: 'Your cart is empty.' };
    if (rawItems.length > 100) return { error: 'Too many items in one order.' };

    const items = [];
    for (const raw of rawItems) {
        const title = text(raw && raw.title, 1, 120);
        const price = Number(raw && raw.price);
        const quantity = Number.parseInt(raw && raw.quantity, 10);
        const unit = raw && typeof raw.unit === 'string' ? raw.unit.trim().slice(0, 20) : '';

        if (!title) return { error: 'An item in the cart is missing a name.' };
        if (!Number.isFinite(price) || price <= 0 || price > 1000000) {
            return { error: 'Item "' + title + '" has an invalid price.' };
        }
        if (!Number.isInteger(quantity) || quantity < 1 || quantity > 99) {
            return { error: 'Item "' + title + '" has an invalid quantity.' };
        }

        items.push({ title, price: round2(price), quantity, unit });
    }

    const address = (body && body.address) || {};
    const customer = (body && body.customer) || {};

    const line = text(address.line, 4, 255);
    const city = text(address.city, 2, 80);
    const state = text(address.state, 2, 80);
    const pin = text(address.pin, 6, 6);
    const notes = typeof address.notes === 'string' ? address.notes.trim().slice(0, 255) : '';

    const name = text(customer.name, 2, 120);
    const mail = email(customer.email);
    const phone = text(customer.phone, 10, 20);

    if (!line) return { error: 'Please enter your delivery address.' };
    if (!city) return { error: 'Please enter your city.' };
    if (!state) return { error: 'Please choose your state.' };
    if (!pin || !/^[1-9][0-9]{5}$/.test(pin)) return { error: 'Please enter a valid 6-digit PIN code.' };
    if (!name) return { error: 'Please enter the recipient name.' };
    if (!mail) return { error: 'Please enter a valid email address.' };
    if (!phone || !/^[6-9][0-9]{9}$/.test(phone)) {
        return { error: 'Please enter a valid 10-digit mobile number.' };
    }

    const payment = PAYMENT_METHODS.includes(body && body.payment) ? body.payment : 'cod';
    const subtotal = round2(items.reduce((sum, item) => sum + item.price * item.quantity, 0));
    const delivery = subtotal >= config.delivery.freeAbove ? 0 : config.delivery.fee;

    return {
        value: {
            items,
            payment,
            subtotal,
            delivery,
            total: round2(subtotal + delivery),
            customer: { name, email: mail, phone },
            address: { line, city, state, pin, notes }
        }
    };
}

function createApp({ repo, config, sessionStore }) {
    const app = express();

    app.disable('x-powered-by');

    // Behind Render/Railway/Caddy the client IP and protocol come from headers
    if (config.production) app.set('trust proxy', 1);

    app.use(express.json({ limit: '100kb' }));
    app.use(session({
        name: config.sessionCookieName,
        secret: config.sessionSecret,
        resave: false,
        saveUninitialized: false,
        store: sessionStore,
        cookie: {
            httpOnly: true,
            sameSite: 'lax',
            secure: Boolean(config.production), // HTTPS-only cookie on a host
            maxAge: config.sessionMaxAge
        }
    }));

    // ---------- the static site (served from the project root) ----------
    app.get('/', (req, res) => res.sendFile(path.join(ROOT, 'index.html')));
    STATIC_FILES.forEach(file => {
        app.get('/' + file, (req, res) => res.sendFile(path.join(ROOT, file)));
    });
    app.use('/images', express.static(path.join(ROOT, 'images'), { maxAge: '7d' }));

    // ---------- health ----------
    app.get('/api/health', async (req, res) => {
        try {
            await repo.ping();
            res.json({ status: 'ok', database: 'up' });
        } catch (error) {
            res.status(503).json({ status: 'error', database: 'down' });
        }
    });

    // ---------- auth ----------
    const requireAuth = (req, res, next) => {
        if (!req.session || !req.session.userId) {
            res.status(401).json({ error: 'Please sign in first.' });
            return;
        }
        next();
    };

    app.post('/api/auth/register', async (req, res, next) => {
        try {
            const name = text(req.body && req.body.name, 2, 120);
            const mail = email(req.body && req.body.email);
            const password = typeof (req.body && req.body.password) === 'string' ? req.body.password : '';

            if (!name) return res.status(400).json({ error: 'Please enter your full name.' });
            if (!mail) return res.status(400).json({ error: 'Please enter a valid email address.' });
            if (password.length < 8) {
                return res.status(400).json({ error: 'Password must be at least 8 characters long.' });
            }

            if (await repo.findUserByEmail(mail)) {
                return res.status(409).json({ error: 'An account with this email already exists.' });
            }

            const passwordHash = await bcrypt.hash(password, 10);
            const user = await repo.createUser({ name, email: mail, passwordHash });

            // Creating the account also creates the session — no second sign-in.
            req.session.userId = user.id;
            res.status(201).json({ user });
        } catch (error) {
            next(error);
        }
    });

    app.post('/api/auth/login', async (req, res, next) => {
        try {
            const mail = email(req.body && req.body.email);
            const password = typeof (req.body && req.body.password) === 'string' ? req.body.password : '';

            if (!mail || !password) {
                return res.status(400).json({ error: 'Enter your email and password.' });
            }

            const user = await repo.findUserByEmail(mail);
            const valid = user ? await bcrypt.compare(password, user.passwordHash) : false;
            if (!valid) {
                return res.status(401).json({ error: 'Invalid email or password.' });
            }

            req.session.userId = user.id;

            // "Keep me signed in" → persistent cookie, otherwise a session cookie
            if (req.body && req.body.remember === false) {
                req.session.cookie.expires = null;
                req.session.cookie.maxAge = null;
            }

            res.json({ user: publicUser(user) });
        } catch (error) {
            next(error);
        }
    });

    app.post('/api/auth/logout', (req, res) => {
        if (!req.session) return res.status(204).end();

        req.session.destroy(() => {
            res.clearCookie(config.sessionCookieName);
            res.status(204).end();
        });
    });

    app.get('/api/auth/me', async (req, res, next) => {
        try {
            if (!req.session || !req.session.userId) return res.json({ user: null });

            const user = await repo.findUserById(req.session.userId);
            if (!user) {
                req.session.destroy(() => res.json({ user: null }));
                return;
            }
            res.json({ user });
        } catch (error) {
            next(error);
        }
    });

    // ---------- orders ----------
    app.post('/api/orders', requireAuth, async (req, res, next) => {
        try {
            const parsed = parseOrder(req.body, config);
            if (parsed.error) return res.status(400).json({ error: parsed.error });

            const order = parsed.value;
            let publicId = '';

            // public ids are random and unique; retry on the (very unlikely) clash
            for (let attempt = 0; attempt < 5 && !publicId; attempt += 1) {
                const candidate = 'FM' + crypto.randomInt(100000, 1000000);
                try {
                    await repo.createOrder(req.session.userId, { ...order, publicId: candidate });
                    publicId = candidate;
                } catch (error) {
                    if (error.code !== 'ER_DUP_ENTRY') throw error;
                }
            }

            if (!publicId) throw new Error('Could not allocate an order id.');

            res.status(201).json({
                order: {
                    id: publicId,
                    placedAt: new Date().toISOString(),
                    status: 'placed',
                    payment: order.payment,
                    subtotal: order.subtotal,
                    delivery: order.delivery,
                    total: order.total,
                    customer: order.customer,
                    address: order.address,
                    items: order.items
                }
            });
        } catch (error) {
            next(error);
        }
    });

    app.get('/api/orders', requireAuth, async (req, res, next) => {
        try {
            const orders = await repo.listOrdersByUser(req.session.userId);
            res.json({ orders });
        } catch (error) {
            next(error);
        }
    });

    // ---------- 404 + error handling ----------
    app.use((req, res) => res.status(404).json({ error: 'Not found.' }));

    app.use((error, req, res, next) => {
        if (res.headersSent) return next(error);
        if (error.type === 'entity.parse.failed') {
            return res.status(400).json({ error: 'Invalid JSON body.' });
        }
        console.error('[api]', error);
        res.status(500).json({ error: 'Something went wrong. Please try again.' });
    });

    return app;
}

module.exports = { createApp, parseOrder };
