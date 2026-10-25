// memory-repo.js — in-memory stand-in for server/repo.js, used by the tests so
// they can run without MySQL. Same interface, same returned shapes.
function createMemoryRepo() {
    const users = [];
    const orders = [];
    let nextUserId = 1;

    return {
        async ping() { return true; },

        async findUserByEmail(email) {
            const user = users.find(entry => entry.email === email);
            return user ? { ...user } : null;
        },

        async findUserById(id) {
            const user = users.find(entry => entry.id === id);
            return user
                ? { id: user.id, name: user.name, email: user.email, joinedAt: user.joinedAt }
                : null;
        },

        async createUser({ name, email, passwordHash }) {
            const user = { id: nextUserId, name, email, passwordHash, joinedAt: new Date().toISOString() };
            nextUserId += 1;
            users.push(user);
            return { id: user.id, name: user.name, email: user.email, joinedAt: user.joinedAt };
        },

        async createOrder(userId, order) {
            orders.push({
                ...order,
                userId,
                status: 'placed',
                placedAt: new Date().toISOString()
            });
            return order.publicId;
        },

        async listOrdersByUser(userId) {
            return orders
                .filter(order => order.userId === userId)
                .map(order => ({
                    id: order.publicId,
                    placedAt: order.placedAt,
                    payment: order.payment,
                    status: order.status,
                    subtotal: order.subtotal,
                    delivery: order.delivery,
                    total: order.total,
                    customer: order.customer,
                    address: order.address,
                    items: order.items
                }));
        }
    };
}

module.exports = { createMemoryRepo };
