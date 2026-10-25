// profile.js — FreshMarket account page, backed by the API (MySQL).
// The session lives on the server (session cookie), so this page only asks for
// the current user and their order history.

const formatINR = amount =>
    '₹' + Number(amount).toLocaleString('en-IN', { maximumFractionDigits: 2 });

const escapeHtml = value => String(value).replace(/[&<>"']/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[ch]));

const PAYMENT_LABELS = { cod: 'Cash on Delivery', upi: 'UPI', card: 'Card' };
const STATUS_LABELS = {
    placed: 'Placed',
    packed: 'Packed',
    out_for_delivery: 'Out for delivery',
    delivered: 'Delivered',
    cancelled: 'Cancelled'
};

const el = id => document.getElementById(id);
const show = node => { if (node) node.classList.remove('d-none'); };
const hide = node => { if (node) node.classList.add('d-none'); };

function initialsFrom(name) {
    const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return '?';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function formatDate(value) {
    const date = value ? new Date(value) : null;
    if (!date || isNaN(date)) return 'Date unavailable';
    return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function showError(message) {
    const box = el('profile-error');
    if (!box) return;
    box.textContent = message;
    show(box);
}

function renderUser(user) {
    const initials = initialsFrom(user.name);
    const setText = (id, text) => {
        const node = el(id);
        if (node) node.textContent = text;
    };

    setText('nav-initials', initials);
    setText('profile-initials', initials);
    setText('profile-name', user.name);
    setText('profile-email', user.email || '—');

    const joined = user.joinedAt ? new Date(user.joinedAt) : null;
    setText('profile-joined', joined && !isNaN(joined)
        ? joined.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })
        : '—');
}

function orderCard(order) {
    const items = Array.isArray(order.items) ? order.items : [];
    const count = items.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0);
    const summary = items.map(item => `${escapeHtml(item.title)} × ${item.quantity}`).join(', ');
    const status = STATUS_LABELS[order.status] || order.status || 'Placed';

    return `
        <div class="profile-order p-3">
            <div class="d-flex justify-content-between align-items-start gap-2">
                <div>
                    <div class="fw-semibold small">#${escapeHtml(order.id || '—')}</div>
                    <div class="text-muted small">
                        ${formatDate(order.placedAt)} · ${count} item${count === 1 ? '' : 's'} ·
                        ${escapeHtml(PAYMENT_LABELS[order.payment] || order.payment || '—')}
                    </div>
                </div>
                <div class="text-end">
                    <div class="fw-bold text-success">${formatINR(order.total || 0)}</div>
                    <span class="badge bg-light text-dark border mt-1">${escapeHtml(status)}</span>
                </div>
            </div>
            ${summary ? `<div class="text-muted small mt-2">${summary}</div>` : ''}
        </div>`;
}

function renderOrders(orders) {
    const list = el('orders-list');
    const empty = el('orders-empty');
    if (!list || !empty) return;

    if (!orders || orders.length === 0) {
        list.innerHTML = '';
        show(empty);
        return;
    }

    hide(empty);
    list.innerHTML = orders.map(orderCard).join('');
}

// ---------- boot ----------

async function boot() {
    let user = null;

    try {
        const data = await API.request('/api/auth/me');
        user = data.user;
    } catch (error) {
        showError('Cannot reach the server. Start it with "npm start" and reload this page.');
        return;
    }

    if (!user) {
        hide(el('profile-content'));
        show(el('profile-signed-out'));
        return;
    }

    hide(el('profile-signed-out'));
    show(el('profile-content'));
    renderUser(user);

    try {
        const data = await API.request('/api/orders');
        renderOrders(data.orders || []);
    } catch (error) {
        renderOrders([]);
        showError('Could not load your orders: ' + error.message);
    }
}

// ---------- logout ----------

const logoutBtn = el('logout-btn');
if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
        logoutBtn.disabled = true;
        try {
            await API.request('/api/auth/logout', { method: 'POST' });
        } catch (error) {
            console.warn('Logout request failed:', error.message);
        }
        window.location.href = 'index.html';
    });
}

boot();
