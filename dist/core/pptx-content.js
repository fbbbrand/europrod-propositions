import { formatEuro } from "./proposal-model.js";

function clean(value, fallback = "À confirmer") {
  const result = String(value ?? "").replace(/\s+/g, " ").trim();
  return result || fallback;
}

function recurringText(offer) {
  const amount = offer.recurring
    ? ` OPEX annuel : ${offer.recurring.toLocaleString("fr-FR", { maximumFractionDigits: 0 })} € HT/an`
    : " OPEX annuel : à confirmer";
  return `${offer.recurringNote}${amount}`;
}

export function buildPptxReplacements(model) {
  const replacements = [];
  const add = (slide, from, to, required = true) => {
    replacements.push({ slide, from, to: clean(to), required });
  };

  const site = model.meta.site;
  const groupAndClient = model.meta.group === model.meta.client
    ? model.meta.client
    : `${model.meta.group} - ${model.meta.client}`;

  add(1, "Groupe NOVARC — Sibille Fameca Electric", groupAndClient);
  add(1, "SFE — Malataverne", site);
  add(1, "Proposition — conformité BACS", model.meta.object);

  add(2, "Le périmètre SFE", `Le périmètre ${site}`);
  add(2, "L'offre POC", `L'offre ${model.offer.type}`);
  add(2, "Conformité atteinte", "Conformité visée");
  add(2, "Déploiement Groupe & prochaines étapes", "Déploiement et prochaines étapes");

  add(3, "LE BON CADRAGE", "PRIORITÉ DU CLIENT");
  add(
    3,
    "Le risque n'est pas l'investissement, c'est le risque évité. La GTB est la porte d'entrée naturelle de la conformité.",
    model.priority
  );

  add(
    4,
    "Smartglobe intègre tous les équipements du bâtiment, quel que soit le constructeur. Aucune dépendance fabricant, aucune boîte noire.",
    "Europrod intègre la solution Smartglobe aux équipements du bâtiment, quel que soit leur constructeur."
  );
  const protocolTemplate = [
    ["BACnet", "IP & MS/TP — le standard de la GTB tertiaire, intégré nativement."],
    ["Modbus", "RTU & TCP — passerelles équipements, comptage et automates."],
    ["LoRaWAN", "Capteurs sans fil, sans LNS fermé — déploiement sans travaux lourds."],
  ];
  model.protocols.forEach((protocol, index) => {
    add(4, protocolTemplate[index][0], protocol.name);
    add(4, protocolTemplate[index][1], protocol.description);
  });

  add(6, "04 · LE PROJET SFE — PÉRIMÈTRE", `04 · LE PROJET ${site.toUpperCase()} - PÉRIMÈTRE`);
  add(6, "Bâtiment 1 — bureaux", `${site}${model.meta.area ? `, ${model.meta.area.toLocaleString("fr-FR")} m²` : ""}`);
  const scopeTemplate = [
    ["CLIMATISATION", "2 réseaux VRV · 30 UI", "30 unités intérieures, intégrées via passerelle Coolmaster Pro."],
    ["AÉROTHERMES", "Pilotage par zone", "Une zone par tableau électrique, via contrôleur iSMA. 3 zones (3 TD)."],
    ["ÉCLAIRAGE", "Pilotage par zone", "Commande par tableau, via contrôleur iSMA. 2 zones (2 TD)."],
    ["PRÉSENCE & OCCUPATION", "30 capteurs LoRaWAN", "Capteurs de présence sans fil pour l'optimisation présence / occupation, appairés nativement au concentrateur LCAT."],
    ["COMPTAGE ÉLECTRIQUE", "Compteur Enedis · API", "Remontée des consommations électriques du site via API cloud Enedis."],
  ];
  model.scope.forEach((item, index) => {
    add(6, scopeTemplate[index][0], item.label);
    add(6, scopeTemplate[index][1], item.headline);
    add(6, scopeTemplate[index][2], item.detail);
  });

  add(7, "04 · LE PROJET SFE — ARCHITECTURE SYNOPTIQUE", `04 · LE PROJET ${site.toUpperCase()} - ARCHITECTURE`);
  const architectureTemplate = [
    ["MODBUS RTU / TCP", "Coolmaster Pro", "2 réseaux VRV", "30 unités intérieures"],
    ["BACnet IP & MS/TP", "Contrôleur iSMA", "Aérothermes par zone", "Éclairage par zone"],
    ["LoRaWAN NATIF", "30 capteurs présence", "Optimisation", "présence / occupation"],
    ["API", "Compteur Enedis", "Remontée des", "consommations électriques"],
  ];
  model.architecture.nodes.forEach((node, index) => {
    const template = architectureTemplate[index];
    add(7, template[0], node.protocol);
    add(7, template[1], node.name);
    add(7, template[2], node.line1);
    add(7, template[3], node.line2);
  });

  add(8, "Une conformité démontrée, prête pour l'audit.", model.compliance.confirmed
    ? "Une conformité définie, prête pour validation."
    : "Une conformité à confirmer après validation technique.");
  add(8, "05 · CONFORMITÉ ATTEINTE", "05 · CONFORMITÉ VISÉE");
  add(
    8,
    "Classe A — EN 15232 / NF EN ISO 52120-1",
    model.compliance.confirmed
      ? `Classe ${model.compliance.className} - EN 15232 / NF EN ISO 52120-1`
      : "Classe à confirmer - EN 15232 / NF EN ISO 52120-1"
  );
  add(8, "Système d'automatisation et de contrôle conforme.", model.compliance.confirmed
    ? "Système d'automatisation et de contrôle conforme au périmètre validé."
    : "Périmètre et fonctions BACS à valider avant engagement.");
  add(
    8,
    "Prête pour audit — la conformité se démontre, elle ne se déclare pas.",
    model.compliance.confirmed
      ? "Restitution à documenter lors de la mise en service."
      : "Restitution à définir après validation du périmètre."
  );
  add(
    8,
    "La classe A au sens de la norme EN 15232 / NF EN ISO 52120-1 est atteinte sur le poste chauffage / climatisation du périmètre.",
    model.compliance.detail
  );
  add(
    8,
    "La restitution réglementaire par usage est disponible et documentée — conformité opposable, défendable devant un auditeur.",
    model.compliance.auditDetail
  );

  add(9, "06 · L'OFFRE— TOUT COMPRIS", `06 · L'OFFRE ${model.offer.type} - TOUT COMPRIS`);
  add(9, "Un POC clé en main, tout compris.", `Une offre ${model.offer.type} structurée sur le périmètre relevé.`);
  add(9, "OFFRE POC · ANNÉE 1", `OFFRE ${model.offer.type} · ANNÉE 1`);
  add(9, "21 000 € HT", formatEuro(model.offer.price));
  ["Matériel", "Ingénierie & intégration", "Mise en service", "Capteurs", "Licence Hypervision — année 1"].forEach(
    (from, index) => add(9, from, model.offer.includes[index] || "À confirmer")
  );
  add(
    9,
    "Applicable uniquement dans le cadre du POC. La présente offre, hors remise, constitue le DPGF contractuel de référence pour tout déploiement futur du Groupe NOVARC (multi-sites).",
    model.offer.commercialNote
  );
  add(
    9,
    "Licence supervision Hypervision en récurrent annuel à partir de l'année 2. Le matériel et l'ingénierie restent acquis.\nOPEX annuel : 2 278 € HT/an",
    recurringText(model.offer)
  );

  add(10, "07 · DU POC AU DÉPLOIEMENT GROUPE", `07 · DE ${model.offer.type} AU DÉPLOIEMENT`);
  add(10, "Un site qui devient la référence du Groupe.", "Un site pilote pour les déploiements suivants.");
  add(
    10,
    "Le POC SFE valide l'architecture et sert de référence contractuelle (DPGF) pour généraliser la démarche sur l'ensemble des sites SAFETY / NOVARC.",
    model.deployment.intro
  );
  add(10, "LE POC — SITE SFE", `${model.offer.type} - ${model.deployment.siteLabel.toUpperCase()}`);
  add(10, "LE GROUPE — SAFETY / NOVARC", `LE PARC - ${model.deployment.groupLabel.toUpperCase()}`);
  add(10, "Validation du POC", model.deployment.nextStep);
  add(10, "Accord sur le périmètre SFE et l'offre tout compris.", model.deployment.nextStepDetail);
  add(10, "Relevé contradictoire", model.deployment.surveyStep);
  add(10, "Surfaces et équipements confirmés sur site.", model.deployment.surveyDetail);
  add(10, "Planification du déploiement et de la recette.", model.deployment.commissioningDetail);

  return replacements;
}
