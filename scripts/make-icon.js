const fs = require("fs");
const path = require("path");
const pngToIco = require("png-to-ico");

(async () => {
  try {
    const root = path.join(__dirname, "..");
    const src = path.join(root, "goat.png");
    const out = path.join(root, "icon.ico");

    if (!fs.existsSync(src)) {
      console.error("goat.png not found at", src);
      process.exit(2);
    }

    console.log("Reading source image:", src);

    // Prefer sharp for reliable resizing. Dynamically import to avoid ESM/CJS issues.
    let sharp;
    try {
      const sharpMod = await import("sharp");
      sharp = sharpMod.default || sharpMod;
    } catch (e) {
      console.error(
        'Please install "sharp" (npm i --save-dev sharp) to generate icons.'
      );
      throw e;
    }

    const sizes = [256, 128, 64, 48, 32, 16];
    const tmpFiles = [];

    try {
      for (const s of sizes) {
        const tmpPath = path.join(root, `icon-${s}.png`);
        await sharp(src)
          .resize(s, s, {
            fit: "contain",
            background: { r: 0, g: 0, b: 0, alpha: 0 },
          })
          .png()
          .toFile(tmpPath);
        tmpFiles.push(tmpPath);
      }

      console.log("Generated temporary PNGs:", tmpFiles);
      for (const f of tmpFiles) {
        try {
          const st = fs.statSync(f);
          console.log("  ", f, st.size, "bytes");
        } catch (e) {
          console.log("  ", f, "missing");
        }
      }

      console.log("Generating icon.ico (sizes:", sizes.join(", "), ")");
      // png-to-ico expects a single source PNG (it will generate smaller sizes itself).
      const icoBuf = await pngToIco(tmpFiles[0]);
      fs.writeFileSync(out, icoBuf);
      console.log("Wrote", out);
    } finally {
      for (const f of tmpFiles) {
        try {
          fs.unlinkSync(f);
        } catch (e) {}
      }
    }
  } catch (err) {
    console.error("icon generation failed:", err);
    process.exit(1);
  }
})();
