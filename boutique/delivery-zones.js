/* Zones de livraison Fleurs de Nila — code postal → commune(s) et tarif.
   Source : page « Livraison — zones & tarifs ». Utilisé par livraison.html et commande.html. */
(function () {
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

  // Renvoie les zones correspondant à un code postal (plusieurs communes possibles)
  function findByZip(zip) {
    const z = String(zip || '').trim();
    return ZONES.filter(zone => zone.zip === z);
  }

  window.DELIVERY_ZONES = ZONES;
  window.findDeliveryZones = findByZip;
  window.DELIVERY_PHONE = '04 34 39 04 29';
  window.DELIVERY_PHONE_TEL = '0434390429';
})();
