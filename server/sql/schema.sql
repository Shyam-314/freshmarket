-- FreshMarket schema (MySQL 8+)
-- Run with: npm run migrate

CREATE TABLE IF NOT EXISTS users (
    id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
    name          VARCHAR(120) NOT NULL,
    email         VARCHAR(190) NOT NULL,
    password_hash VARCHAR(100) NOT NULL,
    created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_users_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS orders (
    id             INT UNSIGNED NOT NULL AUTO_INCREMENT,
    public_id      VARCHAR(20) NOT NULL,
    user_id        INT UNSIGNED NOT NULL,
    payment_method ENUM('cod', 'upi', 'card') NOT NULL DEFAULT 'cod',
    status         ENUM('placed', 'packed', 'out_for_delivery', 'delivered', 'cancelled') NOT NULL DEFAULT 'placed',
    subtotal       DECIMAL(10, 2) NOT NULL,
    delivery_fee   DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    total          DECIMAL(10, 2) NOT NULL,
    customer_name  VARCHAR(120) NOT NULL,
    customer_email VARCHAR(190) NOT NULL,
    customer_phone VARCHAR(20) NOT NULL,
    address_line   VARCHAR(255) NOT NULL,
    city           VARCHAR(80) NOT NULL,
    state          VARCHAR(80) NOT NULL,
    pin            CHAR(6) NOT NULL,
    notes          VARCHAR(255) NULL,
    placed_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_orders_public_id (public_id),
    KEY idx_orders_user (user_id, placed_at),
    CONSTRAINT fk_orders_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS order_items (
    id       INT UNSIGNED NOT NULL AUTO_INCREMENT,
    order_id INT UNSIGNED NOT NULL,
    title    VARCHAR(120) NOT NULL,
    unit     VARCHAR(20) NULL,
    price    DECIMAL(10, 2) NOT NULL,
    quantity INT UNSIGNED NOT NULL,
    PRIMARY KEY (id),
    KEY idx_order_items_order (order_id),
    CONSTRAINT fk_order_items_order FOREIGN KEY (order_id) REFERENCES orders (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
