# Plan technique — Boutique Fleurs de Nila

> Dernière mise à jour : 28 avril 2026

---

## Stack retenu

| Couche | Techno | Raison |
|---|---|---|
| Frontend boutique | HTML/Tailwind (existant) + JS vanilla | Cohérence avec le site actuel |
| Backend / API | Node.js + Express | Léger, facile à déployer, bien supporté par SumUp |
| Base de données | SQLite (dev) → PostgreSQL (prod) | Simple, pas de surcoût serveur en V1 |
| Paiement | SumUp Checkout API | Choix client |
| Email | Resend (API) | Fiable, gratuit jusqu'à 3 000 emails/mois |
| Hébergement | LWS VPS (backend + BDD) + site statique inchangé | Hébergement existant du projet |
| Admin | Pages HTML protégées par session Express | Pas de framework lourd, cohérence avec l'existant |

---

## Architecture générale

```
fleursdenila.fr (statique, inchangé)
│
├── /boutique/          → pages HTML boutique (catalogue, panier, commande)
├── /admin/             → pages HTML espace admin (protégées)
│
└── api.fleursdenila.fr (Railway — Express)
    ├── /api/products        → catalogue produits
    ├── /api/slots           → créneaux disponibles
    ├── /api/cart            → réservation temporaire de créneau
    ├── /api/checkout        → création du paiement SumUp
    ├── /api/webhook/sumup   → confirmation paiement (webhook)
    ├── /api/admin/*         → routes admin protégées
    └── /api/auth            → connexion admin
```

---

## Phases de développement

---

### Phase 0 — Mise en place (1–2 jours)

**Environnement local**
- [x] Créer le repo backend (`fleurs-de-nila-api`)
- [x] Initialiser Express + structure des dossiers (`routes/`, `models/`, `services/`, `middleware/`)
- [x] Configurer SQLite pour le développement local (pas besoin de serveur de BDD)
- [x] Fichier `.env` local : clés SumUp sandbox, secret session, clé Resend test
- [x] Script `npm run dev` avec `nodemon` pour rechargement automatique
- [x] Serveur démarre et répond sur `http://localhost:3000/api/health`
- [ ] Installer **ngrok** pour exposer le serveur local à SumUp (nécessaire pour les webhooks en local)

**Déploiement LWS**
- [ ] Vérifier que le VPS LWS tourne bien sous Node.js (version ≥ 18)
- [ ] Configurer **PM2** sur le VPS pour garder le serveur Express en vie (`pm2 start app.js`)
- [ ] Configurer **Nginx** sur LWS en reverse proxy vers le port Express (ex : port 3000)
- [ ] Configurer la base PostgreSQL sur le VPS LWS
- [ ] Variables d'environnement de production sur le VPS (via fichier `.env` ou PM2 ecosystem)
- [ ] Vérifier que l'API répond sur `api.fleursdenila.fr`

---

### Phase 1 — Catalogue & produits ✅

**Base de données — table `products`**
```sql
id, name, description, price, images (JSON), options (JSON),
stock, active, created_at
```

**API**
- [x] `GET /api/products` — liste des produits actifs (stock > 0)
- [x] `GET /api/products/:id` — détail d'un produit
- [x] Script de seed (`db/seed.js`) — 5 produits + 12 créneaux de test

**Frontend**
- [x] Page `/boutique/index.html` — grille de produits (cartes avec photo, nom, prix)
- [x] Page `/boutique/produit.html` — fiche produit (options, message personnalisé, ajout au panier)
- [x] Produits épuisés automatiquement masqués
- [x] Badge panier dans la nav (mis à jour depuis localStorage)

---

### Phase 2 — Panier ✅

> Panier géré en `localStorage` — pas de session serveur nécessaire à ce stade.

- [x] Ajouter un produit au panier (avec options choisies)
- [x] Page `/boutique/panier.html` — liste des articles, quantités, total
- [x] Modifier les quantités / supprimer un article
- [x] Calcul automatique : livraison offerte au-dessus de 60 € (seuil configurable dans le JS)
- [x] Barre de progression vers la livraison offerte
- [x] Persistance du panier si le client ferme et rouvre l'onglet

---

### Phase 3 — Créneaux de livraison ✅

> C'est la partie la plus délicate. Un créneau pris doit être bloqué pour les autres clients.

**Base de données — table `slots`**
```sql
id, date, start_time, end_time, reserved_until, order_id
```

**Logique de réservation temporaire**
1. Client sélectionne un créneau → `POST /api/cart/reserve-slot`
2. Serveur marque le créneau `reserved_until = now + 10 min`
3. Tâche planifiée (cron toutes les minutes) libère les créneaux expirés non payés
4. À la confirmation du paiement (webhook SumUp), le créneau est définitivement lié à la commande

**API**
- [x] `GET /api/slots?date=YYYY-MM-DD` — liste des créneaux disponibles
- [x] `POST /api/cart/reserve-slot` — réservation temporaire (10 min)
- [x] `DELETE /api/cart/release-slot` — libération manuelle (+ POST pour sendBeacon)
- [x] Cron de libération des créneaux expirés (toutes les 60s au démarrage)

**Frontend**
- [x] Page `/boutique/livraison.html` — sélection date + créneaux
- [x] Minuterie visible (compte à rebours 10 min)
- [x] Choix livraison à domicile (avec adresse) ou retrait en boutique
- [x] Libération automatique du créneau si le client quitte la page

