/* Vérifie la détection de la zone « Écusson » sur des adresses de test.
   Usage : node api/scripts/test-ecusson.js ["12 rue X" "30000"] …
   Sans argument : jeu d'adresses connues (attendu écrit en regard). Appelle la Base Adresse Nationale. */
const { quoteDelivery } = require('../deliveryZones');

const SAMPLES = [
  // [adresse, code postal, attendu]
  ['3 rue Auguste Pellet', '30000', 'ecusson'],          // la boutique
  ['1 place aux Herbes', '30000', 'ecusson'],
  ['10 rue de la Madeleine', '30000', 'ecusson'],
  ['5 place de la Maison Carrée', '30000', 'ecusson'],
  ['20 boulevard Gambetta', '30000', 'ecusson'],
  ['1 place des Arènes', '30000', 'ecusson'],
  ['6 rue de l\'Aspic', '30000', 'ecusson'],
  ['2 square de la Couronne', '30000', 'nimes'],    // cas limite : juste à l\'est du boulevard Amiral Courbet
  ['30 avenue Jean Jaurès', '30900', 'nimes'],
  ['10 route d\'Alès', '30000', 'nimes'],
  ['5 rue Pierre Semard', '30000', 'nimes'],
  ['80 route de Courbessac', '30000', 'nimes'],
  ['3 avenue Carnot', '30000', 'nimes'],
  ['azerty qsdf', '30000', 'refusée'],
  ['12 rue du Village', '30132', 'outside'],               // Caissargues
];

(async () => {
  const args = process.argv.slice(2);
  const list = args.length ? [[args[0], args[1] || '30000', '?']] : SAMPLES;
  for (const [street, zip, expected] of list) {
    const q = await quoteDelivery({ street, zip });
    const got = q.ok ? q.zone : 'refusée';
    const flag = expected === '?' ? '' : (got === expected ? 'OK ' : 'ÉCART');
    console.log(`${flag.padEnd(5)} ${street} (${zip}) → ${got}${q.ok ? ` ${q.fee} €` : ''}  [${q.matched || q.error || ''}]`);
  }
  process.exit(0);
})();
