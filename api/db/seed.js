const db = require('./database');

db.prepare('DELETE FROM slots').run();
db.prepare('DELETE FROM products').run();

const insertProduct = db.prepare(`
  INSERT INTO products (name, description, price, images, options, stock, active)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`);

const products = [
  {
    name: 'Bouquet Soleil',
    description: 'Un bouquet généreux de fleurs fraîches aux tons chauds, composé selon la saison. Idéal pour illuminer un intérieur ou offrir à un être cher.',
    price: 35,
    images: ['../images/bouquet-fleurs-fraiches-nimes.webp'],
    options: [
      { type: 'size', label: 'Taille', choices: [{ value: 'S', label: 'S', priceDelta: -10 }, { value: 'M', label: 'M', priceDelta: 0 }, { value: 'L', label: 'L', priceDelta: 15 }] }
    ],
    stock: 8
  },
  {
    name: 'Bouquet Romantique',
    description: 'Roses rouges et fleurs délicates pour une déclaration élégante. Livré dans un emballage soigné avec ruban.',
    price: 45,
    images: ['../images/bouquet-fleurs-rouges-romantique-nimes.webp'],
    options: [
      { type: 'size', label: 'Taille', choices: [{ value: 'S', label: 'S', priceDelta: -10 }, { value: 'M', label: 'M', priceDelta: 0 }, { value: 'L', label: 'L', priceDelta: 15 }] }
    ],
    stock: 5
  },
  {
    name: 'Composition Séchées',
    description: 'Une composition durable en fleurs séchées, aux tons naturels. Zéro entretien, une beauté qui dure des mois.',
    price: 40,
    images: ['../images/bouquet-fleurs-sechees-decoration-durable-nimes.webp'],
    options: [
      { type: 'color', label: 'Coloris', choices: [{ value: 'naturel', label: 'Naturel', priceDelta: 0 }, { value: 'pastel', label: 'Pastel', priceDelta: 5 }] }
    ],
    stock: 10
  },
  {
    name: 'Arrangement Végétal',
    description: 'Composition de plantes vertes et de feuillages exotiques dans un vase en verre. Parfait pour un bureau ou une table de salon.',
    price: 50,
    images: ['../images/vase-arrangement-floral-nimes.webp'],
    options: [],
    stock: 4
  },
  {
    name: 'Création Sur-mesure',
    description: 'Bouquet entièrement personnalisé selon tes envies : couleurs, fleurs, style. Laisse un message et Manon crée pour toi.',
    price: 55,
    images: ['../images/creation-florale-sur-mesure-nimes.webp'],
    options: [],
    stock: 6
  }
];

for (const p of products) {
  insertProduct.run(p.name, p.description, p.price, JSON.stringify(p.images), JSON.stringify(p.options), p.stock, 1);
}

// Créneaux de test pour demain et après-demain
const tomorrow = new Date();
tomorrow.setDate(tomorrow.getDate() + 1);
const dayAfter = new Date();
dayAfter.setDate(dayAfter.getDate() + 2);

function dateStr(d) {
  return d.toISOString().split('T')[0];
}

const insertSlot = db.prepare('INSERT INTO slots (date, start_time, end_time) VALUES (?, ?, ?)');
const times = [
  ['09:00', '10:00'], ['10:00', '11:00'], ['11:00', '12:00'],
  ['14:00', '15:00'], ['15:00', '16:00'], ['16:00', '17:00']
];

for (const [start, end] of times) {
  insertSlot.run(dateStr(tomorrow), start, end);
  insertSlot.run(dateStr(dayAfter), start, end);
}

console.log(`Seed OK — ${products.length} produits, ${times.length * 2} créneaux`);