---

### Phase 4 — Paiement SumUp ✅

**Flux**
1. Client valide son panier + créneau + coordonnées
2. Frontend appelle `POST /api/checkout` → serveur crée un checkout SumUp
3. Client est redirigé vers la page de paiement SumUp hébergée
4. SumUp appelle le webhook `POST /api/webhook/sumup` à la confirmation
5. Serveur confirme la commande, décrémente les stocks, envoie les emails

**API**
- [x] `POST /api/checkout` — crée un checkout SumUp, retourne l'URL de paiement
- [x] `POST /api/webhook/sumup` — reçoit la confirmation, valide la signature HMAC
- [x] Décrément du stock des produits commandés (transaction atomique)
- [x] Verrouillage définitif du créneau

**Frontend**
- [x] Page `/boutique/commande.html` — formulaire coordonnées client → appel checkout
- [x] Page `/boutique/confirmation.html` — succès paiement, vidage du panier localStorage

**Base de données — table `orders`**
```sql
id, sumup_checkout_id, customer_name, customer_email, customer_phone,
customer_address, slot_id, items (JSON), total, delivery_type,
status, created_at
```

> ⚠️ À configurer : `SUMUP_CLIENT_ID`, `SUMUP_CLIENT_SECRET`, `SUMUP_MERCHANT_CODE`, `SUMUP_WEBHOOK_SECRET` dans le fichier `.env`

---

### Phase 5 — Emails (1 jour)

Via l'API Resend :

- [ ] Email client — confirmation de commande (récapitulatif produits, créneau, adresse)
- [ ] Email Manon — nouvelle commande reçue (mêmes infos + numéro de commande)
- [ ] Templates HTML simples, aux couleurs de Fleurs de Nila

---

### Phase 6 — Espace admin (3–4 jours)

**Authentification**
- [ ] `POST /api/auth/login` — vérifie identifiant/mot de passe, crée une session
- [ ] `POST /api/auth/logout`
- [ ] Middleware `requireAdmin` sur toutes les routes `/api/admin/*`
- [ ] Page `/admin/login.html`

**Gestion des produits**
- [ ] Page `/admin/produits.html` — liste avec stock, statut actif/inactif
- [ ] Formulaire ajout / modification produit (nom, description, prix, options, stock, photo)
- [ ] Activer / désactiver un produit
- [ ] Supprimer un produit

**Gestion des stocks**
- [ ] Mise à jour du stock en un clic depuis la liste produits
- [ ] Indicateur visuel (rouge si stock = 0)

**Gestion des créneaux**
- [ ] Page `/admin/creneaux.html` — vue hebdomadaire
- [ ] Ajouter / supprimer des créneaux pour une journée donnée
- [ ] Possibilité de créer des créneaux récurrents (ex : tous les mardis 9h–12h)

**Tournée du lendemain**
- [ ] Page `/admin/tournee.html` — liste des commandes du lendemain triées par créneau
- [ ] Pour chaque commande : nom, adresse, produits + options, livraison ou retrait
- [ ] Bouton "Imprimer"

---

### Phase 7 — Tests & mise en production (2–3 jours)

- [ ] Tests du flux complet (commande → paiement → webhook → emails → tournée)
- [ ] Tests mobiles (les clients commanderont surtout depuis leur téléphone)
- [ ] Tests de charge légère (plusieurs clients sur le même créneau en même temps)
- [ ] Configuration DNS `api.fleursdenila.fr` → IP VPS LWS
- [ ] SSL via Let's Encrypt + Certbot sur le VPS LWS
- [ ] Passage en mode SumUp production (clés live)
- [ ] Vérification du webhook SumUp en production

---

## Estimé global

| Phase | Durée estimée |
|---|---|
| Phase 0 — Mise en place | 1–2 j |
| Phase 1 — Catalogue | 2–3 j |
| Phase 2 — Panier | 1–2 j |
| Phase 3 — Créneaux | 2–3 j |
| Phase 4 — Paiement SumUp | 2–3 j |
| Phase 5 — Emails | 1 j |
| Phase 6 — Admin | 3–4 j |
| Phase 7 — Mise en prod | 2–3 j |
| **Total** | **~14–21 jours** |

---

## Environnement local — résumé du flux de test

```
localhost:3000 (Express)  ←→  SQLite local
       ↑
    ngrok tunnel
       ↑
SumUp sandbox (webhooks)
```

Pour tester les webhooks SumUp en local :
1. `ngrok http 3000` → génère une URL publique temporaire (ex : `https://abc123.ngrok.io`)
2. Renseigner cette URL dans le dashboard SumUp sandbox comme endpoint webhook
3. Chaque commande test déclenche un vrai appel webhook vers ton poste local

---

## Points ouverts

- [ ] Confirmer le type d'offre LWS (VPS ou mutualisé) avant la mise en prod — à voir plus tard
- [ ] Manon a-t-elle déjà un compte SumUp avec l'API activée (plan Business) ?
- [ ] Les créneaux sont-ils fixes (ex : 9h–10h, 10h–11h…) ou à durée variable ?
- [ ] Quel est le seuil de livraison offerte ?
- [ ] Un seul mot de passe admin ou plusieurs comptes ?
- [ ] Fréquence de récurrence des créneaux (hebdomadaire, à configurer manuellement) ?
