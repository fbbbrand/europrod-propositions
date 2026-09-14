import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = path.join(root, "public");
const destination = path.join(root, "dist");

if (path.dirname(destination) !== root || path.basename(destination) !== "dist") {
  throw new Error("Dossier de sortie invalide.");
}

await fs.rm(destination, { recursive: true, force: true });
await fs.cp(source, destination, { recursive: true });
console.log(`Site statique construit dans ${destination}`);
