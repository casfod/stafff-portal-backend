#!/usr/bin/env node
// node scripts/next-routes.mjs

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import chalk from "chalk";

// ———————————————— CONFIG ————————————————

const IGNORE_DIRS = new Set(["node_modules", ".next", ".git", "public"]);
const SHOW_FILE_TYPES = new Set(["ts", "tsx", "js", "jsx"]);
const SPECIAL_PREFIXES = ["page.", "layout.", "loading.", "error."];

// Resolve this script’s __dirname
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ▼ Choose one of the two:
// 1) Scan your whole project root:
const projectRoot = path.join(__dirname, "../../stafff-portal-backend");
// 2) Scan only the Next.js “app” directory:
// const projectRoot = path.join(__dirname, "../../Thrift-Pool-Web/app");

// ———————————————— SCANNER ————————————————

function scanDirectory(dir, prefix = "", isLast = true) {
  const entries = fs
    .readdirSync(dir)
    .filter((e) => !IGNORE_DIRS.has(e))
    .sort((a, b) => {
      const aDir = fs.statSync(path.join(dir, a)).isDirectory();
      const bDir = fs.statSync(path.join(dir, b)).isDirectory();
      return bDir - aDir || a.localeCompare(b);
    });

  entries.forEach((name, idx) => {
    const fullPath = path.join(dir, name);
    const isDir = fs.statSync(fullPath).isDirectory();
    const last = idx === entries.length - 1;
    const branch = last ? "└── " : "├── ";
    const connector = isLast ? "    " : "│   ";

    if (isDir) {
      console.log(`${prefix}${branch}${chalk.blue(name)}/`);
      scanDirectory(fullPath, prefix + connector, last);
    } else {
      const ext = name.split(".").pop();
      if (!SHOW_FILE_TYPES.has(ext)) return;

      // highlight "special" Next.js files in green
      const isSpecial = SPECIAL_PREFIXES.some((p) => name.startsWith(p));
      const colorFn = isSpecial ? chalk.green : chalk.white;
      console.log(`${prefix}${branch}${colorFn(name)}`);
    }
  });
}

// ———————————————— MAIN ————————————————

console.log(chalk.bold("Project file structure:"));
console.log(`Scanning: ${chalk.cyan(projectRoot)}\n`);

if (fs.existsSync(projectRoot)) {
  scanDirectory(projectRoot);
} else {
  console.error(chalk.red("Directory not found:"), projectRoot);
  console.log(
    chalk.yellow("Adjust the `projectRoot` path at the top of this script.")
  );
}
