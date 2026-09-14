import { deriveProposalModel } from "/core/proposal-model.js";
import { generateProposalInBrowser } from "/core/pptx-browser.js";

const state = {
  visit: null,
  fileName: "",
  model: null,
  analyzing: false,
};

const $ = (selector) => document.querySelector(selector);
const fileInput = $("#fileInput");
const dropzone = $("#dropzone");
const fileState = $("#fileState");
const form = $("#commercialForm");
const generateButton = $("#generateButton");

function toast(message) {
  const element = $("#toast");
  element.textContent = message;
  element.classList.add("show");
  clearTimeout(element.timer);
  element.timer = setTimeout(() => element.classList.remove("show"), 3400);
}

function numberValue(value) {
  const parsed = Number(String(value || "").replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
}

function plural(count, singular, pluralForm = `${singular}s`) {
  return count === 1 ? singular : pluralForm;
}

function safeFileName(value) {
  return String(value || "proposition")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60) || "proposition";
}

function commercialData() {
  return {
    clientName: $("#clientName").value.trim(),
    groupName: $("#groupName").value.trim(),
    siteName: $("#siteName").value.trim(),
    siteType: $("#siteType").value,
    offerType: $("#offerType").value,
    price: numberValue($("#price").value),
    recurring: numberValue($("#recurring").value),
    complianceClass: $("#complianceClass").value.replace("Classe ", ""),
    includes: $("#includes").value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean),
    commercialNote: $("#commercialNote").value.trim(),
  };
}

function prefill(visit) {
  const f = visit.f || {};
  $("#clientName").value = f.enseigne || f.hotel || "";
  $("#groupName").value = f.enseigne || "";
  $("#siteName").value = f.hotel || f.ville || "";
}

async function analyze() {
  if (!state.visit || state.analyzing) return;
  state.analyzing = true;
  try {
    const model = deriveProposalModel(state.visit, commercialData());
    state.model = model;
    renderModel(model);
  } catch (error) {
    toast(error.message);
  } finally {
    state.analyzing = false;
  }
}

