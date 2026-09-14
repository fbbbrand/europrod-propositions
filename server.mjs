import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { deriveProposalModel } from "./src/proposal-model.mjs";
import { generateProposal } from "./src/pptx-generator.mjs";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(ROOT, "public");
const BUILD_DIR = path.join(ROOT, ".build", "requests");
const PORT = Number(process.env.PORT || 4173);
const HOST = process.env.HOST || "127.0.0.1";
const BODY_LIMIT = 60 * 1024 * 1024;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
};

function sendJson(response, status, payload) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(payload));
}

async function readJson(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > BODY_LIMIT) throw new Error("Le relevé dépasse la taille maximale de 60 Mo.");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

function safeFileName(value) {
  return String(value || "propale")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60) || "propale";
}

async function serveStatic(request, response) {
  const rawPath = request.url === "/" ? "/index.html" : request.url.split("?")[0];
  const relative = path.normalize(decodeURIComponent(rawPath)).replace(/^([/\\])+/, "");
  const filePath = path.resolve(PUBLIC_DIR, relative);
  if (!filePath.startsWith(PUBLIC_DIR)) {
    sendJson(response, 403, { error: "Accès refusé" });
    return;
  }
  try {
    const content = await fs.readFile(filePath);
    response.writeHead(200, { "Content-Type": MIME[path.extname(filePath)] || "application/octet-stream" });
    response.end(content);
  } catch {
    sendJson(response, 404, { error: "Ressource introuvable" });
  }
}

const server = http.createServer(async (request, response) => {
  try {
    if (request.method === "GET" && request.url === "/api/health") {
      sendJson(response, 200, { ok: true, product: "Europrod Propale", version: "0.1.0" });
      return;
    }
    if (request.method === "GET" && request.url === "/api/demo") {
      const demo = JSON.parse(await fs.readFile(path.join(ROOT, "examples", "visite-demo.json"), "utf8"));
      sendJson(response, 200, demo);
      return;
    }
    if (request.method === "POST" && request.url === "/api/analyze") {
      const payload = await readJson(request);
      sendJson(response, 200, deriveProposalModel(payload.visit, payload.commercial));
      return;
    }
    if (request.method === "POST" && request.url === "/api/generate") {
      const payload = await readJson(request);
      const stamp = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
      const outputPath = path.join(BUILD_DIR, `${stamp}.pptx`);
      const result = await generateProposal({ ...payload, outputPath });
      const file = await fs.readFile(outputPath);
      await fs.rm(outputPath, { force: true });
      await fs.rm(result.validation.stagingDir, { recursive: true, force: true });
      const label = safeFileName(result.model.meta.site);
      response.writeHead(200, {
        "Content-Type": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "Content-Length": file.length,
        "Content-Disposition": `attachment; filename="Propale_Europrod_${label}.pptx"`,
        "X-Europrod-Warnings": String(result.model.validation.warnings.length),
      });
      response.end(file);
      return;
    }
    await serveStatic(request, response);
  } catch (error) {
    console.error(error);
    sendJson(response, 400, { error: error.message || "Une erreur est survenue." });
  }
});

await fs.mkdir(BUILD_DIR, { recursive: true });
server.listen(PORT, HOST, () => {
  console.log(`Europrod Propale disponible sur http://${HOST}:${PORT}`);
});
