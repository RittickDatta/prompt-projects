import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const readmePath = path.join(rootDirectory, "README.md");
const startMarker = "<!-- PROJECTS:START -->";
const endMarker = "<!-- PROJECTS:END -->";

function decodeHtml(value) {
  return value
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;|&apos;/gi, "'");
}

function attributeValue(tag, attribute) {
  const match = tag.match(new RegExp(`\\b${attribute}\\s*=\\s*(["'])(.*?)\\1`, "i"));
  return match ? decodeHtml(match[2]) : "";
}

function folderTitle(folder) {
  return folder
    .replace(/[-_]+/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function projectDetails(folder) {
  const pagePath = path.join(rootDirectory, folder, "index.html");
  if (!existsSync(pagePath)) return null;

  const markup = readFileSync(pagePath, "utf8");
  const rawTitle = markup.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  const title = rawTitle
    ? decodeHtml(rawTitle.replace(/<[^>]*>/g, "").trim()).split(/\s+[—–|]\s+/)[0].trim()
    : folderTitle(folder);
  const metaTags = markup.match(/<meta\b[^>]*>/gi) || [];
  let description = "";

  for (const tag of metaTags) {
    if (attributeValue(tag, "name").toLowerCase() === "description") {
      description = attributeValue(tag, "content");
      break;
    }
  }

  return {
    folder,
    title: title || folderTitle(folder),
    description: description || "A small, focused web tool for everyday tasks."
  };
}

function tableCell(value) {
  return value.replace(/\r?\n/g, " ").replace(/\\/g, "\\\\").replace(/\|/g, "\\|").trim();
}

function projectRows() {
  const projects = readdirSync(rootDirectory, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
    .map((entry) => projectDetails(entry.name))
    .filter(Boolean)
    .sort((a, b) => a.title.localeCompare(b.title));

  if (projects.length === 0) {
    return "| No projects yet | Add a root-level project folder with an `index.html` to list it here. | — |";
  }

  return projects.map((project) => {
    const folderUrl = encodeURIComponent(project.folder);
    return `| ${tableCell(project.title)} | ${tableCell(project.description)} | [Open app](./${folderUrl}/index.html) |`;
  }).join("\n");
}

const readme = readFileSync(readmePath, "utf8");
const start = readme.indexOf(startMarker);
const end = readme.indexOf(endMarker);

if (start === -1 || end === -1 || end < start) {
  throw new Error("README project table markers are missing or out of order.");
}

const table = [
  "| Project | What it does | Visit |",
  "| --- | --- | --- |",
  projectRows()
].join("\n");
const updatedReadme = `${readme.slice(0, start + startMarker.length)}\n${table}\n${readme.slice(end)}`;

if (updatedReadme !== readme) {
  writeFileSync(readmePath, updatedReadme);
  console.log("Updated the README project table.");
} else {
  console.log("The README project table is already up to date.");
}
