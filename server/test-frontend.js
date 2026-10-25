// test-frontend.js — runs the real page scripts (api.js, script.js, auth.js,
// checkout.js, profile.js) in Node against a live Express app with a stubbed DOM.
// Verifies the browser↔API contract without a browser or MySQL.
'use strict';

const fs = require('fs');
const path = require('path');
const session = require('express-session');

const { createApp } = require('./app');
const { createMemoryRepo } = require('./testing/memory-repo');

const config = {
    sessionSecret: 'test-secret',
    sessionCookieName: 'freshmarket.sid',
    sessionMaxAge: 1000 * 60 * 5,
    delivery: { fee: 49, freeAbove: 499 }
};

const PROJECT_ROOT = process.env.PROJECT_ROOT || 'C:/Users/M SHYAM/Desktop/Groceries Webpage/';

function readAsset(name) {
    const candidates = [
        path.join(__dirname, '..', name),
        path.join(__dirname, '..', 'public', name),
        path.join(PROJECT_ROOT, name)
    ];
    for (const candidate of candidates) {
        if (fs.existsSync(candidate)) return fs.readFileSync(candidate, 'utf8');
    }
    throw new Error('Asset not found: ' + name);
}

const apiSource = readAsset('api.js');
const scriptSource = readAsset('script.js');
const authSource = readAsset('auth.js');
const checkoutSource = readAsset('checkout.js');
const profileSource = readAsset('profile.js');

// ---------- stub DOM ----------

class ClassList {
    constructor(classes = []) { this.set = new Set(classes); }
    add(...names) { names.forEach(name => this.set.add(name)); }
    remove(...names) { names.forEach(name => this.set.delete(name)); }
    contains(name) { return this.set.has(name); }
    toggle(name, force) {
        const on = force === undefined ? !this.set.has(name) : Boolean(force);
        if (on) this.set.add(name); else this.set.delete(name);
        return on;
    }
    replace(from, to) {
        if (!this.set.has(from)) return false;
        this.set.delete(from);
        this.set.add(to);
        return true;
    }
}

class El {
    constructor(id, classes = []) {
        this.id = id;
        this.textContent = '';
        this.innerHTML = '';
        this.value = '';
        this.type = 'text';
        this.disabled = false;
        this.checked = false;
        this.style = {};
        this.dataset = {};
        this.attrs = {};
        this.classList = new ClassList(classes);
        this.listeners = {};
    }
    addEventListener(type, fn) { (this.listeners[type] = this.listeners[type] || []).push(fn); }
    dispatchEvent(event) {
        (this.listeners[event.type] || []).forEach(fn => fn.call(this, event));
        return true;
    }
    setAttribute(name, value) { this.attrs[name] = value; }
    focus() {}
    setSelectionRange() {}
    reset() { this.resetCalled = true; }
    querySelector() { return null; }
    querySelectorAll() { return []; }
}

class Form extends El {
    constructor(id, classes = []) { super(id, classes); this.valid = true; this.reported = false; }
    checkValidity() { return this.valid; }
    reportValidity() { this.reported = true; }
}

function makeLocalStorage(initialCart) {
    const store = new Map();
    if (initialCart) store.set('freshmarketCart', JSON.stringify(initialCart));
    return {
        store,
        getItem: key => (store.has(key) ? store.get(key) : null),
        setItem: (key, value) => store.set(key, String(value)),
        removeItem: key => store.delete(key)
    };
}

function makeDocument(els, forms, options = {}) {
    const listeners = {};
    return {
        listeners,
        getElementById: id => els[id] || null,
        querySelector: selector => forms[selector] || options.querySelector && options.querySelector(selector) || null,
        querySelectorAll: selector => {
            if (options.querySelectorAll) {
                const result = options.querySelectorAll(selector);
                if (result) return result;
            }
            return [];
        },
        createElement: tag => new El(tag),
        addEventListener: (type, fn) => { (listeners[type] = listeners[type] || []).push(fn); },
        fire: type => (listeners[type] || []).forEach(fn => fn())
    };
}

// ---------- cookie-aware fetch ----------

function createJar(base, initialCookie = '') {
    let cookie = initialCookie;

    const proxy = async (url, options = {}) => {
        const headers = { ...(options.headers || {}) };
        if (cookie) headers.cookie = cookie;

        const response = await fetch(base + url, {
            method: options.method || 'GET',
            headers,
            body: options.body
        });

        const setCookie = response.headers.getSetCookie ? response.headers.getSetCookie() : [];
        if (setCookie.length) cookie = setCookie.map(value => value.split(';')[0]).join('; ');

        return response;
    };

    return { fetch: proxy, get cookie() { return cookie; } };
}

