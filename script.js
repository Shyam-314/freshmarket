const CART_KEY = 'freshmarketCart';

// Restored on load, so the cart survives a refresh and can be read by checkout.html
let cart = [];
try {
    const storedCart = JSON.parse(localStorage.getItem(CART_KEY) || '[]');
    if (Array.isArray(storedCart)) cart = storedCart;
} catch (error) {
    cart = [];
}

function saveCart() {
    try {
        localStorage.setItem(CART_KEY, JSON.stringify(cart));
    } catch (error) {
        console.warn('Could not save the cart:', error);
    }
}

// ---------- account session ----------

// The session lives in MySQL and is carried by an httpOnly cookie, so this is
// only a cached copy for the navbar.
let currentUser = null;

function initialsFrom(name) {
    const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return '?';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// Signed in? Swap the "Sign In" button for the profile avatar
function refreshAuthUI() {
    const signinBtn = document.getElementById('signin-btn');
    const profileBtn = document.getElementById('profile-btn');
    const initials = document.getElementById('profile-initials');

    if (signinBtn) signinBtn.classList.toggle('d-none', Boolean(currentUser));
    if (profileBtn) profileBtn.classList.toggle('d-none', !currentUser);
    if (initials) initials.textContent = currentUser ? initialsFrom(currentUser.name) : '?';
}

// Ask the API who is signed in (the cookie belongs to that request)
async function loadSession() {
    try {
        const data = await API.request('/api/auth/me');
        currentUser = data && data.user ? data.user : null;
    } catch (error) {
        currentUser = null;
        console.warn('Could not read the session:', error.message);
    }
    refreshAuthUI();
}

    // Prices are stored as whole rupees; show them with Indian digit grouping (₹1,529)
    const formatINR = amount => '₹' + amount.toLocaleString('en-IN', { maximumFractionDigits: 2 });

    const cartCountDisplay = document.getElementById('cart-count');
    const cartItemsBody = document.getElementById('cart-items-body');
    const cartTotalPriceDisplay = document.getElementById('cart-total-price');
    const cartEmptyMsg = document.getElementById('cart-empty-msg');
    const cartTableWrapper = document.getElementById('cart-table-wrapper');
    const checkoutBtn = document.getElementById('checkout-btn');

    // Add to Cart Handlers
    document.querySelectorAll('.add-to-cart').forEach(button => {
        button.addEventListener('click', function() {
            const card = this.closest('.card-body');
            const title = card.querySelector('.card-title').textContent.trim();
            const priceText = card.querySelector('h6').textContent;
            
            // Extract numeric price (e.g. "₹359 / kg" -> 359) and the unit ("kg")
            const price = parseFloat(priceText.replace(/[^0-9.]/g, ''));
            const unit = priceText.includes('/') ? priceText.split('/')[1].trim() : '';
            const image = card.parentElement.querySelector('img');

            addToCart(title, price, unit, image ? image.getAttribute('src') : '');

            // Visual feedback on button
            const originalText = this.textContent;
            this.textContent = 'Added!';
            this.classList.replace('btn-success', 'btn-secondary');
            setTimeout(() => {
                this.textContent = originalText;
                this.classList.replace('btn-secondary', 'btn-success');
            }, 1000);
        });
    });

    // Checkout happens on its own page, which reads the saved cart
    checkoutBtn.addEventListener('click', () => {
        saveCart();
        window.location.href = 'checkout.html';
    });

    // Reflect a restored cart in the navbar badge straight away
    renderCart();

    // Ask the API who is signed in (the session cookie lives on the server)
    loadSession();

    function addToCart(title, price, unit = '', image = '') {
        const existingItem = cart.find(item => item.title === title);
        if (existingItem) {
            existingItem.quantity += 1;
        } else {
            cart.push({ title, price, quantity: 1, unit, image });
        }
        renderCart();
    }

    function updateQuantity(title, change) {
        const item = cart.find(item => item.title === title);
        if (item) {
            item.quantity += change;
            if (item.quantity <= 0) {
                cart = cart.filter(i => i.title !== title);
            }
        }
        renderCart();
    }

    function removeItem(title) {
        cart = cart.filter(item => item.title !== title);
        renderCart();
    }

    function renderCart() {
        saveCart();

        // Calculate Total Quantity & Total Price
        const totalCount = cart.reduce((sum, item) => sum + item.quantity, 0);
        const totalPrice = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);

        // Update Nav Count
        cartCountDisplay.textContent = totalCount;
        cartTotalPriceDisplay.textContent = formatINR(totalPrice);

        // Toggle Empty Cart State
        if (cart.length === 0) {
            cartEmptyMsg.style.display = 'block';
            cartTableWrapper.style.display = 'none';
            checkoutBtn.disabled = true;
            return;
        }

        cartEmptyMsg.style.display = 'none';
        cartTableWrapper.style.display = 'block';
        checkoutBtn.disabled = false;

        // Render Table Rows
        cartItemsBody.innerHTML = cart.map(item => `
            <tr>
                <td class="fw-semibold">${item.title}</td>
                <td>${formatINR(item.price)}</td>
                <td>
                    <div class="input-group input-group-sm">
                        <button class="btn btn-outline-secondary" onclick="updateQuantity('${item.title}', -1)">-</button>
                        <span class="input-group-text bg-white px-3">${item.quantity}</span>
                        <button class="btn btn-outline-secondary" onclick="updateQuantity('${item.title}', 1)">+</button>
                    </div>
                </td>
                <td class="text-end fw-bold">${formatINR(item.price * item.quantity)}</td>
                <td class="text-end">
                    <button class="btn btn-sm btn-outline-danger border-0" onclick="removeItem('${item.title}')">
                        <i class="fas fa-trash"></i>
                    </button>
                </td>
            </tr>
        `).join('');
    }

    // Live Search Filter (retained)
    const searchInput = document.getElementById('searchInput');
    const sections = document.querySelectorAll('main section');

    searchInput.addEventListener('input', function(e) {
        const query = e.target.value.toLowerCase().trim();

        // Hide the hero banner while a search is active, so the results start
        // at the top of the page instead of below the hero image.
        const heroSection = document.querySelector('.hero-section');
        if (heroSection) {
            heroSection.classList.toggle('d-none', query !== '');
        }

        sections.forEach(section => {
            // Category labels for this section: its heading ("Seasonal Fruits")
            // plus the navbar link that jumps to it ("Fruits", "Meat & Fish").
            // Joining both means "fruits", "vegetables" and "fish" all work.
            const heading = section.querySelector('h2');
            const navLink = document.querySelector(`a.nav-link[href="#${section.id}"]`);
            const categoryText = (
                (heading ? heading.textContent : '') + ' ' +
                (navLink ? navLink.textContent : '')
            ).toLowerCase();

            // A query that names the category reveals the whole section.
            // The word-start check stops "s" or "ea" from matching everything.
            const safeQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const categoryMatch = safeQuery.length >= 3 &&
                new RegExp(`(^|[^a-z])${safeQuery}`).test(categoryText);

            // Bootstrap's row-cols-* grid puts each product in a direct child
            // of .row (class="col"), so match those. .col-md-3 / .col-sm-6
            // never appear in this markup.
            const productCols = section.querySelectorAll('.row > *');
            let visibleInSection = 0;

            productCols.forEach(col => {
                const title = col.querySelector('.card-title') ? col.querySelector('.card-title').textContent.toLowerCase() : '';
                const subtitle = col.querySelector('.text-muted') ? col.querySelector('.text-muted').textContent.toLowerCase() : '';

                if (categoryMatch || title.includes(query) || subtitle.includes(query)) {
                    col.classList.remove('d-none');
                    visibleInSection++;
                } else {
                    col.classList.add('d-none');
                }
            });

            if (visibleInSection === 0 && query !== '') {
                section.classList.add('d-none');
            } else {
                section.classList.remove('d-none');
            }
        });

        applyAllCollapse();
        updateNoResults(query);
    });

