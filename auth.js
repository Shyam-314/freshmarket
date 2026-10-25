// auth.js — shared logic for signin.html and signup.html.
// The session is created by the API (MySQL + httpOnly cookie), so nothing is
// stored in localStorage here.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// ?next=checkout.html is carried through the auth pages
const nextTarget = (() => {
    const match = /[?&]next=([A-Za-z0-9._-]+\.html)/.exec(window.location.search || '');
    return match ? match[1] : 'index.html';
})();

const alertBox = document.getElementById('auth-alert');
const submitBtn = document.getElementById('auth-submit');
const idleLabel = submitBtn ? submitBtn.textContent.trim() : 'Continue';

function showError(message) {
    if (!alertBox) return;
    alertBox.textContent = message;
    alertBox.classList.remove('d-none');
}

function clearError() {
    if (alertBox) alertBox.classList.add('d-none');
}

function markInvalid(id) {
    const field = document.getElementById(id);
    if (field) field.classList.add('is-invalid');
}

function clearInvalid(form) {
    if (form) form.querySelectorAll('.is-invalid').forEach(field => field.classList.remove('is-invalid'));
}

function fieldValue(id) {
    const field = document.getElementById(id);
    return field ? field.value : '';
}

function setBusy(busy) {
    if (!submitBtn) return;
    submitBtn.disabled = busy;
    submitBtn.innerHTML = busy
        ? '<span class="spinner-border spinner-border-sm me-2"></span>Please wait…'
        : idleLabel;
}

// ---------- show / hide password ----------

document.querySelectorAll('[data-toggle-password]').forEach(button => {
    button.addEventListener('click', () => {
        const input = document.getElementById(button.dataset.togglePassword);
        if (!input) return;

        const showing = input.type === 'text';
        input.type = showing ? 'password' : 'text';

        button.setAttribute('aria-pressed', String(!showing));
        button.setAttribute('aria-label', showing ? 'Show password' : 'Hide password');
        button.innerHTML = showing
            ? '<i class="fas fa-eye"></i>'
            : '<i class="fas fa-eye-slash"></i>';

        input.focus();
        try {
            input.setSelectionRange(input.value.length, input.value.length);
        } catch (error) {
            /* some browsers refuse selection on password inputs — harmless */
        }
    });
});

// ---------- keep ?next= on the cross links ----------

if (nextTarget !== 'index.html') {
    document.querySelectorAll('a[data-auth-link]').forEach(link => {
        link.href = link.dataset.base + '?next=' + encodeURIComponent(nextTarget);
        link.addEventListener('click', () => { /* keep the href, which already carries next */ });
    });
}

// ---------- sign in ----------

const signinForm = document.getElementById('signin-form');
if (signinForm) {
    signinForm.addEventListener('input', event => {
        if (event.target.classList) event.target.classList.remove('is-invalid');
        clearError();
    });

    signinForm.addEventListener('submit', async event => {
        event.preventDefault();

        clearError();
        clearInvalid(signinForm);

        const email = fieldValue('email').trim().toLowerCase();
        const password = fieldValue('password');
        const remember = document.getElementById('remember');

        let valid = true;
        if (!EMAIL_RE.test(email)) { markInvalid('email'); valid = false; }
        if (!password) { markInvalid('password'); valid = false; }
        if (!valid) {
            showError('Please enter a valid email address and your password.');
            return;
        }

        setBusy(true);
        try {
            await API.request('/api/auth/login', {
                method: 'POST',
                body: { email, password, remember: remember ? remember.checked : true }
            });
            window.location.href = nextTarget;
        } catch (error) {
            if (error.status === 401) {
                showError('That email and password do not match. Please try again.');
                markInvalid('password');
            } else {
                showError(error.message || 'Could not sign in. Please try again.');
            }
            setBusy(false);
        }
    });
}

// ---------- sign up ----------

const signupForm = document.getElementById('signup-form');
if (signupForm) {
    signupForm.addEventListener('input', event => {
        if (event.target.classList) event.target.classList.remove('is-invalid');
        clearError();
    });

    signupForm.addEventListener('submit', async event => {
        event.preventDefault();

        clearError();
        clearInvalid(signupForm);

        const name = fieldValue('name').trim();
        const email = fieldValue('email').trim().toLowerCase();
        const password = fieldValue('password');
        const confirmPassword = fieldValue('confirmPassword');

        let valid = true;
        if (name.length < 2) { markInvalid('name'); valid = false; }
        if (!EMAIL_RE.test(email)) { markInvalid('email'); valid = false; }
        if (password.length < 8) { markInvalid('password'); valid = false; }
        if (password !== confirmPassword) { markInvalid('confirmPassword'); valid = false; }

        if (!valid) {
            if (password.length < 8) {
                showError('Your password needs at least 8 characters.');
            } else if (password !== confirmPassword) {
                showError('The two passwords do not match.');
            } else {
                showError('Please fill in your name and a valid email address.');
            }
            return;
        }

        setBusy(true);
        try {
            await API.request('/api/auth/register', {
                method: 'POST',
                body: { name, email, password }
            });
            window.location.href = nextTarget;
        } catch (error) {
            if (error.status === 409) {
                showError('An account with this email already exists. Try signing in instead.');
                markInvalid('email');
            } else {
                showError(error.message || 'Could not create the account. Please try again.');
            }
            setBusy(false);
        }
    });
}