async function waitFor(predicate, timeout = 5000) {
    const started = Date.now();
    while (Date.now() - started < timeout) {
        if (predicate()) return true;
        await new Promise(resolve => setTimeout(resolve, 25));
    }
    return false;
}

// ---------- harness ----------

let failures = 0;
const check = (label, actual, expected) => {
    const ok = JSON.stringify(actual) === JSON.stringify(expected);
    if (!ok) failures += 1;
    console.log((ok ? '  PASS ' : '  FAIL ') + label + (ok ? '  = ' + JSON.stringify(actual)
        : '  expected ' + JSON.stringify(expected) + ', got ' + JSON.stringify(actual)));
};

async function main() {
    const app = createApp({ repo: createMemoryRepo(), config, sessionStore: new session.MemoryStore() });
    const server = app.listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    const base = 'http://127.0.0.1:' + server.address().port;

    try {
        // Create one account to reuse
        const ownerJar = createJar(base);
        const registered = await ownerJar.fetch('/api/auth/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: 'M Shyam', email: 'shyam@example.com', password: 'secret123' })
        });
        if (registered.status !== 201) throw new Error('setup register failed: ' + registered.status);

        // ================= index: signed-in session =================
        console.log('\nindex page (script.js, signed in)');
        const indexEls = {};
        ['cart-count', 'cart-items-body', 'cart-total-price', 'cart-empty-msg', 'cart-table-wrapper',
            'checkout-btn', 'searchInput', 'backend-message', 'signin-btn', 'profile-btn',
            'profile-initials', 'no-results'].forEach(id => { indexEls[id] = new El(id); });
        indexEls['profile-btn'].classList.add('d-none');

        const indexDocument = makeDocument(indexEls, {});
        const indexWindow = { location: { href: '' }, scrollTo() {} };
        const indexStorage = makeLocalStorage(null);

        new Function('window', 'fetch', apiSource)(indexWindow, ownerJar.fetch);
        new Function('document', 'window', 'localStorage', 'fetch', 'bootstrap', 'alert', 'API', scriptSource)(
            indexDocument, indexWindow, indexStorage, ownerJar.fetch, {}, () => {}, indexWindow.API
        );

        await waitFor(() => indexEls['profile-initials'].textContent === 'MS');
        check('index: avatar shows for a signed-in user',
            !indexEls['profile-btn'].classList.contains('d-none'), true);
        check('index: initials MS', indexEls['profile-initials'].textContent, 'MS');
        check('index: sign-in link hidden', indexEls['signin-btn'].classList.contains('d-none'), true);

        // anonymous index
        const guestEls = {};
        ['cart-count', 'cart-items-body', 'cart-total-price', 'cart-empty-msg', 'cart-table-wrapper',
            'checkout-btn', 'searchInput', 'backend-message', 'signin-btn', 'profile-btn',
            'profile-initials'].forEach(id => { guestEls[id] = new El(id); });
        guestEls['profile-btn'].classList.add('d-none');

        const guestWindow = { location: { href: '' }, scrollTo() {} };
        const guestJar = createJar(base);
        new Function('window', 'fetch', apiSource)(guestWindow, guestJar.fetch);
        new Function('document', 'window', 'localStorage', 'fetch', 'bootstrap', 'alert', 'API', scriptSource)(
            makeDocument(guestEls, {}), guestWindow, makeLocalStorage(null), guestJar.fetch, {}, () => {}, guestWindow.API
        );

        await waitFor(() => guestEls['profile-btn'].classList.contains('d-none') &&
            guestEls['signin-btn'].classList.contains('d-none') === false);
        check('index: guest sees the Sign In link',
            guestEls['signin-btn'].classList.contains('d-none'), false);
        check('index: guest has no avatar', guestEls['profile-btn'].classList.contains('d-none'), true);

        // ================= sign in page =================
        console.log('\nsign in page (auth.js)');
        {
            const els = {};
            ['email', 'password', 'remember', 'auth-alert', 'auth-submit'].forEach(id => { els[id] = new El(id); });
            els['password'].type = 'password';
            els['remember'].checked = true;

            const form = new Form('signin-form');
            els['signin-form'] = form;
            const toggle = new El('toggle');
            toggle.dataset.togglePassword = 'password';
            toggle.innerHTML = '<i class="fas fa-eye"></i>';

            const document = makeDocument(els, { '#signin-form': form }, {
                querySelectorAll: selector => selector === '[data-toggle-password]' ? [toggle] : null
            });
            const window = { location: { search: '', href: '' } };
            const jar = createJar(base);

            new Function('window', 'fetch', apiSource)(window, jar.fetch);
            new Function('document', 'window', 'API', authSource)(document, window, window.API);

            // password visibility
            toggle.listeners.click[0]();
            check('show password switches the input to text', els['password'].type, 'text');
            check('eye toggle reports pressed', toggle.attrs['aria-pressed'], 'true');
            toggle.listeners.click[0]();
            check('hide password switches back', els['password'].type, 'password');

            // wrong password
            els['email'].value = 'shyam@example.com';
            els['password'].value = 'wrong-password';
            form.dispatchEvent({ type: 'submit', preventDefault() {} });
            await waitFor(() => els['auth-alert'].textContent.includes('do not match'));
            check('wrong password shows an error',
                els['auth-alert'].textContent.includes('do not match'), true);
            check('wrong password does not redirect', window.location.href, '');

            // correct password
            els['email'].value = 'shyam@example.com';
            els['password'].value = 'secret123';
            form.dispatchEvent({ type: 'submit', preventDefault() {} });
            await waitFor(() => window.location.href === 'index.html');
            check('correct password redirects to the store', window.location.href, 'index.html');
            check('sign in stores a session cookie', jar.cookie.includes('freshmarket.sid'), true);

            // invalid input is caught before the request
            els['email'].value = 'not-an-email';
            els['password'].value = '';
            form.dispatchEvent({ type: 'submit', preventDefault() {} });
            await waitFor(() => els['auth-alert'].textContent.includes('valid email'));
            check('invalid input is rejected client-side',
                els['auth-alert'].textContent.includes('valid email'), true);
        }

        // ================= sign up page =================
        console.log('\nsign up page (auth.js)');
        {
            const build = () => {
                const els = {};
                ['name', 'email', 'password', 'confirmPassword', 'auth-alert', 'auth-submit']
                    .forEach(id => { els[id] = new El(id); });
                els['password'].type = 'password';
                els['confirmPassword'].type = 'password';

                const form = new Form('signup-form');
                els['signup-form'] = form;
                const document = makeDocument(els, { '#signup-form': form }, {
                    querySelectorAll: () => []
                });
                const window = { location: { search: '', href: '' } };
                const jar = createJar(base);

                new Function('window', 'fetch', apiSource)(window, jar.fetch);
                new Function('document', 'window', 'API', authSource)(document, window, window.API);

                return { els, form, window };
            };

            // success
            const first = build();
            first.els['name'].value = 'New Customer';
            first.els['email'].value = 'new@example.com';
            first.els['password'].value = 'secret123';
            first.els['confirmPassword'].value = 'secret123';
            first.form.dispatchEvent({ type: 'submit', preventDefault() {} });
            await waitFor(() => first.window.location.href === 'index.html');
            check('sign up redirects straight into the store', first.window.location.href, 'index.html');

            // mismatch
            const second = build();
            second.els['name'].value = 'Another';
            second.els['email'].value = 'another@example.com';
            second.els['password'].value = 'secret123';
            second.els['confirmPassword'].value = 'secret999';
            second.form.dispatchEvent({ type: 'submit', preventDefault() {} });
            await waitFor(() => second.els['auth-alert'].textContent.includes('do not match'));
            check('password confirmation is checked',
                second.els['auth-alert'].textContent.includes('do not match'), true);

            // duplicate email
            const third = build();
            third.els['name'].value = 'Shyam Again';
            third.els['email'].value = 'shyam@example.com';
            third.els['password'].value = 'secret123';
            third.els['confirmPassword'].value = 'secret123';
            third.form.dispatchEvent({ type: 'submit', preventDefault() {} });
            await waitFor(() => third.els['auth-alert'].textContent.includes('already exists'));
            check('duplicate email is explained',
                third.els['auth-alert'].textContent.includes('already exists'), true);
        }

        // ================= checkout =================
        console.log('\ncheckout page (checkout.js)');
        {
            const cart = [{ title: 'Apple', price: 224, quantity: 1, unit: 'kg', image: '' }];
            const els = {};
            const hidden = ['checkout-empty', 'checkout-auth', 'checkout-success', 'checkout-error',
                'upi-fields', 'card-fields'];
            ['checkout-form', 'checkout-empty', 'checkout-auth', 'checkout-success', 'summary-items',
                'sum-subtotal', 'sum-delivery', 'sum-total', 'checkout-cart-count', 'delivery-hint',
                'upi-fields', 'card-fields', 'place-order', 'checkout-error', 'fullName', 'phone',
                'email', 'address', 'city', 'state', 'pin', 'notes', 'upiId', 'cardNumber', 'cardName',
                'cardExpiry', 'cardCvv', 'success-name', 'success-order-id', 'success-total',
                'success-payment', 'success-eta', 'success-address'].forEach(id => {
                els[id] = hidden.includes(id) ? new El(id, ['d-none']) : new El(id);
            });
            els['checkout-form'] = new Form('checkout-form');

            const payments = ['cod', 'upi', 'card'].map(value => {
                const input = new El('pay-' + value);
                input.name = 'payment';
                input.value = value;
                input.checked = value === 'cod';
                return input;
            });
            const labels = payments.map(input => {
                const label = new El('label-' + input.value, ['payment-option']);
                label.querySelector = () => input;
                return label;
            });

            const document = makeDocument(els, {}, {
                querySelector: selector => selector === 'input[name="payment"]:checked'
                    ? (payments.find(input => input.checked) || null)
                    : null,
                querySelectorAll: selector => selector === '.payment-option' ? labels
                    : selector === 'input[name="payment"]' ? payments
                    : null
            });

            const window = { location: { href: '' }, scrollTo() {} };
            const storage = makeLocalStorage(cart);

            new Function('window', 'fetch', apiSource)(window, ownerJar.fetch);
            new Function('document', 'window', 'localStorage', 'API', checkoutSource)(
                document, window, storage, window.API
            );

            await waitFor(() => els['sum-total'].textContent === '₹273');
            check('checkout: total from cart', els['sum-total'].textContent, '₹273');
            check('checkout: delivery fee', els['sum-delivery'].textContent, '₹49');
            check('checkout: form visible when signed in',
                els['checkout-form'].classList.contains('d-none'), false);

            els.fullName.value = 'M Shyam';
            els.phone.value = '9876543210';
            els.email.value = 'shyam@example.com';
            els.address.value = '12 Market Road';
            els.city.value = 'Pune';
            els.state.value = 'Maharashtra';
            els.pin.value = '411001';
            els.notes.value = '';

            els['checkout-form'].dispatchEvent({ type: 'submit', preventDefault() {} });

            await waitFor(() => !els['checkout-success'].classList.contains('d-none'));
            check('checkout: confirmation shown', true, !els['checkout-success'].classList.contains('d-none'));
            check('checkout: order id from the server',
                /^#FM\d{6}$/.test(els['success-order-id'].textContent), true);
            check('checkout: cart cleared', storage.getItem('freshmarketCart'), '[]');

            const orders = await (await ownerJar.fetch('/api/orders')).json();
            check('checkout: order stored server-side', orders.orders.length, 1);
        }

        // ================= profile =================
        console.log('\nprofile page (profile.js)');
        {
            const els = {};
            ['profile-signed-out', 'profile-content', 'profile-initials', 'profile-name', 'profile-email',
                'profile-joined', 'orders-list', 'orders-empty', 'nav-initials', 'logout-btn',
                'profile-error'].forEach(id => { els[id] = new El(id, ['d-none']); });
            els['logout-btn'] = new El('logout-btn');

            const document = makeDocument(els, {});
            const window = { location: { href: '' } };

            new Function('window', 'fetch', apiSource)(window, ownerJar.fetch);
            new Function('document', 'window', 'fetch', 'API', profileSource)(
                document, window, ownerJar.fetch, window.API
            );

            await waitFor(() => els['orders-list'].innerHTML.includes('FM'));
            check('profile: name', els['profile-name'].textContent, 'M Shyam');
            check('profile: initials', els['profile-initials'].textContent, 'MS');
            check('profile: history rendered', els['orders-list'].innerHTML.includes('#FM'), true);
            check('profile: total rendered', els['orders-list'].innerHTML.includes('₹273'), true);

            els['logout-btn'].listeners.click[0]();
            await waitFor(() => window.location.href === 'index.html');
            check('profile: logout redirects home', window.location.href, 'index.html');

            const me = await (await ownerJar.fetch('/api/auth/me')).json();
            check('profile: session destroyed on the server', me.user, null);
        }
    } finally {
        await new Promise(resolve => server.close(resolve));
    }

    console.log('\n' + (failures === 0 ? 'ALL FRONTEND↔API CHECKS PASSED' : failures + ' CHECK(S) FAILED'));
    process.exit(failures === 0 ? 0 : 1);
}

main().catch(error => {
    console.error('\nFrontend test crashed:', error);
    process.exit(1);
});
