# FreshMarket — Node + MySQL

The shop used to keep accounts, sessions and orders in `localStorage`. They now
live in **MySQL**, reached through a small **Express** API. The pages are served
by the same server, so the session cookie and the API share one origin.

## What lives where

| Data | Where | Notes |
|---|---|---|
| Accounts | `users` table | Passwords are hashed with bcrypt (never stored in the browser) |
| Sessions | `sessions` table | `express-mysql-session`; an httpOnly cookie holds the id |
| Orders + line items | `orders`, `order_items` | Written in one transaction |
| Cart | `localStorage` | Temporary UI state; not personal data |

## Pages

| Page | What it does |
|---|---|
| `index.html` | Store: search, six categories (one row each, with **Show all**), cart drawer |
| `signin.html` | Sign in — show/hide password, “keep me signed in”, returns to checkout when asked |
| `signup.html` | Create an account — inline validation, confirm password, signs you in immediately |
| `checkout.html` | Delivery details + payment method, places the order in MySQL |
| `profile.html` | Your account, order history and **Log out** |

---

## 1. Install MySQL 8 (once)

1. Download **MySQL Installer (Community)** from
   <https://dev.mysql.com/downloads/installer/> and run it.
2. Choose **Custom** or **Server only**, then install **MySQL Server 8.x**.
   (You do not need Workbench, though it is handy.)
3. In the configuration step:
   - Config type: **Development Computer**
   - Port: **3306** (the default)
   - Authentication: **Strong Password Encryption**
   - Root password: pick one and remember it
   - Windows Service: **MySQL80**, start at startup ✅
4. Finish the installer, then open a **new** terminal so `mysql` is on `PATH`.

Check it:

```powershell
mysql --version
Get-Service MySQL80
```

> If `mysql` is "not recognised", use the full path, e.g.
> `"C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe"`, or add that `bin`
> folder to `PATH`.

## 2. Create the database and its user

Open MySQL as root (the `mysql` client prompts for the root password):

```powershell
mysql -u root -p
```

Paste this, changing the password:

```sql
CREATE DATABASE freshmarket CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'freshmarket'@'localhost' IDENTIFIED BY 'ChangeMe123!';
GRANT ALL PRIVILEGES ON freshmarket.* TO 'freshmarket'@'localhost';
FLUSH PRIVILEGES;
EXIT;
```

`npm run migrate` would also create the database, but the app user still needs
to exist — that is what this step is for.

## 3. Configure the app

A starter `.env` is already in the project (git-ignored). Open it and adjust the
values if you chose a different database password in step 2:

```powershell
cd "C:\Users\M SHYAM\Desktop\Groceries Webpage"
notepad .env
```

Fill in:

```ini
PORT=5000
SESSION_SECRET=some-long-random-string
DB_HOST=localhost
DB_PORT=3306
DB_USER=freshmarket
DB_PASSWORD=ChangeMe123!
DB_NAME=freshmarket
```

`.env` is git-ignored — never commit real passwords.

## 4. Install, migrate, run

```powershell
npm install
npm run migrate     # creates users / orders / order_items
npm start           # http://localhost:5000
```

Open **http://localhost:5000** — not the `.html` files directly. The API and the
session cookie only work when the server is the one serving the pages.

Create an account, add items to the cart and place an order. Then look at the
data in MySQL:

```sql
USE freshmarket;
SELECT id, name, email, created_at FROM users;
SELECT public_id, total, status, placed_at FROM orders;
SELECT * FROM order_items;
```

## 5. Verify

```powershell
npm test        # API, frontend↔API, product-section and production-cookie suites (no database needed)
npm run smoke   # end-to-end against the running server (uses MySQL)
```

---

## API

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/api/health` | — | `{status, database}` — used by the navbar banner |
| POST | `/api/auth/register` | — | `{name, email, password}` → creates the account **and** the session |
| POST | `/api/auth/login` | — | `{email, password}` → session cookie |
| POST | `/api/auth/logout` | — | destroys the session |
| GET | `/api/auth/me` | — | `{user}` or `{user: null}` |
| GET | `/api/orders` | ✅ | the signed-in user's orders with items |
| POST | `/api/orders` | ✅ | places an order (totals are recomputed server-side) |

Totals are always recalculated on the server: `subtotal = Σ price × quantity`,
delivery is ₹49 below ₹499 and free from ₹499, and any `total` sent by the client
is ignored.

## Project structure

```
Groceries Webpage/
├─ index.html  checkout.html  profile.html
├─ signin.html  signup.html
├─ script.js   auth.js   checkout.js   profile.js   api.js
├─ style.css
├─ images/
├─ package.json     .env.example     .gitignore
└─ server/
   ├─ server.js        # starts the HTTP server
   ├─ app.js           # Express app + routes + validation
   ├─ repo.js          # all SQL lives here
   ├─ db.js            # mysql2 pools
   ├─ config.js        # reads .env
   ├─ sql/schema.sql   # tables
   ├─ scripts/migrate.js
   ├─ scripts/smoke.js
   ├─ testing/memory-repo.js
   ├─ test-api.js
   ├─ test-frontend.js
   └─ test-sections.js
```

## Troubleshooting

| Message | Meaning |
|---|---|
| `ECONNREFUSED` | MySQL is not running — `Get-Service MySQL80`, then `Start-Service MySQL80` |
| `ER_ACCESS_DENIED_ERROR` | Wrong `DB_USER` / `DB_PASSWORD` in `.env` |
| `ER_BAD_DB_ERROR` | Run `npm run migrate` |
| `EADDRINUSE :5000` | Another process uses port 5000 — change `PORT` in `.env` |
| `npm.ps1 cannot be loaded` | PowerShell blocks npm scripts — use `npm.cmd install` and `npm.cmd start` instead (or run npm from Command Prompt) |
| Navbar says "Backend offline" | You opened the `.html` file directly, or the server is stopped |
| Navbar says "Database unreachable" | The server runs but cannot query MySQL |

## Notes

- This is a demo shop: card/UPI fields are **not** sent to any payment gateway.
- Products still live in `index.html` (they were never in `localStorage`). Moving
  them into a `products` table is the natural next step.
- Change `secure: false` to `true` in `server/app.js` if you ever put this behind
  HTTPS.