function renderModel(model) {
  const summary = [
    ["Client", model.meta.client],
    ["Site", model.meta.site],
    ["Surface GTB", model.meta.area ? `${model.meta.area.toLocaleString("fr-FR")} m²` : "À confirmer"],
    ["Chambres", model.meta.rooms || "Non applicable ou à confirmer"],
    ["Protocoles", model.protocols.map((item) => item.name).join(", ")],
    ["Points terrain", model.diagnostics.sensorCount.toLocaleString("fr-FR")],
    ["Photos", model.diagnostics.photoCount],
  ];
  $("#summaryList").innerHTML = summary
    .map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`)
    .join("");

  const issues = [
    ...model.validation.blockers.map((item) => ({ item, type: "blocker" })),
    ...model.validation.warnings.map((item) => ({ item, type: "warning" })),
  ];
  $("#issueList").innerHTML = issues.length
    ? issues.map(({ item, type }) => `<li class="${type}">${escapeHtml(item)}</li>`).join("")
    : "<li>Aucun point bloquant détecté.</li>";

  const commercial = commercialData();
  const checks = [
    ["client", Boolean(model.meta.client)],
    ["site", Boolean(model.meta.site)],
    ["surface GTB", model.meta.area > 0],
    ["protocoles", model.protocols.length > 0],
    ["points terrain", model.diagnostics.sensorCount > 0],
    ["montant HT", commercial.price > 0],
    ["classe de performance", ["A", "B"].includes(commercial.complianceClass)],
    ["photos", model.diagnostics.photoCount > 0],
  ];
  const validChecks = checks.filter(([, valid]) => valid).length;
  const missingChecks = checks.filter(([, valid]) => !valid).map(([label]) => label);
  $("#qualityScore").textContent = `${validChecks}/${checks.length}`;
  $("#qualityLabel").textContent = validChecks === checks.length
    ? "Complet"
    : model.validation.canGenerate ? "À relire" : "Incomplet";
  $("#qualityCaption").textContent = missingChecks.length
    ? `${validChecks} contrôles validés sur ${checks.length}. À compléter : ${missingChecks.join(", ")}.`
    : "Les 8 contrôles sont validés.";
  generateButton.disabled = !model.validation.canGenerate;
  $("#actionStatus").textContent = model.validation.canGenerate
    ? `${model.validation.warnings.length} ${plural(model.validation.warnings.length, "point")} à relire avant envoi`
    : `${model.validation.blockers.length} ${plural(model.validation.blockers.length, "donnée indispensable", "données indispensables")} ${plural(model.validation.blockers.length, "manquante", "manquantes")}`;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  })[character]);
}

async function loadVisit(visit, name) {
  if (!visit || typeof visit !== "object" || !visit.f || !visit.t) {
    throw new Error("Ce fichier ne correspond pas à un export du carnet GTB.");
  }
  state.visit = visit;
  state.fileName = name;
  prefill(visit);
  dropzone.hidden = true;
  fileState.hidden = false;
  $("#fileName").textContent = name;
  const photoCount = Object.values(visit.p || {}).filter(Boolean).length;
  const responseCount = Object.keys(visit.f || {}).length;
  $("#fileMeta").textContent = `${responseCount} ${plural(responseCount, "réponse")}, ${photoCount} ${plural(photoCount, "photo")}`;
  await analyze();
}

async function loadFile(file) {
  if (!file) return;
  if (!file.name.toLowerCase().endsWith(".json")) {
    toast("Choisissez un fichier JSON exporté depuis le carnet GTB.");
    return;
  }
  try {
    const visit = JSON.parse(await file.text());
    await loadVisit(visit, file.name);
  } catch (error) {
    toast(error.message || "Le fichier JSON est illisible.");
  }
}

fileInput.addEventListener("change", () => loadFile(fileInput.files[0]));
dropzone.addEventListener("dragover", (event) => { event.preventDefault(); dropzone.classList.add("drag"); });
dropzone.addEventListener("dragleave", () => dropzone.classList.remove("drag"));
dropzone.addEventListener("drop", (event) => {
  event.preventDefault();
  dropzone.classList.remove("drag");
  loadFile(event.dataTransfer.files[0]);
});

$("#clearButton").addEventListener("click", () => {
  state.visit = null;
  state.model = null;
  fileInput.value = "";
  dropzone.hidden = false;
  fileState.hidden = true;
  generateButton.disabled = true;
  $("#summaryList").innerHTML = "<div><dt>Site</dt><dd>En attente du relevé</dd></div>";
  $("#issueList").innerHTML = "<li>Chargez un relevé pour lancer le contrôle.</li>";
  $("#qualityScore").textContent = "0/8";
  $("#qualityLabel").textContent = "À compléter";
  $("#qualityCaption").textContent = "Chargez un relevé pour afficher les contrôles.";
  $("#actionStatus").textContent = "Aucun relevé importé";
});

$("#demoButton").addEventListener("click", async () => {
  try {
    const response = await fetch("/assets/visite-demo.json");
    const demo = await response.json();
    await loadVisit(demo, "Visite_GTB_Demo.json");
    $("#price").value = "48600";
    $("#recurring").value = "3240";
    $("#complianceClass").value = "B";
    await analyze();
    toast("Exemple fictif chargé.");
  } catch (error) {
    toast(error.message);
  }
});

let formTimer;
form.addEventListener("input", () => {
  clearTimeout(formTimer);
  formTimer = setTimeout(analyze, 280);
});
form.addEventListener("change", analyze);

generateButton.addEventListener("click", async () => {
  if (!state.visit) return;
  const original = generateButton.innerHTML;
  generateButton.disabled = true;
  generateButton.innerHTML = "<span>Génération en cours…</span><b>···</b>";
  $("#actionStatus").textContent = "Construction des 10 diapositives";
  try {
    const templateResponse = await fetch("/assets/europrod-proposal-template.pptx");
    if (!templateResponse.ok) throw new Error("Le gabarit PowerPoint est indisponible.");
    const templateBytes = await templateResponse.arrayBuffer();
    const result = await generateProposalInBrowser({
      JSZip: globalThis.JSZip,
      templateBytes,
      visit: state.visit,
      commercial: commercialData(),
    });
    const blob = result.file;
    const name = `Proposition_Europrod_${safeFileName(result.model.meta.site)}.pptx`;
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(link.href), 1500);
    toast("PowerPoint généré. Relisez les réserves avant envoi.");
  } catch (error) {
    toast(error.message);
  } finally {
    generateButton.innerHTML = original;
    generateButton.disabled = !state.model?.validation?.canGenerate;
    $("#actionStatus").textContent = state.model?.validation?.canGenerate
      ? `${state.model.validation.warnings.length} ${plural(state.model.validation.warnings.length, "point")} à relire avant envoi`
      : "Complétez les données indispensables";
  }
});
