# Plan d'action SEO — fleursdenila.fr
> Généré le 10 mars 2026 · Score actuel : 72/100 · Cible : 85+/100
> Optimisé pour exécution par Claude Code — chaque tâche est autonome et précise.

---

## RÈGLES D'EXÉCUTION

- Travailler fichier par fichier, valider avant de passer au suivant
- Ne jamais modifier `tailwind.css` directement — éditer `tailwind-input.css` puis recompiler
- Toujours lire un fichier avant de l'éditer
- Les tâches sont ordonnées par priorité ; ne pas sauter d'étape
- Marquer chaque tâche `[x]` une fois appliquée

---

## SEMAINE 1 — Critique & Technique

### T1 · Créer `mentions-legales.html`
- [x] Créer le fichier à la racine
- Contenu minimum légal FR (LCEN) :
  - Éditeur : Fleurs de Nila, 3 rue Auguste-Pellet, 30000 Nîmes
  - Téléphone : 04 34 39 04 29
  - Email : fleursdenila@icloud.com (→ mettre à jour après T14)
  - SIRET si disponible
  - Hébergeur : à compléter
  - Directeur de publication : nom de l'artisan
- Style : reprendre le header/footer de `index.html`
- [x] Ajouter lien dans le footer de **tous** les fichiers HTML (index, blog, article1/2/3)

