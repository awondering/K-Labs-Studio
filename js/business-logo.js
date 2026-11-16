// Optional business logo for customer documents. The logo lives inside the account's own Business Profile
// (businessProfile.logo), so it is stored, synchronised and isolated exactly like the other profile fields:
// per-account local storage key, per-user cloud settings row, available offline. Nothing here is shared between
// accounts and there is no built-in default logo.
(function () {
  "use strict";
  const MAX_INPUT_BYTES = 5 * 1024 * 1024;
  const MAX_SOURCE_PIXELS = 40 * 1024 * 1024;
  const MAX_WIDTH = 480;
  const MAX_HEIGHT = 240;
  const MIN_SIDE = 32;
  const MAX_STORED_LENGTH = 96000; // characters of the data URL kept in the profile and in each issued invoice
  const ACCEPT = ["image/png", "image/jpeg", "image/webp"];
  const PATTERN = /^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/;

  // Returns the value only if it is a small raster data URL this module could have produced; anything else is "no logo".
  function sanitise(value) {
    const text = typeof value === "string" ? value.trim() : "";
    return text && text.length <= MAX_STORED_LENGTH && PATTERN.test(text) ? text : "";
  }

  function fail(message) {
    const error = new Error(message);
    error.userMessage = message;
    return error;
  }

  function decode(blob) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(blob);
      const image = new Image();
      image.onload = () => { URL.revokeObjectURL(url); resolve(image); };
      image.onerror = () => { URL.revokeObjectURL(url); reject(fail("That image could not be read. Choose a PNG, JPEG or WebP file.")); };
      image.src = url;
    });
  }

  // Validates, scales and re-encodes the picked file. Re-encoding through a canvas removes metadata (including location
  // data) and guarantees a plain bitmap. `internal.allowSvg` is only used for the bundled K-Labs mark, never for user files.
  async function process(file, internal) {
    if (!file || typeof file !== "object") throw fail("Choose an image file.");
    const type = String(file.type || "").toLowerCase();
    const allowed = ACCEPT.includes(type) || (internal && internal.allowSvg && type === "image/svg+xml");
    if (!allowed) throw fail("Use a PNG, JPEG or WebP image.");
    if (!(file.size > 0)) throw fail("That file is empty.");
    if (file.size > MAX_INPUT_BYTES) throw fail("That image is larger than 5 MB. Choose a smaller file.");
    const image = await decode(file);
    const sourceWidth = image.naturalWidth || image.width;
    const sourceHeight = image.naturalHeight || image.height;
    if (!sourceWidth || !sourceHeight) throw fail("That image could not be read.");
    if (sourceWidth * sourceHeight > MAX_SOURCE_PIXELS) throw fail("That image is too large. Choose one under 40 megapixels.");
    if (Math.min(sourceWidth, sourceHeight) < MIN_SIDE && !(internal && internal.allowSvg)) {
      throw fail("That image is too small to print clearly. Use one at least 32 pixels on its shortest side.");
    }
    const scale = Math.min(1, MAX_WIDTH / sourceWidth, MAX_HEIGHT / sourceHeight);
    const width = Math.max(1, Math.round(sourceWidth * scale));
    const height = Math.max(1, Math.round(sourceHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw fail("This browser could not prepare the image.");
    context.drawImage(image, 0, 0, width, height);
    // PNG keeps transparency and sharp line art. If it is too large (a photograph), fall back to JPEG on white.
    let dataUrl = sanitise(canvas.toDataURL("image/png"));
    if (!dataUrl) {
      const flat = document.createElement("canvas");
      flat.width = width;
      flat.height = height;
      const flatContext = flat.getContext("2d");
      flatContext.fillStyle = "#ffffff";
      flatContext.fillRect(0, 0, width, height);
      flatContext.drawImage(canvas, 0, 0);
      for (const quality of [0.88, 0.76, 0.62, 0.5]) {
        dataUrl = sanitise(flat.toDataURL("image/jpeg", quality));
        if (dataUrl) break;
      }
    }
    if (!dataUrl) throw fail("That image is too detailed to store as a logo. Use a simpler or smaller image.");
    return { dataUrl, width, height };
  }

  const api = { sanitise, process, ACCEPT, MAX_STORED_LENGTH, MAX_INPUT_BYTES };
  if (typeof window !== "undefined") window.KLABS_BUSINESS_LOGO = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})();
