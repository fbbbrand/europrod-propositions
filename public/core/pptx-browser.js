import { deriveProposalModel } from "./proposal-model.js";
import { buildPptxReplacements } from "./pptx-content.js";

function decodeXml(value) {
  return String(value)
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&#([0-9]+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function escapeXml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function normalized(value) {
  return decodeXml(value)
    .replace(/\r/g, "")
    .replace(/[\t ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .trim();
}

function textFromShape(shapeXml) {
  const paragraphs = [...shapeXml.matchAll(/<a:p(?:\s[^>]*)?>([\s\S]*?)<\/a:p>/g)];
  if (!paragraphs.length) return "";
  return paragraphs
    .map((paragraph) => [...paragraph[1].matchAll(/<a:t(?:\s[^>]*)?>([\s\S]*?)<\/a:t>/g)]
      .map((match) => match[1])
      .join(""))
    .join("\n");
}

function writeShapeText(shapeXml, value) {
  let wrote = false;
  return shapeXml.replace(/<a:t([^>]*)>[\s\S]*?<\/a:t>/g, (_match, attributes) => {
    const cleanAttributes = String(attributes || "").replace(/\s+xml:space=(?:"[^"]*"|'[^']*')/g, "");
    if (!wrote) {
      wrote = true;
      return `<a:t${cleanAttributes} xml:space="preserve">${escapeXml(value)}</a:t>`;
    }
    return `<a:t${cleanAttributes}></a:t>`;
  });
}

function replaceShape(slideXml, replacement) {
  let replaced = false;
  const nextXml = slideXml.replace(/<p:sp(?:\s[^>]*)?>[\s\S]*?<\/p:sp>/g, (shapeXml) => {
    if (replaced || normalized(textFromShape(shapeXml)) !== normalized(replacement.from)) return shapeXml;
    replaced = true;
    return writeShapeText(shapeXml, replacement.to);
  });
  if (!replaced && replacement.required) {
    throw new Error(`Zone du gabarit introuvable, diapositive ${replacement.slide} : ${replacement.from}`);
  }
  return { xml: nextXml, replaced };
}

export async function generateProposalInBrowser({ JSZip, templateBytes, visit, commercial, outputType = "blob" }) {
  if (!JSZip) throw new Error("Le module de génération PowerPoint n'est pas chargé.");
  const model = deriveProposalModel(visit, commercial);
  if (!model.validation.canGenerate) {
    throw new Error(`Données indispensables manquantes : ${model.validation.blockers.join(", ")}`);
  }

  const zip = await JSZip.loadAsync(templateBytes);
  const replacements = buildPptxReplacements(model);
  const bySlide = new Map();
  for (const replacement of replacements) {
    if (!bySlide.has(replacement.slide)) bySlide.set(replacement.slide, []);
    bySlide.get(replacement.slide).push(replacement);
  }

  const touched = [];
  for (const [slideNumber, slideReplacements] of bySlide) {
    const slidePath = `ppt/slides/slide${slideNumber}.xml`;
    const entry = zip.file(slidePath);
    if (!entry) throw new Error(`Diapositive ${slideNumber} absente du gabarit.`);
    let xml = await entry.async("string");
    for (const replacement of slideReplacements) {
      const result = replaceShape(xml, replacement);
      xml = result.xml;
      if (result.replaced) touched.push(replacement);
    }
    zip.file(slidePath, xml);
  }

  const file = await zip.generateAsync({
    type: outputType,
    mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });

  return { file, model, touched };
}
