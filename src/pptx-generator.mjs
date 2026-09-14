import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { deriveProposalModel, formatEuro } from "./proposal-model.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TEMPLATE_PATH = path.join(ROOT, "templates", "europrod-proposal-template.pptx");

async function loadArtifactTool() {
  const modulesPath = process.env.RUNTIME_NODE_MODULES;
  if (!modulesPath || !path.isAbsolute(modulesPath)) {
    throw new Error("RUNTIME_NODE_MODULES n'est pas configuré. Lancez le générateur avec scripts/start.ps1.");
  }
  const runtimeRequire = createRequire(path.join(modulesPath, "__runtime__.cjs"));
  const entry = runtimeRequire.resolve("@oai/artifact-tool");
  return import(pathToFileURL(entry).href);
}

async function finalizeDeck({ PresentationFile, presentation, outputPath }) {
  const skillDir = process.env.SKILL_DIR;
  const runtimePython = process.env.RUNTIME_PYTHON;
  if (!skillDir || !path.isAbsolute(skillDir) || !runtimePython || !path.isAbsolute(runtimePython)) {
    throw new Error("Le runtime de validation PowerPoint n'est pas configuré. Lancez le générateur avec scripts/start.ps1.");
  }

  const validationId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const stagingDir = path.join(ROOT, ".build", "finalizer", validationId);
  const candidatePath = path.join(stagingDir, "candidate.pptx");
  const receiptPath = path.join(stagingDir, "validation.json");
  await fs.mkdir(stagingDir, { recursive: true });
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await (await PresentationFile.exportPptx(presentation)).save(candidatePath);

  const templateBytes = await fs.readFile(TEMPLATE_PATH);
  const referenceSha256 = crypto.createHash("sha256").update(templateBytes).digest("hex");
  const { finalizePresentation } = await import(
    pathToFileURL(path.join(skillDir, "container_tools", "artifact_tool_utils.mjs")).href
  );

  await finalizePresentation({
    workspaceDir: ROOT,
    candidatePath,
    finalPath: outputPath,
    pythonExecutable: runtimePython,
    integrityValidatorPath: path.join(skillDir, "container_tools", "inspect_presentation_package_integrity.py"),
    layoutValidatorPath: path.join(skillDir, "container_tools", "inspect_presentation_layout_geometry.py"),
    layoutArgs: [
      "--expected-slide-size-emu", "9144000,5143500",
      "--validate-bullet-geometry",
      "--validate-heading-fit",
    ],
    explicitTotalSlideCount: 10,
    requiredNativeTableOwnerSlides: [],
    requiredNativeChartOwnerSlides: [],
    fontPolicy: {
      basis: "reference",
      families: ["Calibri"],
      referencePath: TEMPLATE_PATH,
      referenceSha256,
    },
    verifyArtifactToolImport: true,
    receiptPath,
  });

  return { stagingDir, candidatePath, receiptPath };
}

