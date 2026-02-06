const fs = require("fs");
const path = require("path");
const jsDir = "f:/Proyectos/Web/jigsudo/js";

function convertToUtf8(filePath) {
  try {
    const buffer = fs.readFileSync(filePath);
    // Basic UTF-16 LE detection (FF FE)
    if (buffer[0] === 0xff && buffer[1] === 0xfe) {
      console.log(`Converting UTF-16 LE: ${filePath}`);
      // Use TextDecoder for accurate conversion
      const decoder = new TextDecoder("utf-16le");
      const content = decoder.decode(buffer);
      fs.writeFileSync(filePath, content, "utf8");
      return;
    }

    // Already UTF-8 or similar
    const content = buffer.toString("utf8");
    fs.writeFileSync(filePath, content, "utf8");
  } catch (e) {
    console.error(`Failed to convert ${filePath}:`, e);
  }
}

fs.readdirSync(jsDir).forEach((file) => {
  if (file.endsWith(".js")) {
    convertToUtf8(path.join(jsDir, file));
  }
});
console.log("Conversion complete.");
