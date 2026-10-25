// checkout.js — FreshMarket order page, backed by the API (MySQL).
// The cart itself stays in localStorage (it is temporary UI state); the account,
// session and orders live in the database.

const CART_KEY = 'freshmarketCart';
const DELIVERY_FEE = 49;
const FREE_DELIVERY_ABOVE = 499;

const formatINR = amount =>
    '₹' + Number(amount).toLocaleString('en-IN', { maximumFractionDigits: 2 });

const escapeHtml = value => String(value).replace(/[&<>"']/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[ch]));

const PAYMENT_LABELS = { cod: 'Cash on Delivery', upi: 'UPI', card: 'Card' };

const el = id => document.getElementById(id);
const hide = node => { if (node) node.classList.add('d-none'); };
const show = node => { if (node) node.classList.remove('d-none'); };

function readCart() {
    try {
        const parsed = JSON.parse(localStorage.getItem(CART_KEY) || '[]');
        if (!Array.isArray(parsed)) return [];
        return parsed
            .filter(item => item && typeof item.title === 'string' && isFinite(item.price))
            .map(item => ({
                title: item.title,
                price: Number(item.price),
                quantity: Math.max(1, parseInt(item.quantity, 10) || 1),
                unit: typeof item.unit === 'string' ? item.unit : '',
                image: typeof item.image === 'string' ? item.image : ''
            }));
    } catch (error) {
        console.warn('Could not read the saved cart:', error);
        return [];
    }
}

function saveCart() {
    try {
        localStorage.setItem(CART_KEY, JSON.stringify(cart));
    } catch (error) {
        console.warn('Could not save the cart:', error);
    }
}

let cart = readCart();

// ---------- page states ----------

function showState(name) {
    const ids = { form: 'checkout-form', empty: 'checkout-empty', auth: 'checkout-auth', success: 'checkout-success' };

    Object.values(ids).forEach(id => hide(el(id)));
    show(el(ids[name]));
}

function showError(message) {
    const box = el('checkout-error');
    if (!box) return;
    box.textContent = message;
    show(box);
}

function clearError() {
    hide(el('checkout-error'));
}

// ---------- totals + summary ----------

function orderTotals() {
    const subtotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
    const count = cart.reduce((sum, item) => sum + item.quantity, 0);
    const delivery = (cart.length === 0 || subtotal >= FREE_DELIVERY_ABOVE) ? 0 : DELIVERY_FEE;
    return { subtotal, count, delivery, total: subtotal + delivery };
}

function renderLine(item) {
    const thumb = item.image
        ? `<img src="${escapeHtml(item.image)}" alt="${escapeHtml(item.title)}" class="checkout-thumb">`
        : `<span class="checkout-thumb d-inline-flex align-items-center justify-content-center bg-light">
               <i class="fas fa-leaf text-success"></i>
           </span>`;

    const unit = item.unit ? ' / ' + escapeHtml(item.unit) : '';

    return `
        <div class="checkout-line">
            ${thumb}
            <div class="flex-grow-1">
                <div class="d-flex justify-content-between gap-2">
                    <span class="fw-semibold small">${escapeHtml(item.title)}</span>
                    <span class="small fw-bold">${formatINR(item.price * item.quantity)}</span>
                </div>
                <div class="text-muted small">${formatINR(item.price)}${unit}</div>
                <div class="d-flex align-items-center gap-2 mt-1">
                    <button type="button" class="btn btn-outline-secondary btn-sm py-0 px-2"
                            data-action="dec" data-title="${escapeHtml(item.title)}" aria-label="Decrease quantity">&minus;</button>
                    <span class="small fw-semibold">${item.quantity}</span>
                    <button type="button" class="btn btn-outline-secondary btn-sm py-0 px-2"
                            data-action="inc" data-title="${escapeHtml(item.title)}" aria-label="Increase quantity">+</button>
                    <button type="button" class="btn btn-link btn-sm text-danger p-0 ms-2 text-decoration-none"
                            data-action="remove" data-title="${escapeHtml(item.title)}">Remove</button>
                </div>
            </div>
        </div>`;
}

function renderSummary() {
    const { subtotal, count, delivery, total } = orderTotals();

    if (el('checkout-cart-count')) el('checkout-cart-count').textContent = count;

    if (cart.length === 0) {
        showState('empty');
        return;
    }

    if (el('summary-items')) el('summary-items').innerHTML = cart.map(renderLine).join('');
    if (el('sum-subtotal')) el('sum-subtotal').textContent = formatINR(subtotal);
    if (el('sum-delivery')) el('sum-delivery').textContent = delivery === 0 ? 'Free' : formatINR(delivery);
    if (el('sum-total')) el('sum-total').textContent = formatINR(total);

    if (el('delivery-hint')) {
        el('delivery-hint').textContent = subtotal >= FREE_DELIVERY_ABOVE
            ? 'Free delivery unlocked.'
            : `Add ${formatINR(FREE_DELIVERY_ABOVE - subtotal)} more to get free delivery.`;
    }
}

// Quantity + remove controls
const summaryItems = el('summary-items');
if (summaryItems) {
    summaryItems.addEventListener('click', event => {
        const button = event.target.closest('button[data-action]');
        if (!button) return;

        const title = button.dataset.title;
        const item = cart.find(entry => entry.title === title);
        if (!item) return;

        if (button.dataset.action === 'inc') item.quantity += 1;
        if (button.dataset.action === 'dec') item.quantity -= 1;
        if (button.dataset.action === 'remove' || item.quantity <= 0) {
            cart = cart.filter(entry => entry.title !== title);
        }

        saveCart();
        renderSummary();
    });
}

// ---------- payment method ----------

function selectedPayment() {
    const checked = document.querySelector('input[name="payment"]:checked');
    return checked ? checked.value : 'cod';
}

function setInputsDisabled(container, disabled) {
    container.querySelectorAll('input').forEach(input => {
        input.disabled = disabled;
    });
}

function syncPaymentFields() {
    const method = selectedPayment();
    const upiFields = el('upi-fields');
    const cardFields = el('card-fields');

    if (upiFields) {
        upiFields.classList.toggle('d-none', method !== 'upi');
        setInputsDisabled(upiFields, method !== 'upi');
    }
    if (cardFields) {
        cardFields.classList.toggle('d-none', method !== 'card');
        setInputsDisabled(cardFields, method !== 'card');
    }

    document.querySelectorAll('.payment-option').forEach(option => {
        const input = option.querySelector('input');
        option.classList.toggle('active', Boolean(input && input.checked));
    });
}

document.querySelectorAll('input[name="payment"]').forEach(input => {
    input.addEventListener('change', syncPaymentFields);
});

// Friendly formatting while typing
const cardNumber = el('cardNumber');
if (cardNumber) {
    cardNumber.addEventListener('input', () => {
        const digits = cardNumber.value.replace(/\D/g, '').slice(0, 16);
        cardNumber.value = digits.replace(/(.{4})/g, '$1 ').trim();
    });
}

const cardExpiry = el('cardExpiry');
if (cardExpiry) {
    cardExpiry.addEventListener('input', () => {
        const digits = cardExpiry.value.replace(/\D/g, '').slice(0, 4);
        cardExpiry.value = digits.length > 2 ? digits.slice(0, 2) + '/' + digits.slice(2) : digits;
    });
}

const cardCvv = el('cardCvv');
if (cardCvv) {
    cardCvv.addEventListener('input', () => {
        cardCvv.value = cardCvv.value.replace(/\D/g, '').slice(0, 3);
    });
}

// ---------- prefill ----------

function setField(id, value) {
    const field = el(id);
    if (field && !field.value && value) field.value = value;
}

// Reuse the address of the previous order so repeat checkouts are quick
async function prefillFromLastOrder() {
    try {
        const data = await API.request('/api/orders');
        const last = data && data.orders && data.orders[0];
        if (!last) return;

        if (last.customer) {
            setField('phone', last.customer.phone);
            setField('email', last.customer.email);
        }
        if (last.address) {
            setField('address', last.address.line);
            setField('city', last.address.city);
            setField('state', last.address.state);
            setField('pin', last.address.pin);
            setField('notes', last.address.notes);
        }
    } catch (error) {
        console.warn('Could not prefill from the last order:', error.message);
    }
}

function deliveryEstimate(placedAt) {
    const date = placedAt ? new Date(placedAt) : new Date();
    date.setDate(date.getDate() + 3);
    return date.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short' });
}

function showSuccess(order) {
    const setText = (id, text) => {
        const node = el(id);
        if (node) node.textContent = text;
    };

    setText('success-name', (order.customer && order.customer.name ? order.customer.name : 'there').split(' ')[0]);
    setText('success-order-id', '#' + order.id);
    setText('success-total', formatINR(order.total));
    setText('success-payment', PAYMENT_LABELS[order.payment] || order.payment);
    setText('success-eta', deliveryEstimate(order.placedAt));
    setText('success-address',
        `${order.address.line}, ${order.address.city}, ${order.address.state} — ${order.address.pin}`);

    if (el('checkout-cart-count')) el('checkout-cart-count').textContent = '0';

    showState('success');
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ---------- placing the order ----------

const placeOrderBtn = el('place-order');
let busy = false;

const form = el('checkout-form');
if (form) {
    form.addEventListener('submit', async event => {
        event.preventDefault();
        if (busy || cart.length === 0) return;

        form.classList.add('was-validated');
        if (!form.checkValidity()) {
            form.reportValidity();
            return;
        }

        clearError();
        busy = true;
        if (placeOrderBtn) {
            placeOrderBtn.disabled = true;
            placeOrderBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Placing order…';
        }

        try {
            const { order } = await API.request('/api/orders', {
                method: 'POST',
                body: {
                    items: cart.map(item => ({
                        title: item.title,
                        price: item.price,
                        quantity: item.quantity,
                        unit: item.unit
                    })),
                    payment: selectedPayment(),
                    customer: {
                        name: el('fullName').value.trim(),
                        phone: el('phone').value.trim(),
                        email: el('email').value.trim()
                    },
                    address: {
                        line: el('address').value.trim(),
                        city: el('city').value.trim(),
                        state: el('state').value,
                        pin: el('pin').value.trim(),
                        notes: el('notes').value.trim()
                    }
                }
            });

            cart = [];
            saveCart();
            showSuccess(order);
        } catch (error) {
            if (error.status === 401) {
                showState('auth');
            } else {
                showError(error.message || 'Could not place the order. Please try again.');
            }
        } finally {
            busy = false;
            if (placeOrderBtn) {
                placeOrderBtn.disabled = false;
                placeOrderBtn.innerHTML = '<i class="fas fa-lock me-2"></i>Place Order';
            }
        }
    });
}

// ---------- boot ----------

async function boot() {
    let user = null;

    try {
        const data = await API.request('/api/auth/me');
        user = data.user;
    } catch (error) {
        showState('form');
        showError('Cannot reach the server. Start it with "npm start" and reload this page.');
        if (placeOrderBtn) placeOrderBtn.disabled = true;
        return;
    }

    if (!user) {
        showState('auth');
        return;
    }

    if (cart.length === 0) {
        showState('empty');
        if (el('checkout-cart-count')) el('checkout-cart-count').textContent = '0';
        return;
    }

    showState('form');
    renderSummary();

    setField('fullName', user.name);
    setField('email', user.email);

    prefillFromLastOrder();
}

syncPaymentFields();
boot();