function parseInspect(ndjson) {
  return String(ndjson || "")
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function clean(value, fallback = "À confirmer") {
  const result = String(value ?? "").replace(/\s+/g, " ").trim();
  return result || fallback;
}

function recurringText(offer) {
  const amount = offer.recurring
    ? `\nOPEX annuel : ${offer.recurring.toLocaleString("fr-FR", { maximumFractionDigits: 0 })} € HT/an`
    : "\nOPEX annuel : à confirmer";
  return `${offer.recurringNote}${amount}`;
}

export async function generateProposal({ visit, commercial, outputPath }) {
  const model = deriveProposalModel(visit, commercial);
  if (!model.validation.canGenerate) {
    throw new Error(`Données indispensables manquantes : ${model.validation.blockers.join(", ")}`);
  }

  const { FileBlob, PresentationFile } = await loadArtifactTool();
  const presentation = await PresentationFile.importPptx(await FileBlob.load(TEMPLATE_PATH));
  const snapshot = await presentation.inspect({
    kind: "slide,textbox,shape",
    include: "id,slide,name,text,textPreview",
    maxChars: 220000,
  });
  const records = parseInspect(snapshot.ndjson).filter((item) => item.id && item.text);
  const touched = [];
  const usedRecordIds = new Set();

  function replace(slideNumber, oldText, newText, required = true) {
    const record = records.find(
      (item) => item.slide === slideNumber && item.text === oldText && !usedRecordIds.has(item.id)
    );
    if (!record) {
      if (required) throw new Error(`Zone du gabarit introuvable, diapositive ${slideNumber} : ${oldText}`);
      return;
    }
    const target = presentation.resolve(record.id);
    target.text.replace(record.text, clean(newText));
    usedRecordIds.add(record.id);
    touched.push({ slide: slideNumber, id: record.id, from: oldText, to: clean(newText) });
  }

  const site = model.meta.site;
  const groupAndClient = model.meta.group === model.meta.client
    ? model.meta.client
    : `${model.meta.group} - ${model.meta.client}`;

  replace(1, "Groupe NOVARC — Sibille Fameca Electric", groupAndClient);
  replace(1, "SFE — Malataverne", site);
  replace(1, "Proposition — conformité BACS", model.meta.object);

  replace(2, "Le périmètre SFE", `Le périmètre ${site}`);
  replace(2, "L'offre POC", `L'offre ${model.offer.type}`);
  replace(2, "Conformité atteinte", "Conformité visée");
  replace(2, "Déploiement Groupe & prochaines étapes", "Déploiement et prochaines étapes");

  replace(3, "LE BON CADRAGE", "PRIORITÉ DU CLIENT");
  replace(
    3,
    "Le risque n'est pas l'investissement, c'est le risque évité. La GTB est la porte d'entrée naturelle de la conformité.",
    model.priority
  );

  replace(
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
    replace(4, protocolTemplate[index][0], protocol.name);
    replace(4, protocolTemplate[index][1], protocol.description);
  });

  const scope = model.scope;
  replace(6, "04 · LE PROJET SFE — PÉRIMÈTRE", `04 · LE PROJET ${site.toUpperCase()} - PÉRIMÈTRE`);
  replace(6, "Bâtiment 1 — bureaux", `${site}${model.meta.area ? `, ${model.meta.area.toLocaleString("fr-FR")} m²` : ""}`);
  const scopeTemplate = [
    ["CLIMATISATION", "2 réseaux VRV · 30 UI", "30 unités intérieures, intégrées via passerelle Coolmaster Pro."],
    ["AÉROTHERMES", "Pilotage par zone", "Une zone par tableau électrique, via contrôleur iSMA. 3 zones (3 TD)."],
    ["ÉCLAIRAGE", "Pilotage par zone", "Commande par tableau, via contrôleur iSMA. 2 zones (2 TD)."],
    ["PRÉSENCE & OCCUPATION", "30 capteurs LoRaWAN", "Capteurs de présence sans fil pour l'optimisation présence / occupation, appairés nativement au concentrateur LCAT."],
    ["COMPTAGE ÉLECTRIQUE", "Compteur Enedis · API", "Remontée des consommations électriques du site via API cloud Enedis."],
  ];
  scope.forEach((item, index) => {
    replace(6, scopeTemplate[index][0], item.label);
    replace(6, scopeTemplate[index][1], item.headline);
    replace(6, scopeTemplate[index][2], item.detail);
  });

  replace(7, "04 · LE PROJET SFE — ARCHITECTURE SYNOPTIQUE", `04 · LE PROJET ${site.toUpperCase()} - ARCHITECTURE`);
  const architectureTemplate = [
    ["MODBUS RTU / TCP", "Coolmaster Pro", "2 réseaux VRV", "30 unités intérieures"],
    ["BACnet IP & MS/TP", "Contrôleur iSMA", "Aérothermes par zone", "Éclairage par zone"],
    ["LoRaWAN NATIF", "30 capteurs présence", "Optimisation", "présence / occupation"],
    ["API", "Compteur Enedis", "Remontée des", "consommations électriques"],
  ];
  model.architecture.nodes.forEach((node, index) => {
    const template = architectureTemplate[index];
    replace(7, template[0], node.protocol);
    replace(7, template[1], node.name);
    replace(7, template[2], node.line1);
    replace(7, template[3], node.line2);
  });

  replace(8, "Une conformité démontrée, prête pour l'audit.", model.compliance.confirmed
    ? "Une conformité définie, prête pour validation."
    : "Une conformité à confirmer après validation technique.");
  replace(8, "05 · CONFORMITÉ ATTEINTE", "05 · CONFORMITÉ VISÉE");
  replace(
    8,
    "Classe A — EN 15232 / NF EN ISO 52120-1",
    model.compliance.confirmed
      ? `Classe ${model.compliance.className} - EN 15232 / NF EN ISO 52120-1`
      : "Classe à confirmer - EN 15232 / NF EN ISO 52120-1"
  );
  replace(8, "Système d'automatisation et de contrôle conforme.", model.compliance.confirmed
    ? "Système d'automatisation et de contrôle conforme au périmètre validé."
    : "Périmètre et fonctions BACS à valider avant engagement.");
  replace(
    8,
    "Prête pour audit — la conformité se démontre, elle ne se déclare pas.",
    model.compliance.confirmed
      ? "Restitution à documenter lors de la mise en service."
      : "Restitution à définir après validation du périmètre."
  );
  replace(
    8,
    "La classe A au sens de la norme EN 15232 / NF EN ISO 52120-1 est atteinte sur le poste chauffage / climatisation du périmètre.",
    model.compliance.detail
  );
  replace(
    8,
    "La restitution réglementaire par usage est disponible et documentée — conformité opposable, défendable devant un auditeur.",
    model.compliance.auditDetail
  );

  replace(9, "06 · L'OFFRE— TOUT COMPRIS", `06 · L'OFFRE ${model.offer.type} - TOUT COMPRIS`);
  replace(9, "Un POC clé en main, tout compris.", `Une offre ${model.offer.type} structurée sur le périmètre relevé.`);
  replace(9, "OFFRE POC · ANNÉE 1", `OFFRE ${model.offer.type} · ANNÉE 1`);
  replace(9, "21 000 € HT", formatEuro(model.offer.price));
  ["Matériel", "Ingénierie & intégration", "Mise en service", "Capteurs", "Licence Hypervision — année 1"].forEach(
    (oldText, index) => replace(9, oldText, model.offer.includes[index] || "À confirmer")
  );
  replace(
    9,
    "Applicable uniquement dans le cadre du POC. La présente offre, hors remise, constitue le DPGF contractuel de référence pour tout déploiement futur du Groupe NOVARC (multi-sites).",
    model.offer.commercialNote
  );
  replace(
    9,
    "Licence supervision Hypervision en récurrent annuel à partir de l'année 2. Le matériel et l'ingénierie restent acquis.\nOPEX annuel : 2 278 € HT/an",
    recurringText(model.offer)
  );

  replace(10, "07 · DU POC AU DÉPLOIEMENT GROUPE", `07 · DE ${model.offer.type} AU DÉPLOIEMENT`);
  replace(10, "Un site qui devient la référence du Groupe.", "Un site pilote pour les déploiements suivants.");
  replace(
    10,
    "Le POC SFE valide l'architecture et sert de référence contractuelle (DPGF) pour généraliser la démarche sur l'ensemble des sites SAFETY / NOVARC.",
    model.deployment.intro
  );
  replace(10, "LE POC — SITE SFE", `${model.offer.type} - ${model.deployment.siteLabel.toUpperCase()}`);
  replace(10, "LE GROUPE — SAFETY / NOVARC", `LE PARC - ${model.deployment.groupLabel.toUpperCase()}`);
  replace(10, "Validation du POC", model.deployment.nextStep);
  replace(10, "Accord sur le périmètre SFE et l'offre tout compris.", model.deployment.nextStepDetail);
  replace(10, "Relevé contradictoire", model.deployment.surveyStep);
  replace(10, "Surfaces et équipements confirmés sur site.", model.deployment.surveyDetail);
  replace(10, "Planification du déploiement et de la recette.", model.deployment.commissioningDetail);

  const validation = await finalizeDeck({ PresentationFile, presentation, outputPath });

  return { model, touched, outputPath, validation };
}
