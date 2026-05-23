export async function loadImageFile(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImageElement(url);
    const w = img.naturalWidth || img.width;
    const h = img.naturalHeight || img.height;
    if (!w || !h) {
      throw new Error(`Image has no intrinsic size: ${file.name}`);
    }
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, 0, 0, w, h);
    return { canvas, width: w, height: h, fileName: file.name };
  } finally {
    URL.revokeObjectURL(url);
  }
}

function loadImageElement(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Failed to decode image"));
    img.src = url;
  });
}

// Content hash for image dedup — SHA-256 of the dataURL truncated to 16 hex
// chars. 16 chars ≈ 64 bits → collision odds < 1 in 10^16 for tens of
// thousands of images. Short enough to keep localStorage keys readable.
export async function computeImageHash(dataURL) {
  const enc = new TextEncoder().encode(dataURL);
  const buf = await crypto.subtle.digest("SHA-256", enc);
  const view = new Uint8Array(buf);
  let hex = "";
  for (let i = 0; i < 8; i++) hex += view[i].toString(16).padStart(2, "0");
  return hex;
}

// Convert a loaded source (canvas + width/height) back to a dataURL for
// storage. Always PNG to stay lossless.
export function sourceToDataURL(source) {
  if (!source?.canvas) return null;
  return source.canvas.toDataURL("image/png");
}

// Extra pixels on right/bottom that don't fit a full tile are ignored.
export function splitIntoTiles(source, tileSize) {
  if (!source || !source.canvas) throw new Error("source is required");
  if (!Number.isFinite(tileSize) || tileSize <= 0) {
    throw new Error("tileSize must be a positive number");
  }

  const cols = Math.floor(source.width / tileSize);
  const rows = Math.floor(source.height / tileSize);
  const tiles = [];

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const tile = document.createElement("canvas");
      tile.width = tileSize;
      tile.height = tileSize;
      // willReadFrequently hint — tresBuilder reads the center pixel via
      // getImageData when picking terrain swatches; without the hint the
      // browser logs a Canvas2D readback warning per call.
      const ctx = tile.getContext("2d", { willReadFrequently: true });
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(
        source.canvas,
        c * tileSize, r * tileSize, tileSize, tileSize,
        0, 0, tileSize, tileSize,
      );
      tiles.push({
        id: `tile-${r}-${c}`,
        row: r,
        col: c,
        canvas: tile,
        dataUrl: tile.toDataURL("image/png"),
      });
    }
  }

  return { cols, rows, tiles };
}
