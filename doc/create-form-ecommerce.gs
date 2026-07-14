/**
 * Fleurs de Nila — Questionnaire E-commerce
 * ------------------------------------------
 * Instructions :
 * 1. Aller sur https://script.google.com
 * 2. Créer un nouveau projet
 * 3. Coller ce script entier
 * 4. Cliquer sur "Exécuter" (bouton ▶)
 * 5. Autoriser les permissions Google demandées
 * 6. Le formulaire apparaît dans ton Google Drive
 */

function createFormulaireEcommerce() {

  const form = FormApp.create('Questionnaire E-commerce — Fleurs de Nila');
  form.setDescription(
    'Ce questionnaire me permet de choisir la meilleure solution e-commerce pour ton site. ' +
    'Réponds du mieux que tu peux, il n\'y a pas de mauvaise réponse !'
  );
  form.setCollectEmail(false);
  form.setProgressBar(true);
  form.setConfirmationMessage(
    'Merci pour tes réponses ! Je reviendrai vers toi très vite avec une proposition adaptée.'
  );

  // ============================================================
  // SECTION 1 — Catalogue & Produits
  // ============================================================
  form.addSectionHeaderItem()
    .setTitle('🌸 Catalogue & Produits')
    .setHelpText('Ces questions permettent d\'estimer la taille de ta boutique en ligne.');

  form.addMultipleChoiceItem()
    .setTitle('Combien de produits différents veux-tu vendre en ligne ?')
    .setChoiceValues([
      'Moins de 5 produits (ex. 2-3 formules bouquet)',
      'Entre 5 et 15 produits',
      'Plus de 15 produits',
      'Je ne sais pas encore'
    ])
    .setRequired(true);

  form.addMultipleChoiceItem()
    .setTitle('Tes produits sont-ils fixes ou variables selon les arrivages ?')
    .setChoiceValues([
      'Fixes — les mêmes produits toute l\'année',
      'Variables — ça change selon les saisons et arrivages',
      'Un mix des deux',
      'Je ne sais pas encore'
    ])
    .setRequired(true);

  form.addCheckboxItem()
    .setTitle('Veux-tu proposer des options personnalisables ? (plusieurs réponses possibles)')
    .setChoiceValues([
      'Choix des couleurs',
      'Choix de la taille (S, M, L)',
      'Message personnalisé à joindre',
      'Choix des fleurs',
      'Non, les produits sont fixes sans option'
    ])
    .setRequired(false);

  form.addMultipleChoiceItem()
    .setTitle('As-tu des produits souvent en rupture de stock ?')
    .setChoiceValues([
      'Oui, régulièrement',
      'Rarement',
      'Non, la disponibilité est stable',
      'Je ne sais pas'
    ])
    .setRequired(true);

  // ============================================================
  // SECTION 2 — Commandes & Livraison
  // ============================================================
  form.addSectionHeaderItem()
    .setTitle('🚚 Commandes & Livraison')
    .setHelpText('Pour comprendre comment tu veux gérer la logistique des commandes en ligne.');

  form.addMultipleChoiceItem()
    .setTitle('Comment veux-tu gérer les frais de livraison en ligne ?')
    .setChoiceValues([
      'Payés en ligne lors de la commande',
      'Réglés séparément (en boutique ou par virement)',
      'Livraison offerte au-dessus d\'un certain montant',
      'Je n\'ai pas encore décidé'
    ])
    .setRequired(true);

  form.addMultipleChoiceItem()
    .setTitle('Veux-tu que le client choisisse une date/heure de livraison lors de la commande ?')
    .setChoiceValues([
      'Oui, c\'est indispensable',
      'Oui, ce serait bien mais pas obligatoire',
      'Non, je préfère les contacter après pour fixer ça',
      'Je ne sais pas'
    ])
    .setRequired(true);

  form.addMultipleChoiceItem()
    .setTitle('Y a-t-il un montant minimum de commande en ligne ?')
    .setChoiceValues([
      'Oui — moins de 20€',
      'Oui — entre 20€ et 40€',
      'Oui — plus de 40€',
      'Non, pas de minimum',
      'Je ne sais pas encore'
    ])
    .setRequired(false);

  form.addMultipleChoiceItem()
    .setTitle('Veux-tu proposer le retrait en boutique ?')
    .setChoiceValues([
      'Oui, en plus de la livraison',
      'Oui, uniquement le retrait (pas de livraison en ligne)',
      'Non',
      'Je ne sais pas'
    ])
    .setRequired(true);

  // ============================================================
  // SECTION 3 — Paiement & Finances
  // ============================================================
  form.addSectionHeaderItem()
    .setTitle('💳 Paiement & Finances')
    .setHelpText('Pour choisir la solution de paiement la plus adaptée.');

  form.addCheckboxItem()
    .setTitle('Tu as déjà un ou plusieurs de ces outils de paiement ? (plusieurs réponses possibles)')
    .setChoiceValues([
      'Terminal SumUp',
      'Terminal iZettle / Zettle',
      'Compte Stripe',
      'Compte PayPal Pro',
      'Aucun de ces outils'
    ])
    .setRequired(true);

  form.addMultipleChoiceItem()
    .setTitle('À quelle fréquence voudrais-tu recevoir les virements de tes ventes en ligne ?')
    .setChoiceValues([
      'Quotidiennement',
      'Chaque semaine',
      'Deux fois par mois',
      'Mensuellement',
      'Peu importe'
    ])
    .setRequired(false);

  form.addMultipleChoiceItem()
    .setTitle('As-tu un comptable ou un logiciel de caisse à connecter ?')
    .setChoiceValues([
      'Oui, un comptable — il faudra lui exporter les données',
      'Oui, un logiciel de caisse',
      'Les deux',
      'Non'
    ])
    .setRequired(false);

  // ============================================================
  // SECTION 4 — Gestion au quotidien
  // ============================================================
  form.addSectionHeaderItem()
    .setTitle('🗂️ Gestion au quotidien')
    .setHelpText('Pour que la solution soit adaptée à ton usage réel.');

  form.addMultipleChoiceItem()
    .setTitle('Qui va gérer la boutique en ligne au quotidien ?')
    .setChoiceValues([
      'Moi seule',
      'Moi + une aide en boutique',
      'Quelqu\'un d\'autre que moi',
      'Je ne sais pas encore'
    ])
    .setRequired(true);

  form.addMultipleChoiceItem()
    .setTitle('Comment préfères-tu être prévenue d\'une nouvelle commande ?')
    .setChoiceValues([
      'Email automatique',
      'Notification sur mon téléphone (application)',
      'SMS',
      'Je me connecte moi-même vérifier',
      'Peu importe'
    ])
    .setRequired(true);

  form.addMultipleChoiceItem()
    .setTitle('Tu es à l\'aise avec un back-office web pour gérer les commandes ?')
    .setChoiceValues([
      'Oui, pas de problème',
      'Oui, si c\'est simple et intuitif',
      'Je préfère que tout se passe par email',
      'J\'aurais besoin d\'aide au départ'
    ])
    .setRequired(true);

  form.addMultipleChoiceItem()
    .setTitle('La gestion mobile (depuis ton téléphone) est-elle importante pour toi ?')
    .setChoiceValues([
      'Oui, indispensable — je gère tout depuis mon téléphone',
      'Oui, ce serait pratique',
      'Non, je travaille plutôt depuis un ordinateur',
      'Les deux m\'conviennent'
    ])
    .setRequired(false);

  // ============================================================
  // SECTION 5 — Objectifs & Ambitions
  // ============================================================
  form.addSectionHeaderItem()
    .setTitle('🎯 Objectifs & Ambitions')
    .setHelpText('Pour comprendre la place que tu veux donner à la vente en ligne dans ton activité.');

  form.addMultipleChoiceItem()
    .setTitle('Quel est ton objectif principal avec la vente en ligne ?')
    .setChoiceValues([
      'Compléter les ventes en boutique (petit volume)',
      'Développer un vrai canal de vente en ligne significatif',
      'Proposer la livraison à des clients qui ne peuvent pas se déplacer',
      'Vendre des produits spécifiques non disponibles en boutique',
      'Je ne sais pas encore'
    ])
    .setRequired(true);

  form.addMultipleChoiceItem()
    .setTitle('Quel budget mensuel peux-tu consacrer à la solution e-commerce ?')
    .setChoiceValues([
      'Je préfère payer uniquement des commissions sur les ventes (pas d\'abonnement fixe)',
      'Moins de 15€/mois',
      'Entre 15€ et 40€/mois',
      'Plus de 40€/mois si ça vaut le coup',
      'Je n\'ai pas encore de budget défini'
    ])
    .setRequired(true);

  form.addMultipleChoiceItem()
    .setTitle('As-tu déjà commandé sur un site de fleurs en ligne (Interflora, 1001Fleurs…) ?')
    .setChoiceValues([
      'Oui, et j\'ai été satisfaite',
      'Oui, mais j\'ai trouvé ça impersonnel / décevant',
      'Non jamais',
    ])
    .setRequired(false);

  form.addParagraphTextItem()
    .setTitle('Qu\'est-ce que tu voudrais faire différemment de ces grandes plateformes ?')
    .setHelpText('Optionnel — quelques mots suffisent.')
    .setRequired(false);

  form.addParagraphTextItem()
    .setTitle('Y a-t-il autre chose que tu voudrais me dire sur ton projet e-commerce ?')
    .setHelpText('Idées, contraintes, inquiétudes… tout est utile !')
    .setRequired(false);

  // ============================================================
  // Résultat final
  // ============================================================
  const url = form.getPublishedUrl();
  const editUrl = form.getEditUrl();

  Logger.log('✅ Formulaire créé avec succès !');
  Logger.log('🔗 Lien à envoyer à ta cliente : ' + url);
  Logger.log('✏️  Lien d\'édition (pour toi) : ' + editUrl);
}