// ---------- product sections: one row at a time ----------

const sectionRows = [];

const escapeText = value => String(value).replace(/[&<>"']/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[ch]));

function productsPerRow() {
    if (typeof window.matchMedia === 'function') {
        if (window.matchMedia('(min-width: 992px)').matches) return 5;
        if (window.matchMedia('(min-width: 768px)').matches) return 3;
        return 2;
    }
    return 5;
}

function searchingNow() {
    return Boolean(searchInput && searchInput.value.trim());
}

function applyCollapse(state) {
    if (!state || state.items.length === 0) return;

    const perRow = productsPerRow();
    const label = state.label;
    const icon = state.icon;

    // While searching, show every match and hide the toggle
    if (searchingNow()) {
        state.control.classList.add('d-none');
        state.items.forEach(item => item.classList.remove('product-hidden'));
        return;
    }

    const hideExtras = !state.expanded && state.items.length > perRow;
    state.items.forEach((item, index) => {
        item.classList.toggle('product-hidden', hideExtras && index >= perRow);
    });

    state.control.classList.toggle('d-none', state.items.length <= perRow);

    if (label) label.textContent = state.expanded ? 'Show less' : 'Show all ' + state.items.length;
    if (icon) icon.className = state.expanded ? 'fas fa-chevron-up ms-2' : 'fas fa-chevron-down ms-2';
    if (state.button && state.button.setAttribute) {
        state.button.setAttribute('aria-expanded', String(state.expanded));
    }
}

function applyAllCollapse() {
    sectionRows.forEach(applyCollapse);
}

function updateNoResults(query) {
    const box = document.getElementById('no-results');
    if (!box) return;

    const anyVisible = Array.from(sections).some(section => !section.classList.contains('d-none'));
    const show = Boolean(query) && !anyVisible;

    box.classList.toggle('d-none', !show);
    if (show) {
        box.innerHTML = 'No groceries matched <strong>' + escapeText(query) + '</strong>. ' +
            'Try “apple”, “milk” or a section like “fruits”.';
    }
}

function initProductSections() {
    const allSections = document.querySelectorAll('main section');
    if (!allSections.length) return;

    allSections.forEach(section => {
        const row = section.querySelector('.row');
        if (!row) return;

        const items = Array.from(row.children).filter(child => child.classList.contains('col'));
        if (items.length === 0) return;

        const badge = section.querySelector('[data-product-count]');
        if (badge) badge.textContent = items.length + ' items';

        const control = document.createElement('div');
        control.className = 'text-center mt-3 section-more';

        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'btn btn-outline-success rounded-pill px-4';

        const label = document.createElement('span');
        label.className = 'label';
        label.textContent = 'Show all ' + items.length;

        const icon = document.createElement('i');
        icon.className = 'fas fa-chevron-down ms-2';

        button.appendChild(label);
        button.appendChild(icon);
        control.appendChild(button);
        row.after(control);

        const state = { section, row, items, control, button, label, icon, expanded: false };
        sectionRows.push(state);

        button.addEventListener('click', () => {
            state.expanded = !state.expanded;
            applyCollapse(state);
        });

        applyCollapse(state);
    });

    let resizeTimer = null;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(applyAllCollapse, 150);
    });
}

initProductSections();
