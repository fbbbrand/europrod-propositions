const HOTEL_FIELDS = [
  ["nbCh", "Nombre de chambres"],
  ["pms", "Nom du PMS"],
  ["pmsEdit", "Éditeur ou intégrateur PMS"],
  ["chTemEmet", "Émetteur de la chambre témoin"],
  ["chTemTubes", "Raccordement de la chambre témoin"],
  ["chTemRegul", "Régulation de la chambre témoin"],
];

const TECHNICAL_FIELDS = [
  ["surfGtb", "Surface chauffée retenue GTB"],
  ["chType", "Type de production de chaleur"],
  ["chProto", "Protocole de la production de chaleur"],
  ["venProto", "Protocole de ventilation"],
  ["elConso", "Consommation électrique annuelle"],
  ["elCout", "Coût électrique annuel"],
];

const PROTOCOL_DESCRIPTIONS = {
  "BACnet IP": "Réseau IP natif pour les automates et équipements GTB.",
  "BACnet MSTP": "Bus terrain BACnet pour les équipements et contrôleurs.",
  "Modbus TCP": "Échanges IP avec les compteurs, automates et passerelles.",
  "Modbus RTU": "Bus série pour les équipements et compteurs terrain.",
  KNX: "Bus bâtiment pour la régulation, l'éclairage et les automatismes.",
  LON: "Bus existant repris par passerelle lorsque le matériel le permet.",
  "M-Bus": "Collecte des compteurs d'énergie compatibles.",
  LoRaWAN: "Capteurs sans fil pour l'occupation et les mesures d'ambiance.",
};

function text(value, fallback = "") {
  if (value === null || value === undefined) return fallback;
  return String(value).trim() || fallback;
}

