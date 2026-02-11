const fs = require("fs");
const path = require("path");

const iconsDir = path.resolve(__dirname, "../icons");

if (!fs.existsSync(iconsDir)) {
  console.error(`Icons dir not found: ${iconsDir}`);
  process.exit(1);
}

const files = fs.readdirSync(iconsDir);

const toPascal = (s) =>
  s
    .replace(/\.svg$/i, "")
    .split(/[-_\/\s]+/)
    .filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join("");

const lines = files
  .filter((f) => f.toLowerCase().endsWith(".svg"))
  .map((file) => {
    const name = toPascal(file);
    return `export { default as ${name} } from "./${file}";`;
  });

fs.writeFileSync(path.join(iconsDir, "index.ts"), lines.join("\n") + "\n");
console.log(`Generated ${lines.length} exports -> src/icons/index.ts`);