### T2 · Créer `politique-confidentialite.html`
- [x] Créer le fichier à la racine
- Contenu minimum RGPD :
  - Données collectées : aucune (pas de formulaire, pas d'analytics actuellement)
  - Cookies : aucun traceur tiers identifié
  - Droits RGPD : accès, rectification, suppression → email contact
- Style : reprendre le header/footer de `index.html`
- [x] Ajouter lien dans le footer de **tous** les fichiers HTML

### T3 · Mettre à jour `sitemap.xml`
- [x] Ajouter les 2 nouvelles pages après T1 et T2 :
  ```xml
  <url>
    <loc>https://www.fleursdenila.fr/mentions-legales.html</loc>
    <lastmod>2026-03-10</lastmod>
  </url>
  <url>
    <loc>https://www.fleursdenila.fr/politique-confidentialite.html</loc>
    <lastmod>2026-03-10</lastmod>
  </url>
  ```
- [x] Supprimer toutes les balises `<changefreq>` et `<priority>` (ignorées par Google)
- [x] Corriger les `<lastmod>` : utiliser des dates distinctes par page (dates git réelles)
- [x] Ajouter entrée image pour `blog.html` :
  ```xml
  <image:image>
    <image:loc>https://www.fleursdenila.fr/images/bouquet-fleurs-fraiches-nimes.webp</image:loc>
    <image:title>Bouquet de fleurs fraîches - Blog Fleurs de Nila</image:title>
  </image:image>
  ```

### T4 · Supprimer le bloc `FAQPage` de `index.html`
- [x] Fichier : `index.html`
- Localiser le bloc JSON-LD `"@type": "FAQPage"` et le supprimer entièrement
- Restreint par Google depuis août 2023 pour les sites commerciaux non-gouvernementaux

### T5 · Corriger `.htaccess` — Redirection www + HSTS
- [x] Fichier : `.htaccess`
- Ajouter **en tout début de fichier**, avant toute autre règle :
  ```apache
  # Enforce www
  RewriteEngine On
  RewriteCond %{HTTP_HOST} !^www\. [NC]
  RewriteRule ^ https://www.%{HTTP_HOST}%{REQUEST_URI} [R=301,L]
  ```
- Ajouter dans le bloc `<IfModule mod_headers.c>` existant :
  ```apache
  Header always set Strict-Transport-Security "max-age=31536000; includeSubDomains; preload"
  ```

### T6 · Corriger le preload LCP hero dans `index.html`
- [x] Fichier : `index.html` — balise `<link rel="preload">` dans `<head>`
- Remplacer la balise preload actuelle par :
  ```html
  <link rel="preload" as="image"
    href="images/composition-florale-artisanale-nimes.webp"
    imagesrcset="images/composition-florale-artisanale-nimes-400w.webp 400w,
                 images/composition-florale-artisanale-nimes-800w.webp 800w,
                 images/composition-florale-artisanale-nimes.webp 1050w"
    imagesizes="(max-width: 768px) 100vw, 66vw"
    fetchpriority="high">
  ```

### T7 · Supprimer le wrapper `<picture>` du hero dans `index.html`
- [x] Fichier : `index.html` — section hero (~L355)
- La `<source>` override le `srcset` de `<img>` → variantes 400w/800w jamais servies sur mobile
- Supprimer les balises `<picture>` et `<source>` englobantes
- Conserver uniquement l'`<img>` avec ses attributs `srcset`, `sizes`, `fetchpriority`, `width`, `height`, `alt`, `loading`

---

## SEMAINE 2 — E-E-A-T & Schema

### T8 · Ajouter `@id` et lundi fermé au schema Florist dans `index.html`
- [x] Fichier : `index.html` — bloc JSON-LD `"@type": "Florist"`
- Ajouter après `"@type": "Florist"` :
  ```json
  "@id": "https://www.fleursdenila.fr/#florist",
  ```
- Ajouter dans le tableau `openingHoursSpecification` :
  ```json
  {
    "@type": "OpeningHoursSpecification",
    "dayOfWeek": "Monday",
    "opens": "00:00",
    "closes": "00:00"
  }
  ```
- Mettre à jour `@type` en tableau :
  ```json
  "@type": ["Florist", "LocalBusiness"],
  ```

### T9 · Ajouter schema sur `blog.html`
- [x] Fichier : `blog.html` — ajouter dans `<head>` avant `</head>`
- Bloc 1 — CollectionPage :
  ```json
  {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    "@id": "https://www.fleursdenila.fr/blog.html",
    "name": "Blog — Fleurs de Nila",
    "description": "Conseils d'entretien, inspirations florales de saison et idées déco fleurs fraîches et séchées par Fleurs de Nila, fleuriste à Nîmes.",
    "url": "https://www.fleursdenila.fr/blog.html",
    "inLanguage": "fr-FR",
    "publisher": {
      "@type": "Organization",
      "@id": "https://www.fleursdenila.fr/#florist",
      "name": "Fleurs de Nila",
      "url": "https://www.fleursdenila.fr"
    }
  }
  ```
- Bloc 2 — BreadcrumbList :
  ```json
  {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    "itemListElement": [
      {"@type": "ListItem", "position": 1, "name": "Accueil", "item": "https://www.fleursdenila.fr/"},
      {"@type": "ListItem", "position": 2, "name": "Blog", "item": "https://www.fleursdenila.fr/blog.html"}
    ]
  }
  ```

### T10 · Corriger les schemas des articles (article1/2/3.html)
- [x] Fichiers : `article1.html`, `article2.html`, `article3.html`
- Pour chaque article :
  1. Changer `"@type": "Article"` → `"@type": "BlogPosting"`
  2. Ajouter dans le bloc auteur et publisher : `"@id": "https://www.fleursdenila.fr/#florist"`
  3. Ajouter `"articleSection": "Conseils pratiques"` (ou section pertinente)
  4. Ajouter `"wordCount": <nombre_mots_réel>`
  5. Corriger BreadcrumbList — ajouter `"item"` sur la position 3 :
     ```json
     {
       "@type": "ListItem",
       "position": 3,
       "name": "<titre_article>",
       "item": "https://www.fleursdenila.fr/<nom_fichier>.html"
     }
     ```

### T11 · Ajouter un auteur nommé sur les articles
- [ ] Fichiers : `article1.html`, `article2.html`, `article3.html`
- Ajouter dans chaque article (HTML visible, pas seulement schema) :
  - Une ligne auteur sous le titre : ex. `<span class="author">Par Nila, fleuriste artisan à Nîmes</span>`
- Mettre à jour le schema `author` :
  ```json
  "author": {
    "@type": "Person",
    "name": "Nila",
    "jobTitle": "Fleuriste artisan",
    "url": "https://www.fleursdenila.fr/#florist"
  }
  ```
- Note : adapter le prénom réel si différent de "Nila"

### T12 · Intégrer une section avis clients sur `index.html`
- [ ] Fichier : `index.html`
- Ajouter une section `#avis` entre la section "manifeste" et "abonnement"
- Structure : 3–4 cartes d'avis avec nom, note étoiles (⭐), texte, contexte événement
- Données à remplir : récupérer 3–4 vrais avis Google Business de la fiche
- Style : cohérent avec le reste du site (tons verts, typographie existante)

---

## SEMAINE 3 — On-Page & Performance

### T13 · Corriger les alt textes dans `index.html` ✅
- [ ] Fichier : `index.html`
- **Doublon 1** (~L564) : `detail-petales-fleurs-nimes.webp`
  - Remplacer par : `"Texture délicate de pétales de fleurs fraîches - Fleurs de Nila Nîmes"`
- **Doublon 2** (~L572) : `composition-florale-esthetique-nimes.webp`
  - Laisser : `"Composition florale esthétique - Fleurs de Nila"` (ou affiner)
- **Alt trompeur** : section abonnement — image `bouquet-fleurs-fraiches-nimes.webp` à opacity-5
  - Remplacer par : `alt=""`
- **Accessoires reused** (~L727) : `accessoires-decoration-florale-nimes.webp`
  - Remplacer par : `"Accessoires et objets décoratifs floraux - Fleurs de Nila Nîmes"`

### T14 · Alt hero blog.html ✅ (déjà correct — aria-hidden + alt="")
- [ ] Fichier : `blog.html` — ligne ~124
- Remplacer `alt=""` par :
  `alt="Bouquet de fleurs fraîches présenté dans le blog de Fleurs de Nila, fleuriste à Nîmes"`

### T15 · Logo nav 400w ✅
- [ ] Fichiers : `index.html`, `blog.html`, `article1.html`, `article2.html`, `article3.html`
- Dans chaque fichier, remplacer dans la balise `<img>` du logo nav :
  ```html
  src="images/logo-fleurs-de-nila-fleuriste-nimes.webp"
  ```
  par :
  ```html
  src="images/logo-fleurs-de-nila-fleuriste-nimes-400w.webp"
  ```
  (ou ajouter un srcset si la variante 800w existe)

### T16 · og:image:alt ajouté ✅ (index.html — seul fichier avec OG tags)
- [ ] Fichiers : `index.html`, `blog.html`, `article1.html`, `article2.html`, `article3.html`
- Ajouter après chaque `og:image:height` :
  - `index.html` : `<meta property="og:image:alt" content="Devanture de la boutique Fleurs de Nila, fleuriste artisan à Nîmes">`
  - `blog.html` : `<meta property="og:image:alt" content="Bouquet de fleurs fraîches - Blog Fleurs de Nila Nîmes">`
  - Adapter pour chaque article selon l'image OG existante

### T17 · Nettoyage HTML ✅
- [ ] Fichier : `index.html`
- **L892** : supprimer le `loading="lazy"` en double sur l'iframe Google Maps
- **L1102** : lien Pinterest `href="#"` — remplacer par l'URL réelle ou supprimer l'icône
- **L1138** : déplacer le bloc `<style>` inline du bas de `<body>` vers `styles.css`
- Supprimer `<meta name="keywords">` de tous les fichiers HTML

### T18 · Optimisations styles.css ✅
- [ ] Fichier : `styles.css`
- Supprimer le fallback `.ttf` dans `@font-face` (garder uniquement `woff2`)
- Supprimer les déclarations `will-change` statiques sur `.reveal`, `.hover-lift`, `.parallax-bg`
  - Ces propriétés doivent être appliquées/retirées via JS uniquement

### T19 · preconnect Google Maps ✅ (5 fichiers HTML)
- [ ] Fichiers : `index.html`, `blog.html`, `article1.html`, `article2.html`, `article3.html`
- Ajouter dans `<head>` de chaque fichier :
  ```html
  <link rel="preconnect" href="https://maps.googleapis.com">
  <link rel="preconnect" href="https://maps.gstatic.com" crossorigin>
  ```

### T20 · Renommer les URLs des articles
> ⚠️ Faire en dernier dans la semaine 3 — impact sur tous les liens internes
- [ ] Renommer les fichiers :
  - `article1.html` → `entretien-bouquets-fleurs-fraiches.html`
  - `article2.html` → `decoration-fleurs-sechees-idees.html`
  - `article3.html` → `livraison-fleurs-nimes-zones-tarifs.html`
- [ ] Ajouter dans `.htaccess` les redirections 301 :
  ```apache
  Redirect 301 /article1.html https://www.fleursdenila.fr/entretien-bouquets-fleurs-fraiches.html
  Redirect 301 /article2.html https://www.fleursdenila.fr/decoration-fleurs-sechees-idees.html
  Redirect 301 /article3.html https://www.fleursdenila.fr/livraison-fleurs-nimes-zones-tarifs.html
  ```
- [ ] Mettre à jour toutes les références internes dans : `index.html`, `blog.html`, `sitemap.xml`
- [ ] Mettre à jour les balises `canonical` dans chaque article renommé
- [ ] Mettre à jour les schemas JSON-LD (`mainEntityOfPage`, `BreadcrumbList`)

---

## MOIS SUIVANT — Contenu & Autorité

### T21 · Étendre `article1.html` (entretien bouquets frais)
- [ ] Objectif : 1 500+ mots (actuel ~820)
- Axes d'expansion avec ancrage local :
  - Spécificités du climat méditerranéen de Nîmes (chaleur estivale, mistral)
  - Fleurs de saison dans le Gard (quand trouver pivoines, dahlias, etc.)
  - Conseils post-achat spécifiques à la boutique (eau calcaire du réseau nîmois)
  - Anecdote atelier réelle (cas client, exemple de mariage)

### T22 · Étendre `article2.html` (fleurs séchées)
- [ ] Objectif : 1 500+ mots (actuel ~880)
- Axes d'expansion :
  - Producteurs locaux de fleurs séchées dans le Languedoc
  - Tendances déco méditerranéenne (tons ocre, lavande, romarin)
  - Lien avec les événements locaux (Ferias de Nîmes, marchés)
  - Atelier fleurs séchées : expérience proposée par la boutique

### T23 · Créer `a-propos.html`
- [ ] Créer la page avec :
  - Photo de l'artisan(e) au travail
  - Histoire de la création de Fleurs de Nila
  - Formation et parcours (CAP fleuriste, expériences)
  - Philosophie florale
  - Lien vers les réseaux sociaux
- Schema : `Person` + `LocalBusiness` liés via `@id`
- Ajouter au sitemap et dans la navigation principale

### T24 · Créer `mariage.html`
- [ ] Page dédiée au service mariage/événementiel
- Cible keyword : "fleuriste mariage Nîmes"
- Contenu : bouquet mariée, arche, décoration tables, pack complet
- Schema : `Service` avec `serviceType: "Décoration florale mariage"`
- Ajouter au sitemap

### T25 · Migrer l'email vers domaine propre
- [ ] Remplacer `fleursdenila@icloud.com` par `contact@fleursdenila.fr` dans :
  - `index.html` (footer + schema JSON-LD)
  - `article1.html`, `article2.html`, `article3.html` (footer)
  - `blog.html` (footer)
  - `mentions-legales.html` (créé en T1)
  - `sitemap.xml` si présent

---

## TÂCHES RAPIDES (< 5 min chacune, à faire en batch)

- [ ] **R1** · Supprimer `<meta name="keywords">` de tous les 5 fichiers HTML
- [ ] **R2** · Corriger favicon : ajouter fallback PNG avant le WebP dans `index.html`
- [ ] **R3** · Ajouter `robots.txt` entrées pour `Bytespider` et `CCBot` (si contrôle AI sélectif souhaité)
- [ ] **R4** · Corriger `lastmod` dans `sitemap.xml` avec des dates distinctes par page

---

## SCORE PROJETÉ APRÈS EXÉCUTION

| Phase | Tâches | Score estimé |
|-------|--------|-------------|
| Départ | — | 72/100 |
| Après Semaine 1 | T1–T7 | ~78/100 |
| Après Semaine 2 | T8–T12 | ~82/100 |
| Après Semaine 3 | T13–T20 | ~85/100 |
| Après Mois suivant | T21–T25 | ~90/100 |

---

## FICHIERS CONCERNÉS (référence rapide)

| Fichier | Tâches |
|---------|--------|
| `.htaccess` | T5, T20 |
| `index.html` | T4, T6, T7, T8, T12, T13, T15, T16, T17, T18, T19, R1 |
| `blog.html` | T1*, T2*, T9, T14, T15, T16, T19, R1 |
| `article1.html` | T1*, T2*, T10, T11, T15, T16, T19, T20, T21, R1 |
| `article2.html` | T1*, T2*, T10, T11, T15, T16, T19, T20, T22, R1 |
| `article3.html` | T1*, T2*, T10, T11, T15, T16, T19, T20, R1 |
| `sitemap.xml` | T3, T20, R4 |
| `styles.css` | T18 |
| `robots.txt` | R3 |
| *(nouveau)* `mentions-legales.html` | T1 |
| *(nouveau)* `politique-confidentialite.html` | T2 |
| *(nouveau)* `a-propos.html` | T23 |
| *(nouveau)* `mariage.html` | T24 |

*\* = ajouter lien footer*
