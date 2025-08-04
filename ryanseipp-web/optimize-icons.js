#!/usr/bin/env node

import fs from "fs";
import path from "path";
import {execSync} from "child_process";
import {fileURLToPath} from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ICONS_DIR = "./src/components/icons";

function findSvgoPath() {
  try {
    const svgoPath = execSync("which svgo", {encoding: "utf8"}).trim();
    if (svgoPath) {
      return svgoPath;
    }
  } catch (error) {
    // which command failed
  }

  // Try common locations
  const commonPaths = [
    "npx svgo",
    "node_modules/.bin/svgo",
    "./node_modules/.bin/svgo",
  ];

  for (const path of commonPaths) {
    try {
      execSync(`${path} --version`, {stdio: "pipe"});
      return path;
    } catch (error) {
      // Path doesn't work, try next
    }
  }

  return null;
}

const SVGO_PATH = findSvgoPath();
if (!SVGO_PATH) {
  console.error(
    "❌ SVGO not found. Please install it with: npm install -g svgo",
  );
  process.exit(1);
}

function processAstroFile(filePath) {
  console.log(`Processing ${filePath}...`);

  const content = fs.readFileSync(filePath, "utf8");

  // Extract frontmatter (everything between --- blocks)
  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n/);
  if (!frontmatterMatch) {
    console.warn(`No frontmatter found in ${filePath}, skipping...`);
    return;
  }

  const frontmatter = frontmatterMatch[0];
  const afterFrontmatter = content.substring(frontmatter.length);

  // Extract SVG content
  const svgMatch = afterFrontmatter.match(/(<svg[\s\S]*?<\/svg>)/);
  if (!svgMatch) {
    console.warn(`No SVG found in ${filePath}, skipping...`);
    return;
  }

  let svgContent = svgMatch[1];

  // Remove width={size} and height={size} attributes for optimization
  svgContent = svgContent.replace(/\s+width=\{size\}/g, "");
  svgContent = svgContent.replace(/\s+height=\{size\}/g, "");

  // Create temporary file for SVGO
  const tempSvgPath = path.join(__dirname, "temp.svg");
  fs.writeFileSync(tempSvgPath, svgContent);

  try {
    // Run SVGO
    execSync(
      `${SVGO_PATH} --input "${tempSvgPath}" --output "${tempSvgPath}" --quiet`,
      {
        stdio: "pipe",
      },
    );

    // Read optimized SVG
    let optimizedSvg = fs.readFileSync(tempSvgPath, "utf8");

    // Add back width and height attributes to the opening svg tag
    optimizedSvg = optimizedSvg.replace(
      /(<svg[^>]*?)>/,
      "$1\n  width={size}\n  height={size}\n>",
    );

    // Reconstruct the Astro file
    const newContent = frontmatter + "\n" + optimizedSvg + "\n";

    // Write back to original file
    fs.writeFileSync(filePath, newContent);

    console.log(`✓ Optimized ${filePath}`);
  } catch (error) {
    console.error(`Error processing ${filePath}:`, error.message);
  } finally {
    // Clean up temp file
    if (fs.existsSync(tempSvgPath)) {
      fs.unlinkSync(tempSvgPath);
    }
  }
}

function main() {
  console.log("Starting SVG icon optimization...");
  console.log(`Using SVGO at: ${SVGO_PATH}\n`);

  // Get all .astro files in the icons directory
  const files = fs
    .readdirSync(ICONS_DIR)
    .filter((file) => file.endsWith(".astro"))
    .map((file) => path.join(ICONS_DIR, file));

  console.log(`Found ${files.length} icon files to process\n`);

  // Process each file
  files.forEach(processAstroFile);

  console.log("\n✓ All icons have been optimized!");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