function number(value, fallback = 0) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const parsed = Number(String(value ?? "").replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function plural(value, singular, pluralForm = `${singular}s`) {
  return `${value} ${value > 1 ? pluralForm : singular}`;
}

function nonEmptyRows(rows = []) {
  return Array.isArray(rows)
    ? rows.filter((row) => row && Object.values(row).some((value) => text(value)))
    : [];
}

function sum(rows, key, multiplierKey) {
  return rows.reduce((total, row) => {
    const value = number(row[key]);
    return total + value * (multiplierKey ? Math.max(1, number(row[multiplierKey], 1)) : 1);
  }, 0);
}

function first(...values) {
  return values.map((value) => text(value)).find(Boolean) || "";
}

function unique(values) {
  return [...new Set(values.map((value) => text(value)).filter(Boolean))];
}

function selectedChecks(checks = {}, prefix) {
  return Object.entries(checks)
    .filter(([key, value]) => key.startsWith(`${prefix}_`) && value === true)
    .length;
}

function clip(value, max) {
  const clean = text(value).replace(/\s+/g, " ");
  if (clean.length <= max) return clean;
  return `${clean.slice(0, Math.max(0, max - 1)).trim()}…`;
}

function protocolCard(name) {
  return {
    name,
    description:
      PROTOCOL_DESCRIPTIONS[name] ||
      "Interface à confirmer avec le constructeur avant chiffrage définitif.",
  };
}

export function validateVisit(visit = {}, commercial = {}) {
  const fields = visit.f || {};
  const siteType = text(commercial.siteType, "hotel");
  const warnings = [];
  const blockers = [];

  if (!first(fields.hotel, fields.enseigne, commercial.siteName)) {
    blockers.push("Nom du site");
  }
  if (!first(fields.enseigne, commercial.clientName)) {
    blockers.push("Client ou enseigne");
  }
  if (!first(fields.surfGtb, fields.sdp)) {
    blockers.push("Surface du périmètre");
  }

  for (const [key, label] of TECHNICAL_FIELDS) {
    if (!text(fields[key])) warnings.push(label);
  }
  if (siteType === "hotel") {
    for (const [key, label] of HOTEL_FIELDS) {
      if (!text(fields[key])) warnings.push(label);
    }
  }

  if (!text(commercial.price)) warnings.push("Montant de l'offre");
  if (!text(commercial.complianceClass) || commercial.complianceClass === "À confirmer") {
    warnings.push("Classe de performance à valider");
  }

  const photoCount = Object.values(visit.p || {}).filter(Boolean).length;
  if (photoCount < 1) warnings.push("Aucune photo jointe au relevé");

  return {
    blockers: unique(blockers),
    warnings: unique(warnings),
    canGenerate: blockers.length === 0,
  };
}

export function deriveProposalModel(visit = {}, commercial = {}) {
  const f = visit.f || {};
  const tables = visit.t || {};
  const checks = visit.c || {};
  const roomTypes = nonEmptyRows(tables.typo);
  const commonAreas = nonEmptyRows(tables.communs);
  const rooftop = nonEmptyRows(tables.toiture);

  const client = first(commercial.clientName, f.enseigne, f.hotel, "Client à confirmer");
  const site = first(commercial.siteName, f.hotel, f.ville, "Site à confirmer");
  const group = first(commercial.groupName, f.enseigne, client);
  const siteType = text(commercial.siteType, "hotel");
  const area = number(first(f.surfGtb, f.sdp));
  const rooms = number(f.nbCh) || sum(roomTypes, "nb");
  const roomThermostats = sum(roomTypes, "th", "nb");
  const roomDetectors = sum(roomTypes, "det", "nb");
  const roomWindowContacts = sum(roomTypes, "fen", "nb");
  const commonThermostats = sum(commonAreas, "th");
  const commonCo2 = sum(commonAreas, "co2");
  const sensorCount = roomThermostats + roomDetectors + roomWindowContacts + commonThermostats + commonCo2;
  const subMeterCount = selectedChecks(checks, "sc");
  const photos = Object.values(visit.p || {}).filter(Boolean).length;

  const rawProtocols = unique([f.frProto, f.chProto, f.venProto]);
  if (sensorCount > 0) rawProtocols.push("LoRaWAN");
  const protocolNames = unique(rawProtocols).slice(0, 3);
  while (protocolNames.length < 3) {
    protocolNames.push(["BACnet IP", "Modbus TCP", "LoRaWAN"][protocolNames.length]);
  }

  const coolingCount = number(f.frNbInt);
  const heatCount = number(f.chNb);
  const ventilationCount = number(f.venNb);
  const rooftopCount = rooftop.length;
  const meterLabel = f.elType ? `Compteur ${f.elType}` : "Comptage électrique";

  const priority = first(
    f.objVerbatim,
    f.pbVerbatim,
    f.gis1,
    "Mettre le site en conformité et centraliser le pilotage énergétique."
  );

  const complianceClass = text(commercial.complianceClass, "À confirmer");
  const complianceConfirmed = complianceClass === "A" || complianceClass === "B";
  const offerType = text(commercial.offerType, "POC").toUpperCase();
  const rawNextStep = first(f.prochaine, "Validation de l'offre");
  const shortSiteLabel = clip(site.replace(/^hôtel\s+/i, ""), 20);
  const includes = Array.isArray(commercial.includes)
    ? commercial.includes.map((item) => text(item)).filter(Boolean)
    : text(commercial.includes)
        .split(/\r?\n/)
        .map((item) => item.trim())
        .filter(Boolean);

  const defaultIncludes = [
    "Matériel",
    "Ingénierie et intégration",
    "Mise en service",
    "Capteurs et passerelles",
    "Licence de supervision, année 1",
  ];

  const model = {
    meta: {
      client: clip(client, 50),
      group: clip(group, 45),
      site: clip(site, 38),
      city: clip(f.ville, 35),
      address: clip(f.adresse, 65),
      visitDate: text(f.datevisite),
      visitor: clip(f.visiteur, 45),
      siteType,
      object: clip(first(commercial.object, `Proposition ${offerType}, conformité BACS`), 46),
      area,
      rooms,
      photos,
    },
    priority: clip(priority, 115),
    protocols: protocolNames.map(protocolCard),
    scope: [
      {
        label: "CLIMATISATION",
        headline: coolingCount
          ? `${plural(coolingCount, "unité intérieure")}`
          : first(f.frType, "Périmètre à confirmer"),
        detail: clip(
          coolingCount
            ? `${first(f.frType, "Production de froid")}, intégration via ${first(f.frProto, "passerelle à confirmer")}.`
            : "Équipements et interface à confirmer après relevé constructeur.",
          105
        ),
      },
      {
        label: "CHAUFFAGE",
        headline: heatCount ? plural(heatCount, "générateur") : first(f.chType, "Production de chaleur"),
        detail: clip(
          `${first(f.chType, "Production à confirmer")}${f.chPuiss ? `, ${f.chPuiss} kW` : ""}. Régulation via ${first(f.chProto, "interface à qualifier")}.`,
          105
        ),
      },
      {
        label: "VENTILATION",
        headline: ventilationCount
          ? plural(ventilationCount, "centrale")
          : first(f.venType, "Ventilation à confirmer"),
        detail: clip(
          `${first(f.venType, "Installation à relever")}${f.venDebit ? `, ${f.venDebit} m³/h` : ""}. ${first(f.venProto, "Protocole à qualifier")}.`,
          105
        ),
      },
      {
        label: siteType === "hotel" ? "CHAMBRES ET OCCUPATION" : "CAPTEURS ET OCCUPATION",
        headline: rooms ? plural(rooms, "chambre") : sensorCount ? plural(sensorCount, "point terrain") : "Périmètre à confirmer",
        detail: clip(
          siteType === "hotel"
            ? `${roomTypes.length || 0} typologie(s), ${sensorCount || 0} points de régulation et détection estimés.`
            : `${sensorCount || 0} points de régulation et détection estimés sur le périmètre.`,
          105
        ),
      },
      {
        label: "COMPTAGE ÉNERGÉTIQUE",
        headline: subMeterCount ? plural(subMeterCount, "usage à instrumenter") : meterLabel,
        detail: clip(
          f.elConso
            ? `${Number(number(f.elConso)).toLocaleString("fr-FR")} kWh/an relevés. ${meterLabel}.`
            : `${meterLabel}. Données de référence à consolider avant calcul du ROI.`,
          105
        ),
      },
    ],
    architecture: {
      nodes: [
        {
          protocol: first(f.frProto, protocolNames[0]),
          name: clip(first(f.frType, "Production de froid"), 26),
          line1: coolingCount ? plural(number(f.frNbExt) || 1, "unité extérieure") : "Inventaire à confirmer",
          line2: coolingCount ? plural(coolingCount, "unité intérieure") : "Interface constructeur",
        },
        {
          protocol: first(f.chProto, f.venProto, protocolNames[1]),
          name: "Chauffage et ventilation",
          line1: heatCount ? plural(heatCount, "générateur") : first(f.chType, "Production à confirmer"),
          line2: ventilationCount ? plural(ventilationCount, "centrale") : first(f.venType, "Ventilation à confirmer"),
        },
        {
          protocol: sensorCount ? "LoRaWAN NATIF" : protocolNames[2],
          name: sensorCount ? plural(sensorCount, "point terrain") : "Capteurs terrain",
          line1: roomDetectors || commonCo2 ? "Présence et qualité d'air" : "Mesures d'ambiance",
          line2: "Optimisation par usage",
        },
        {
          protocol: f.elType === "Linky" || f.elType === "PME-PMI" ? "API" : "MODBUS / M-BUS",
          name: clip(meterLabel, 24),
          line1: subMeterCount ? plural(subMeterCount, "sous-comptage") : "Consommation générale",
          line2: "Restitution énergétique",
        },
      ],
    },
    compliance: {
      className: complianceClass,
      confirmed: complianceConfirmed,
      headline: complianceConfirmed
        ? `Classe ${complianceClass}, sous réserve de validation finale.`
        : "Classe de performance à confirmer.",
      detail: complianceConfirmed
        ? `La classe ${complianceClass} au sens de la norme EN 15232 / NF EN ISO 52120-1 est visée sur le périmètre défini.`
        : "Europrod confirmera la classe après validation du périmètre, des fonctions et des équipements réellement pilotés.",
      auditDetail: clip(
        first(
          commercial.complianceNote,
          f.risque,
          "La restitution par usage et les preuves de conformité seront précisées pendant l'étude d'exécution."
        ),
        125
      ),
    },
    offer: {
      type: offerType,
      price: number(commercial.price),
      recurring: number(commercial.recurring),
      includes: [...includes, ...defaultIncludes].filter((item, index, all) => all.indexOf(item) === index).slice(0, 5),
      commercialNote: clip(
        first(
          commercial.commercialNote,
          "Montant établi sur la base des informations disponibles. Les quantités définitives seront confirmées lors du relevé contradictoire."
        ),
        175
      ),
      recurringNote: clip(
        first(
          commercial.recurringNote,
          "La licence de supervision est facturée annuellement à partir de la deuxième année. Le matériel et l'ingénierie restent acquis."
        ),
        135
      ),
    },
    deployment: {
      siteLabel: shortSiteLabel,
      groupLabel: clip(group, 28),
      intro: clip(
        `${site} valide l'architecture proposée et sert de référence pour les déploiements complémentaires de ${group}.`,
        145
      ),
      nextStep: rawNextStep.length > 22 ? "Validation de l'offre" : rawNextStep,
      nextStepDetail: clip(
        first(commercial.nextStepDetail, "Accord sur le périmètre et le prix."),
        44
      ),
      surveyStep: f.visiteComp === "Oui" ? "Complément de visite" : "Relevé contradictoire",
      surveyDetail: clip(
        first(f.visiteCompObj, "Quantités et interfaces validées sur site."),
        44
      ),
      commissioningDetail: clip(
        first(commercial.commissioningDetail, "Déploiement, recette et formation planifiés."),
        48
      ),
    },
    diagnostics: {
      roomTypes: roomTypes.length,
      commonAreas: commonAreas.length,
      rooftopEquipment: rooftopCount,
      sensorCount,
      subMeterCount,
      photoCount: photos,
    },
  };

  model.validation = validateVisit(visit, commercial);
  return model;
}

export function formatEuro(value) {
  const amount = number(value);
  return amount ? `${amount.toLocaleString("fr-FR", { maximumFractionDigits: 0 })} € HT` : "À CHIFFRER";
}
