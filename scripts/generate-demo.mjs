import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { generateProposal } from "../src/pptx-generator.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const visit = JSON.parse(await fs.readFile(path.join(ROOT, "examples", "visite-demo.json"), "utf8"));
const outputPath = path.join(ROOT, "output", "Propale_Europrod_Demo.pptx");
await fs.rm(outputPath, { force: true });

const commercial = {
  clientName: "Horizon Hôtellerie",
  groupName: "Groupe Horizon",
  siteName: "Hôtel Horizon Lyon Centre",
  siteType: "hotel",
  offerType: "POC",
  object: "Proposition POC, conformité BACS",
  price: 48600,
  recurring: 3240,
  complianceClass: "B",
  includes: [
    "Matériel et coffrets",
    "Ingénierie et intégration",
    "Mise en service",
    "Capteurs et passerelles",
    "Supervision, année 1"
  ]
};

const result = await generateProposal({ visit, commercial, outputPath });
console.log(JSON.stringify({ outputPath, validation: result.model.validation, touched: result.touched.length }, null, 2));
