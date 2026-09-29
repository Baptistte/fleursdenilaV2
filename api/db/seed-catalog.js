// Seed idempotent du vrai catalogue (catégories + produits), d'après les
// demandes de Manon (demandeclient/Site_soc_manon.pdf). Contrairement à
// seed.js (données de démo, destructif), ce script n'insère que ce qui
// n'existe pas encore : sûr à exécuter à chaque démarrage du serveur, y
// compris en production, sans jamais écraser ni dupliquer de données.
//
// Choix éditoriaux faits faute de précision dans le document source
// (à ajuster dans l'admin si besoin) :
// - Les prix "S/M/L" sont remplacés par des options « Format » nommées par
//   leur prix, sur l'échelle générale 25/30/40/50/60 € indiquée par Manon.
//   Pour « Bouquet blanc », la version « petit » utilise le bas de
//   l'échelle (25/30/40 €) et la version « grand » le haut (40/50/60 €),
//   faute de tarifs distincts précisés.
// - Les couleurs proposées (Blanc/Rose/Rouge/Jaune/Orange/Violet) sont une
//   liste par défaut à affiner avec Manon selon les fleurs réellement
//   disponibles.
// - Aucune photo n'est assignée aux nouveaux produits (à ajouter depuis
//   l'admin, panneau Produits → galerie).
// - Stock à 10000 par défaut : Manon ne souhaite pas gérer de stock réel
//   côté vitrine e-shop.

const GENERIC_DESC = "Tous nos bouquets seront réalisés avec les fleurs disponibles en fonction de la saison en cours et de l'arrivage hebdomadaire. Nous contacter ou ajouter un commentaire à la commande en cas de demande spécifique.";
const DEUIL_DESC = "Composition réalisée sur mesure. Nous contacter pour toute demande de prix ajusté ou de personnalisation.";

const COLOR_CHOICES = [
  { value: 'blanc', label: 'Blanc', priceDelta: 0 },
  { value: 'rose', label: 'Rose', priceDelta: 0 },
  { value: 'rouge', label: 'Rouge', priceDelta: 0 },
  { value: 'jaune', label: 'Jaune', priceDelta: 0 },
  { value: 'orange', label: 'Orange', priceDelta: 0 },
  { value: 'violet', label: 'Violet', priceDelta: 0 },
];

// Construit une option « Format » à partir d'une échelle de prix (le premier
// prix devient le prix de base du produit, les suivants des priceDelta).
function formatOption(prices) {
  const base = prices[0];
  return {
    option: { type: 'size', label: 'Format', choices: prices.map(p => ({ value: String(p), label: `${p} €`, priceDelta: p - base })) },
    base
  };
}

const CATEGORIES = [
  { slug: 'permanents', name: 'Bouquets permanents', type: 'permanente', position: 1 },
  { slug: 'saison', name: 'Bouquets de saison', type: 'saisonniere', position: 2 },
  { slug: 'seches', name: 'Bouquets séchés', type: 'speciale', position: 3 },
  { slug: 'deuil', name: 'Deuil', type: 'speciale', position: 4 },
];

function productsFor(slug) {
  const P = (name, prices, { color = false, description = GENERIC_DESC } = {}) => {
    const { option, base } = formatOption(prices);
    const options = [option];
    if (color) options.push({ type: 'color', label: 'Couleur', choices: COLOR_CHOICES });
    return { name, description, price: base, options };
  };

  switch (slug) {
    case 'permanents':
      return [
        P('Bouquet blanc (petit)', [25, 30, 40]),
        P('Bouquet blanc (grand)', [40, 50, 60]),
        P('Bouquet unicolore', [25, 30, 40, 50, 60], { color: true }),
        P('Bouquet champêtre coloré', [25, 30, 40, 50, 60], { color: true }),
        P('Bouquet champêtre', [25, 30, 40, 50, 60]),
        P('Bouquet de roses', [25, 30, 40, 50, 60], { color: true }),
        P('Bouquet multicolore', [25, 30, 40, 50, 60]),
        P('Bouquet pastel avec lys', [25, 30, 40, 50, 60]),
        P('Bouquet varié', [25, 30, 40, 50, 60], { color: true }),
      ];
    case 'saison':
      return [
        P('Bouquet automnal', [25, 30, 40, 50, 60]),
        P("Bouquet d'hortensia", [25, 30, 40, 50, 60]),
        P('Bouquet de pivoines', [25, 30, 40, 50, 60]),
        P('Bouquet de saison (fleurs précises)', [25, 30, 40, 50, 60], {
          description: "Bouquet composé de fleurs de saison précises, choisies au moment de la commande. Nous contacter ou ajouter un commentaire à la commande pour préciser vos envies."
        }),
        P('Bouquet fête des mères', [25, 30, 40, 50, 60]),
        P('Bouquet hiver', [25, 30, 40, 50, 60]),
        P('Bouquet estival', [25, 30, 40, 50, 60]),
        P('Bouquet printanier', [25, 30, 40, 50, 60]),
      ];
    case 'seches':
      return [
        P('Bouquet séché', [25, 30, 40, 50, 60], { color: true }),
      ];
    case 'deuil':
      return [
        P('Coussin de deuil', [100, 150, 200], { description: DEUIL_DESC }),
        P('Croix de deuil', [250, 300], { description: DEUIL_DESC }),
        P('Couronne de deuil', [250, 300, 400], { description: DEUIL_DESC }),
        P('Seau de deuil', [50, 80, 100, 120, 150, 180, 200, 250], { description: DEUIL_DESC }),
        P('Gerbe de deuil', [80, 100, 150, 200], { description: DEUIL_DESC }),
      ];
    default:
      return [];
  }
}

function seedCatalog(db) {
  let categoriesCreated = 0;
  let productsCreated = 0;

  const insertCategory = db.prepare(`
    INSERT INTO categories (name, slug, type, position, active) VALUES (?, ?, ?, ?, 1)
  `);
  const insertProduct = db.prepare(`
    INSERT INTO products (name, description, price, images, options, stock, active, category_id)
    VALUES (?, ?, ?, '[]', ?, 10000, 1, ?)
  `);

  for (const cat of CATEGORIES) {
    let row = db.prepare('SELECT id FROM categories WHERE slug = ?').get(cat.slug);
    if (!row) {
      const result = insertCategory.run(cat.name, cat.slug, cat.type, cat.position);
      row = { id: result.lastInsertRowid };
      categoriesCreated++;
    }

    for (const p of productsFor(cat.slug)) {
      // Vérifie par nom seul (pas par catégorie) : si Manon déplace un produit
      // vers une autre catégorie, on ne veut jamais le recréer en double au
      // redémarrage suivant sous prétexte qu'il « manque » dans sa catégorie
      // d'origine — la recatégorisation est définitive.
      const exists = db.prepare('SELECT id FROM products WHERE name = ?').get(p.name);
      if (exists) continue;
      insertProduct.run(p.name, p.description, p.price, JSON.stringify(p.options), row.id);
      productsCreated++;
    }
  }

  return { categoriesCreated, productsCreated };
}

module.exports = { seedCatalog };

if (require.main === module) {
  const db = require('./database');
  const r = seedCatalog(db);
  console.log(`Seed catalogue OK — ${r.categoriesCreated} catégorie(s) créée(s), ${r.productsCreated} produit(s) créé(s)`);
}
