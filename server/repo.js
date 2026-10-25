// repo.js — every SQL statement lives here. The rest of the server only talks to
// this small interface, which also makes the API testable with a fake repository.

function iso(value) {
    if (value instanceof Date) return value.toISOString();
    return new Date(value).toISOString();
}

function toUser(row) {
    return {
        id: row.id,
        name: row.name,
        email: row.email,
        joinedAt: iso(row.created_at)
    };
}

function toOrder(row) {
    return {
        id: row.public_id,
        placedAt: iso(row.placed_at),
        payment: row.payment_method,
        status: row.status,
        subtotal: Number(row.subtotal),
        delivery: Number(row.delivery_fee),
        total: Number(row.total),
        customer: {
            name: row.customer_name,
            email: row.customer_email,
            phone: row.customer_phone
        },
        address: {
            line: row.address_line,
            city: row.city,
            state: row.state,
            pin: row.pin,
            notes: row.notes || ''
        }
    };
}

function createRepository(pool) {
    return {
        async ping() {
            await pool.query('SELECT 1');
            return true;
        },

        async findUserByEmail(email) {
            const [rows] = await pool.query(
                'SELECT id, name, email, password_hash, created_at FROM users WHERE email = ? LIMIT 1',
                [email]
            );
            if (!rows[0]) return null;
            return {
                id: rows[0].id,
                name: rows[0].name,
                email: rows[0].email,
                passwordHash: rows[0].password_hash,
                joinedAt: iso(rows[0].created_at)
            };
        },

        async findUserById(id) {
            const [rows] = await pool.query(
                'SELECT id, name, email, created_at FROM users WHERE id = ? LIMIT 1',
                [id]
            );
            return rows[0] ? toUser(rows[0]) : null;
        },

        async createUser({ name, email, passwordHash }) {
            const [result] = await pool.query(
                'INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)',
                [name, email, passwordHash]
            );
            const [rows] = await pool.query(
                'SELECT id, name, email, created_at FROM users WHERE id = ?',
                [result.insertId]
            );
            return toUser(rows[0]);
        },

        // Writes the order and its line items in one transaction.
        async createOrder(userId, order) {
            const connection = await pool.getConnection();
            try {
                await connection.beginTransaction();

                const [result] = await connection.query(
                    `INSERT INTO orders
                        (public_id, user_id, payment_method, subtotal, delivery_fee, total,
                         customer_name, customer_email, customer_phone,
                         address_line, city, state, pin, notes)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [
                        order.publicId, userId, order.payment, order.subtotal, order.delivery, order.total,
                        order.customer.name, order.customer.email, order.customer.phone,
                        order.address.line, order.address.city, order.address.state, order.address.pin,
                        order.address.notes
                    ]
                );

                const orderId = result.insertId;
                for (const item of order.items) {
                    await connection.query(
                        'INSERT INTO order_items (order_id, title, unit, price, quantity) VALUES (?, ?, ?, ?, ?)',
                        [orderId, item.title, item.unit, item.price, item.quantity]
                    );
                }

                await connection.commit();
                return order.publicId;
            } catch (error) {
                await connection.rollback();
                throw error;
            } finally {
                connection.release();
            }
        },

        async listOrdersByUser(userId) {
            const [orders] = await pool.query(
                `SELECT id, public_id, payment_method, status, subtotal, delivery_fee, total,
                        customer_name, customer_email, customer_phone,
                        address_line, city, state, pin, notes, placed_at
                 FROM orders
                 WHERE user_id = ?
                 ORDER BY placed_at DESC, id DESC`,
                [userId]
            );
            if (orders.length === 0) return [];

            const [items] = await pool.query(
                'SELECT order_id, title, unit, price, quantity FROM order_items WHERE order_id IN (?)',
                [orders.map(order => order.id)]
            );

            return orders.map(order => ({
                ...toOrder(order),
                items: items
                    .filter(item => item.order_id === order.id)
                    .map(item => ({
                        title: item.title,
                        unit: item.unit,
                        price: Number(item.price),
                        quantity: item.quantity
                    }))
            }));
        }
    };
}

module.exports = { createRepository };
