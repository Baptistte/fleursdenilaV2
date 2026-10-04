const Database = require('better-sqlite3');
const path = require('path');
const crypto = require('crypto');

// En prod/test (Railway), DB_PATH pointe vers le volume persistant (ex. /data/fleurs-de-nila.sqlite)
const db = new Database(process.env.DB_PATH || path.join(__dirname, 'fleurs-de-nila.sqlite'));

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    price REAL NOT NULL,
    images TEXT DEFAULT '[]',
    options TEXT DEFAULT '[]',
    stock INTEGER NOT NULL DEFAULT 0,
    active INTEGER NOT NULL DEFAULT 1,
    category_id INTEGER DEFAULT NULL,
    vat_rate REAL NOT NULL DEFAULT 20,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL
  );

  -- Catégories du catalogue (permanentes, saisonnières, deuil…). Un produit
  -- appartient à au plus une catégorie (category_id sur products) ; la
  -- supprimer ne supprime pas ses produits, elle les décatégorise (SET NULL).
  CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    type TEXT NOT NULL DEFAULT 'permanente' CHECK(type IN ('permanente', 'saisonniere', 'speciale')),
    position INTEGER NOT NULL DEFAULT 0,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS slots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL,
    start_time TEXT NOT NULL,
    end_time TEXT NOT NULL,
    reserved_until TEXT DEFAULT NULL,
    order_id INTEGER DEFAULT NULL,
    FOREIGN KEY (order_id) REFERENCES orders(id)
  );

  CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sumup_checkout_id TEXT,
    customer_name TEXT NOT NULL,
    customer_email TEXT NOT NULL,
    customer_phone TEXT,
    customer_address TEXT,
    slot_id INTEGER,
    items TEXT NOT NULL,
    total REAL NOT NULL,
    delivery_type TEXT NOT NULL CHECK(delivery_type IN ('delivery', 'pickup')),
    status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'paid', 'cancelled')),
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (slot_id) REFERENCES slots(id)
  );

  CREATE TABLE IF NOT EXISTS admins (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  );

  CREATE TABLE IF NOT EXISTS blocked_dates (
    date TEXT PRIMARY KEY
  );

  -- Journal des messages sortants (emails, et SMS à l'avenir).
  -- status : 'sent' (parti via Resend) | 'simulated' (pas de clé configurée) | 'failed'
  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    channel TEXT NOT NULL DEFAULT 'email' CHECK(channel IN ('email', 'sms')),
    template TEXT NOT NULL,
    recipient TEXT NOT NULL,
    subject TEXT,
    order_id INTEGER,
    status TEXT NOT NULL CHECK(status IN ('sent', 'simulated', 'failed')),
    error TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  -- Événements du tunnel de commande (amélioration continue, non affiché en admin).
  -- Ex. : 'payment_page_reached' = le client a validé son créneau et atteint l'étape paiement.
  CREATE TABLE IF NOT EXISTS checkout_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event TEXT NOT NULL,
    slot_id INTEGER,
    mode TEXT,
    cart_total REAL,
    items_count INTEGER,
    created_at TEXT DEFAULT (datetime('now'))
  );

  -- Réservations temporaires de créneau (10 min) : plusieurs clients peuvent
  -- retenir le même créneau tant que sa capacité n'est pas atteinte.
  CREATE TABLE IF NOT EXISTS slot_holds (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slot_id INTEGER NOT NULL,
    token TEXT NOT NULL UNIQUE,
    expires_at TEXT NOT NULL,
    FOREIGN KEY (slot_id) REFERENCES slots(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS calendar_tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    date TEXT NOT NULL,
    start_time TEXT NOT NULL,
    end_time TEXT NOT NULL,
    color TEXT NOT NULL DEFAULT '#3b82f6',
    notes TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  -- Demandes de devis depuis la page « Nos prestations »
  -- (mariage, professionnel, réception, deuil).
  CREATE TABLE IF NOT EXISTS quote_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category TEXT NOT NULL CHECK(category IN ('mariage', 'professionnel', 'reception', 'deuil')),
    name TEXT NOT NULL,
    phone TEXT,
    email TEXT,
    event_date TEXT,
    message TEXT,
    status TEXT NOT NULL DEFAULT 'nouvelle' CHECK(status IN ('nouvelle', 'traitee', 'archivee')),
    created_at TEXT DEFAULT (datetime('now'))
  );
`);

// Migrations légères (colonnes ajoutées après la création initiale)
try { db.exec('ALTER TABLE slots ADD COLUMN reservation_token TEXT DEFAULT NULL'); } catch { /* déjà appliquée */ }
try {
  db.exec('ALTER TABLE orders ADD COLUMN validated INTEGER NOT NULL DEFAULT 0');
  // Backfill unique : les commandes payées d'avant la mise en place du workflow sont considérées validées
  db.prepare("UPDATE orders SET validated = 1 WHERE status = 'paid'").run();
} catch { /* déjà appliquée */ }
// Capacité par créneau (nb de commandes acceptées sur le même créneau).
// Les colonnes slots.reserved_until / reservation_token / order_id de l'ancien
// modèle exclusif ne sont plus utilisées (remplacées par slot_holds + comptage des commandes).
try { db.exec('ALTER TABLE slots ADD COLUMN capacity INTEGER NOT NULL DEFAULT 3'); } catch { /* déjà appliquée */ }
// Commentaire libre du client au fleuriste (distinct du message par article, joint au bouquet)
try { db.exec("ALTER TABLE orders ADD COLUMN customer_note TEXT DEFAULT ''"); } catch { /* déjà appliquée */ }
// Catégories de produits (colonne ajoutée après coup sur une base déjà en place)
try { db.exec('ALTER TABLE products ADD COLUMN category_id INTEGER DEFAULT NULL REFERENCES categories(id) ON DELETE SET NULL'); } catch { /* déjà appliquée */ }
// Taux de TVA par produit (20% par défaut à l'ajout de la colonne, voir backfill ciblé plus bas)
try { db.exec('ALTER TABLE products ADD COLUMN vat_rate REAL NOT NULL DEFAULT 20'); } catch { /* déjà appliquée */ }

// Compte admin initial : créé depuis les variables d'env si la table est vide
// (nécessaire au premier démarrage sur une base neuve, ex. volume Railway).
if (process.env.ADMIN_USER && process.env.ADMIN_PASSWORD) {
  const n = db.prepare('SELECT COUNT(*) AS n FROM admins').get().n;
  if (n === 0) {
    const hash = crypto.createHash('sha256').update(process.env.ADMIN_PASSWORD).digest('hex');
    db.prepare('INSERT INTO admins (username, password_hash) VALUES (?, ?)').run(process.env.ADMIN_USER, hash);
    console.log(`Compte admin « ${process.env.ADMIN_USER} » créé (bootstrap).`);
  }
}

// Catalogue réel (catégories + produits) : idempotent, sûr à chaque démarrage
// (n'ajoute que ce qui manque, ne touche jamais aux produits existants).
try {
  const { seedCatalog } = require('./seed-catalog');
  const r = seedCatalog(db);
  if (r.categoriesCreated || r.productsCreated) {
    console.log(`Catalogue : ${r.categoriesCreated} catégorie(s) et ${r.productsCreated} produit(s) initialisés.`);
  }
} catch (e) {
  console.error('Erreur lors du seed du catalogue :', e.message);
}

// Rétro-remplissage ponctuel du taux de TVA par catégorie (produits "bouquets
// séchés" → 10%, le reste reste au défaut 20%). Protégé par un drapeau en base
// pour ne s'exécuter qu'une seule fois : si Manon modifie ensuite un taux
// manuellement dans l'admin, aucun redémarrage ne doit jamais l'écraser.
try {
  const already = db.prepare("SELECT 1 FROM settings WHERE key = 'vat_rate_backfilled_v1'").get();
  if (!already) {
    const seches = db.prepare("SELECT id FROM categories WHERE slug = 'seches'").get();
    if (seches) {
      db.prepare('UPDATE products SET vat_rate = 10 WHERE category_id = ?').run(seches.id);
    }
    db.prepare(`
      INSERT INTO settings (key, value) VALUES ('vat_rate_backfilled_v1', '1')
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `).run();
  }
} catch (e) {
  console.error('Erreur lors du rétro-remplissage des taux de TVA :', e.message);
}

module.exports = db;
