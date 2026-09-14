import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { generateProposalInBrowser } from "../public/core/pptx-browser.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const modulesPath = process.env.RUNTIME_NODE_MODULES;
if (!modulesPath || !path.isAbsolute(modulesPath)) {
  throw new Error("RUNTIME_NODE_MODULES n'est pas configuré.");
}
const runtimeRequire = createRequire(path.join(modulesPath, "__runtime__.cjs"));
const JSZip = runtimeRequire("jszip");
const visit = JSON.parse(await fs.readFile(path.join(root, "examples", "visite-demo.json"), "utf8"));
const templateBytes = await fs.readFile(path.join(root, "public", "assets", "europrod-proposal-template.pptx"));
const commercial = {
  clientName: "Horizon Hôtellerie",
  groupName: "Horizon Hôtellerie",
  siteName: "Hôtel Horizon Lyon Centre",
  siteType: "hotel",
  offerType: "POC",
  price: 48600,
  recurring: 3240,
  complianceClass: "B",
  includes: [
    "Matériel et coffrets",
    "Ingénierie et intégration",
    "Mise en service",
    "Capteurs et passerelles",
    "Supervision, année 1",
  ],
};

const result = await generateProposalInBrowser({
  JSZip,
  templateBytes,
  visit,
  commercial,
  outputType: "nodebuffer",
});
const outputDir = path.join(root, "tmp");
const outputPath = path.join(outputDir, "static-generator-demo.pptx");
await fs.mkdir(outputDir, { recursive: true });
await fs.writeFile(outputPath, result.file);
console.log(JSON.stringify({ outputPath, touched: result.touched.length, slides: 10 }));
