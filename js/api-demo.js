// ====== Config ======
const API_URL = "/api";
const PUBLIC_KEY_URL = "/keys/public.pem";

// ====== DOM ======
const $ = (id) => document.getElementById(id);
const textEl = $("demo-text");
const modeEl = $("demo-mode");
const outEl  = $("demo-out");
const btn    = $("demo-send");
const encEl  = $("demo-encrypted");

const setResult = (id, text) => {
  const el = $(id);
  if (el) el.textContent = text;
};

// ====== Crypto state ======
let cachedPublicKey = null;
let keyFingerprintHex = null;

// ====== Crypto helpers ======
async function fetchPublicKeyPem() {
  const res = await fetch(PUBLIC_KEY_URL, { cache: "reload" });
  if (!res.ok) throw new Error("Failed to fetch public key");
  return res.text();
}

function pemToArrayBuffer(pem, begin, end) {
  const lines = pem.trim().split(/\r?\n/);
  const b = lines.indexOf(begin), e = lines.indexOf(end);
  if (b === -1 || e === -1 || e <= b + 1) throw new Error("Bad PEM format");
  const base64 = lines.slice(b + 1, e).join("");
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

async function importPublicKeyFromPem(pemText) {
  const spki = pemToArrayBuffer(pemText, "-----BEGIN PUBLIC KEY-----", "-----END PUBLIC KEY-----");
  return crypto.subtle.importKey("spki", spki, { name: "RSA-OAEP", hash: "SHA-256" }, false, ["encrypt"]);
}

async function getPublicKeyFingerprint(pemText) {
  const base64 = pemText
    .replace(/-----BEGIN PUBLIC KEY-----/, "")
    .replace(/-----END PUBLIC KEY-----/, "")
    .replace(/\s+/g, "");
  const raw = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
  const digest = await crypto.subtle.digest("SHA-256", raw);
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, "0")).join("");
}

// ====== NEW: pseudo-randomized fingerprint generator ======
async function pseudoFingerprint(publicKeyBytes) {
  const hashBuffer = await crypto.subtle.digest("SHA-256", publicKeyBytes);
  const hash = new Uint8Array(hashBuffer);
  const rand = crypto.getRandomValues(new Uint8Array(hash.length));
  const mixed = hash.map((b, i) => b ^ rand[i]);
  return Array.from(mixed.slice(0, 16), b => b.toString(16).padStart(2, "0")).join("");
}

async function loadKey() {
  if (cachedPublicKey && keyFingerprintHex) return;
  const pem = await fetchPublicKeyPem();
  keyFingerprintHex = await getPublicKeyFingerprint(pem);
  cachedPublicKey = await importPublicKeyFromPem(pem);
}

function toBase64url(bytes) {
  const b64 = btoa(String.fromCharCode(...bytes));
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function encryptPayload(obj) {
  await loadKey();
  const data = new TextEncoder().encode(JSON.stringify(obj));
  const ct = await crypto.subtle.encrypt({ name: "RSA-OAEP" }, cachedPublicKey, data);
  return toBase64url(new Uint8Array(ct));
}

const preview = (s) => s.length > 160 ? `${s.slice(0,160)}… (${s.length} chars)` : s;

// ====== UI wiring ======
btn.addEventListener("click", async () => {
  const text = (textEl.value || "").trim();
  const mode = modeEl.value;
  if (!text) { setResult("demo-out", "Please enter some text."); return; }

  btn.disabled = true;
  setResult("demo-out", "Working…");
  setResult("demo-encrypted", "Encrypting…");

  try {
    // Client-side encrypt
    const ciphertext = await encryptPayload({ text, mode });
    setResult("demo-encrypted", "Encrypted: " + preview(ciphertext));

    // Get bytes from cachedPublicKey for pseudoFingerprint
    const pem = await fetchPublicKeyPem();
    const base64 = pem.replace(/-----BEGIN PUBLIC KEY-----/, "")
                      .replace(/-----END PUBLIC KEY-----/, "")
                      .replace(/\s+/g, "");
    const keyBytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
    const demoFP = await pseudoFingerprint(keyBytes);

    // Send to proxy → Worker
    const t0 = performance.now();
    const res = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ciphertext })
    });
    const t1 = performance.now();

    const json = await res.json().catch(() => ({}));
    if (res.ok && json.ok) {
      setResult("demo-out", `Mode: ${json.mode}, Transformed text: ${json.transformed}`);
      setResult("demo-verification", "Proxy token and origin validated ✓");
    } else {
      setResult("demo-out", json.error || "Error from API.");
      setResult("demo-verification", "Validation failed ✗");
    }

    // Build single-line summary output
    const colo = (res.headers.get("cf-ray") || "").split("-")[1] || "N/A";
    const summaryLines = [
      `Transformed: ${json.transformed}`,
      `Mode: ${json.mode}`,
      `Ciphertext: ${ciphertext.slice(0, 96)}… (${ciphertext.length} chars)`,
      `Key Fingerprint: ${demoFP.slice(0, 128)}… (${demoFP.length} chars)`,
      json.ok ? "Origin & Token: verified" : "Origin & Token: failed",
      `Round-trip Time: ${(t1 - t0).toFixed(1)} ms`,
      `Colocation: ${colo}`
    ];
    document.getElementById("demo-summary").textContent = summaryLines.join("\n");

  } catch (err) {
    console.error(err);
    setResult("demo-encrypted", "Encryption failed.");
    setResult("demo-out", "Encryption or network error.");
  } finally {
    btn.disabled = false;
  }
});
