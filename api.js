/* api.js — tiny fetch helper shared by every page.
   JSON in, JSON out, and the session cookie always travels with the request. */
window.API = {
    async request(path, { method = 'GET', body } = {}) {
        const options = {
            method,
            credentials: 'same-origin',
            headers: {}
        };

        if (body !== undefined) {
            options.headers['Content-Type'] = 'application/json';
            options.body = JSON.stringify(body);
        }

        const response = await fetch(path, options);
        const raw = await response.text();

        let data = null;
        if (raw) {
            try {
                data = JSON.parse(raw);
            } catch (error) {
                data = null;
            }
        }

        if (!response.ok) {
            const message = (data && data.error) || 'Request failed (' + response.status + ')';
            const error = new Error(message);
            error.status = response.status;
            error.data = data;
            throw error;
        }

        return data;
    }
};
