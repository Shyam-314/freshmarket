# FreshMarket — Node + MySQL

**Live site:** <https://freshmarket-qcof.onrender.com/> · **Health check:** <https://freshmarket-qcof.onrender.com/api/health>

| | |
|---|---|
| Front end | HTML, Bootstrap 5, vanilla JS — 5 pages |
| Back end | Node 18+, Express, `express-session` (MySQL store) |
| Database | MySQL 8 — local for development, **Aiven** free tier in production |
| Hosting | **Render** free web service, auto-deploys from `main` |

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
| GET | `/api/health` | — | `{status, database}` — used to check the deployment |
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

## Notes

- This is a demo shop: card/UPI fields are **not** sent to any payment gateway.
- Products still live in `index.html` (they were never in `localStorage`). Moving
  them into a `products` table is the natural next step.
- The session cookie is automatically `Secure` when `NODE_ENV=production`, and
  `trust proxy` is enabled so HTTPS works behind Render's proxy.

---

## Deployment (already live)

| | |
|---|---|
| Live site | <https://freshmarket-qcof.onrender.com/> |
| Health | <https://freshmarket-qcof.onrender.com/api/health> |
| Host | Render — Web Service `freshmarket-shyam`, region Singapore, free instance |
| Database | Aiven MySQL (free plan), database `defaultdb`, TLS via `DB_SSL=true` |
| Repo | <https://github.com/Shyam-314/freshmarket> — pushes to `main` auto-deploy |

### Environment variables on Render

| Key | Value |
|---|---|
| `NODE_ENV` | `production` |
| `SESSION_SECRET` | long random string (never commit it) |
| `DB_HOST` / `DB_PORT` | from Aiven → Overview → Connection information |
| `DB_USER` | `avnadmin` |
| `DB_PASSWORD` | Aiven database password |
| `DB_NAME` | `defaultdb` |
| `DB_SSL` | `true` |

`PORT` is provided by Render — do not set it.

### Changing the live site

```powershell
cd "C:\Users\M SHYAM\Desktop\Groceries Webpage"
# edit + test locally at http://localhost:5000
git add -A
git commit -m "describe the change"
git push
```

Render rebuilds automatically. Schema changes are applied to Aiven with the same
`$env:` override trick used during setup:

```powershell
$env:DB_HOST="..."; $env:DB_PORT="..."; $env:DB_USER="avnadmin"
$env:DB_PASSWORD="..."; $env:DB_NAME="defaultdb"; $env:DB_SSL="true"
npm run migrate
```

### Testing the live deployment

```powershell
$env:SMOKE_URL="https://freshmarket-qcof.onrender.com"
npm run smoke
```

The first request after ~15 minutes of inactivity can take 30–60 seconds: the
free Render instance sleeps when nobody visits. Aiven may also power off an idle
free database; you can power it back on from the Aiven console and the data is
kept.

### Renaming the URL

Render assigns the `*.onrender.com` address at creation, so renaming the service
does not change it. A branded link needs a custom domain: **Settings → Custom
Domains** in Render, then a CNAME at your DNS provider (or a free
`*.is-a.dev` subdomain).
