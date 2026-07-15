/* Zones de livraison Fleurs de Nila (copie backend de boutique/delivery-zones.js).
   Sert à recalculer le tarif de livraison de façon autoritaire côté serveur. */
const ZONES = [
  { commune: 'Nîmes centre', zip: '30000', fee: 10 },
  { commune: 'Nîmes ouest',  zip: '30900', fee: 10 },
  { commune: 'Caissargues',  zip: '30132', fee: 10 },
  { commune: 'Bouillargues', zip: '30230', fee: 15 },
  { commune: 'Milhaud',      zip: '30540', fee: 10 },
  { commune: 'Garons',       zip: '30128', fee: 15 },
  { commune: 'Marguerittes', zip: '30320', fee: 10 },
  { commune: 'Manduel',      zip: '30129', fee: 15 },
  { commune: 'Caveirac',     zip: '30820', fee: 15 },
  { commune: 'Redessan',     zip: '30129', fee: 15 },
  { commune: 'Bernis',       zip: '30620', fee: 15 },
  { commune: 'Générac',      zip: '30510', fee: 15 },
  { commune: 'Saint-Gilles', zip: '30800', fee: 15 },
  { commune: 'Vauvert',      zip: '30600', fee: 15 },
];

// Tarif de livraison pour un code postal, ou null si zone non desservie
function feeForZip(zip) {
  const match = ZONES.find(z => z.zip === String(zip || '').trim());
  return match ? match.fee : null;
}

module.exports = { ZONES, feeForZip };
