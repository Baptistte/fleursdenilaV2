# Tâches — BDD en ligne & upload d'images

> Créé le 16 juillet 2026, mis à jour le 16 juillet 2026.
> Objectif : permettre l'ajout d'images produits depuis l'admin, et mettre l'API + la base
> de données en ligne pour que la cliente (Manon) puisse tester la boutique en conditions
> réelles (sans emails ni vrai paiement : mode simulation SumUp).

---

## ✅ Durcissement fait en dev le 16/07 (préalable à toute exposition publique)

- [x] **Re-tarification côté serveur** : les prix envoyés par le navigateur sont ignorés,
      chaque article est re-tarifé depuis la table `products` (+ suppléments d'options,
      options obligatoires vérifiées) — plus de fraude possible via la console
- [x] **Contrôle de stock au checkout** : quantités bornées (1–50), stock vérifié toutes
      lignes confondues, produits désactivés/supprimés refusés avec message clair
- [x] **Estimation de livraison honnête** au panier et dans le volet : plus de 5 € fictifs,
      « selon la commune, à l'étape suivante » sous le seuil de livraison offerte
- [x] Seuil de livraison offerte centralisé (réglage admin + `/api/config`)
- [x] Jours bloqués réellement bloqués (plus d'auto-recréation des créneaux)
- [x] Créneaux exclusifs avec réservation 10 min + minuterie, workflow de validation
      des commandes, pages Clients et Factures, admin utilisable sur téléphone

---

## Tâche 1 — Upload d'images produits dans la BDD

**État actuel** : le formulaire produit de l'admin (`admin/produits.html`, champ `#f-image`)
n'accepte qu'un chemin texte du type `../images/mon-bouquet.webp`. Il faut donc déposer les
fichiers à la main sur le serveur — inutilisable par la cliente.

**Cible** : bouton « Choisir une image » dans le formulaire produit → l'image est envoyée à
l'API, stockée sur le serveur, et son URL enregistrée dans le champ `images` (JSON) de la
table `products`.

> Choix technique : stocker le **fichier sur disque** (dossier `api/uploads/`) et **l'URL en
> base** — pas le binaire en BLOB SQLite, qui gonfle la base et complique les sauvegardes.

### Backend ✓ fait le 16/07
- [x] multer installé, route `POST /api/admin/upload` protégée (webp/jpeg/png, 5 Mo max,
      noms slugifiés + timestamp), dossier servi sur `/uploads` (UPLOADS_DIR sur le volume
      en prod), `uploads/` ignoré par git
- [ ] Optionnel plus tard : redimensionnement/compression à l'upload avec `sharp`

### Frontend admin ✓ fait le 16/07
- [x] Bouton « Choisir une image… » + champ URL manuelle en secours, aperçu immédiat,
      statut d'envoi ; l'URL absolue retournée est enregistrée dans le produit

### Frontend boutique ✓
- [x] L'API retourne une **URL absolue** (`https://api…/uploads/…`) : aucune adaptation
      nécessaire côté boutique, les deux formats cohabitent (testé de bout en bout)

> ⚠️ Sur Railway : ajouter la variable `UPLOADS_DIR=/data/uploads` pour que les images
> soient stockées sur le volume persistant (sinon elles disparaissent au redéploiement).

---

## Tâche 2 — Mettre l'API + la BDD en ligne pour les tests client

**État actuel** : tout tourne en local (`localhost:3000` + SQLite fichier). La cliente ne
peut rien tester à distance.

**Cible test (pas la prod finale)** : API + BDD hébergées sur **Railway** (simple, ~5 €/mois,
volume persistant pour SQLite — pas besoin de migrer vers PostgreSQL pour la phase de test).
La prod finale sur VPS LWS + PostgreSQL reste le plan du CDC (Phase 7).

### Étape A — Préparer le code (prérequis)
- [x] **Centraliser l'URL de l'API côté front** ✓ 16/07 : fichier `config.js` à la racine,
      inclus dans les 9 pages + `cart-drawer.js`. Bascule automatique localhost ↔ en ligne.
      ⚠️ Après « Generate Domain » sur Railway, remplacer le placeholder dans `config.js`
- [x] **CORS** ✓ 16/07 : `https://fleursdeniladeveloppement.netlify.app` autorisée en dur
      + `FRONTEND_URL` via env ; `trust proxy` + cookie `secure` en production
- [x] **Chemin de la BDD configurable** ✓ 16/07 : `DB_PATH` via env, fallback local
- [x] Vérifier que `api/package.json` a un script `start` (`node app.js`) — Railway l'utilise ✓ (déjà présent)
- [ ] **Sécurité avant exposition publique** (obligatoire, l'API sera sur internet) :
  - [x] mot de passe admin changé en local ✓ 16/07 (10 caractères, transmis en privé) ;
        sur Railway : bootstrap automatique via `ADMIN_USER` / `ADMIN_PASSWORD` si la base est vide
  - [x] `SESSION_SECRET` lu depuis l'env (reste à renseigner une valeur forte sur Railway)
  - [x] cookie de session `secure` quand `NODE_ENV=production` ✓ 16/07

### Étape B — Déployer l'API sur Railway
- [ ] Créer un compte sur https://railway.app (login GitHub)
- [ ] « New Project » → « Deploy from GitHub repo » → sélectionner `Baptistte/fleursdenilaV2`
- [ ] Settings du service → **Root Directory : `api/`** (le repo contient front + api)
- [ ] Ajouter un **Volume** (Storage) monté sur `/data` → variable `DB_PATH=/data/fleurs-de-nila.sqlite`
      (le volume survit aux redéploiements ; y stocker aussi `uploads/` → `UPLOADS_DIR=/data/uploads`)
- [ ] Variables d'environnement à créer :
  | Variable | Valeur |
  |---|---|
  | `DB_PATH` | `/data/fleurs-de-nila.sqlite` |
  | `SESSION_SECRET` | chaîne aléatoire longue |
  | `FRONTEND_URL` | `https://fleursdeniladeveloppement.netlify.app` |
  | `ADMIN_USER` | `admin` (ou autre) |
  | `ADMIN_PASSWORD` | le mot de passe transmis en privé — crée le compte au 1er démarrage |
  | `NODE_ENV` | `production` |
  | `SUMUP_CLIENT_ID` / `SECRET` / `MERCHANT_CODE` | **laisser vides pour le test** → mode simulation, paiement fictif sans CB |
- [ ] Settings → Networking → « Generate Domain » → noter l'URL (ex. `fleurs-de-nila-api.up.railway.app`)
- [ ] Vérifier `https://<url-railway>/api/health` → `{"status":"ok"}`
- [ ] Lancer le seed une fois (produits + créneaux de démo) : `railway run node db/seed.js`
      ou route de setup temporaire

### Étape C — Héberger le front de test
- [x] Déjà fait : `https://fleursdeniladeveloppement.netlify.app` (branche `main`)
- [ ] Reporter l'URL Netlify dans `FRONTEND_URL` sur Railway (CORS)
- [ ] Vérifier que `config.js` (étape A) pointe bien vers l'URL Railway
- [ ] Option : protéger le site de test par mot de passe (Netlify « Password protection »,
      payant) ou simplement ne pas diffuser l'URL

### Question métier à trancher avec Manon avant la recette
- [ ] **Capacité des créneaux** : le système est exclusif — 1 commande par créneau,
      soit 6 commandes max par jour avec les créneaux par défaut. Si Manon peut livrer
      plusieurs clients sur un même créneau, prévoir une capacité par créneau (ex. 3).

### Étape D — Recette avec la cliente
- [ ] Parcours complet : boutique → panier → livraison (zone, créneau, minuterie) →
      coordonnées → paiement simulé → confirmation
- [ ] Admin sur téléphone : produits (+ **upload d'image**, tâche 1), commandes + validation,
      créneaux (blocage, récurrence), tournée + impression, seuil de livraison offerte
- [ ] Vérifier la persistance : redéployer l'API et confirmer que produits/commandes/images
      sont toujours là (volume OK)
- [ ] Noter les retours de Manon → itérations

### Rappels pour la bascule en prod (hors périmètre test)
- Migration SQLite → PostgreSQL, VPS LWS + PM2 + Nginx, DNS `api.fleursdenila.fr`,
  SSL Let's Encrypt, clés SumUp **live** + webhook vérifié (cf. `plan-technique.md`, Phase 7)
- Emails Resend (Phase 5) — toujours à faire

---

## Ordre conseillé

1. ~~Durcissement checkout (prix, stock, estimation livraison)~~ ✅ fait le 16/07
2. Étape A (préparation du code : `config.js`, `DB_PATH`, mot de passe admin, ~2 h)
3. Tâche 1 (upload d'images, ~demi-journée) — à faire avant la mise en ligne pour que
   la cliente teste directement le vrai flux
4. Étapes B + C (déploiement Railway + Netlify, ~2 h)
5. Trancher la capacité des créneaux avec Manon, puis Étape D (recette client)

## Reste à faire côté code (récap rapide)

| Point | Où | Bloquant mise en ligne ? |
|---|---|---|
| `config.js` URL API centralisée | ~6 fichiers front | 🔴 oui |
| Mot de passe admin + `SESSION_SECRET` | api + admin | 🔴 oui |
| `DB_PATH` configurable | `api/db/database.js` | 🔴 oui |
| Upload d'images produits | admin + api | 🟠 fortement conseillé |
| Capacité des créneaux (si multi-commandes) | api + admin | 🟠 selon réponse de Manon |
| Test mobile du tunnel boutique | — | 🟠 avant recette |
| Dates admin en UTC (décale entre 0 h et 2 h) | admin | 🟢 mineur |
