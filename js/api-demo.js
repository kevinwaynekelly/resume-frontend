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

const SUMMARY_COPY = {
  ACTIVE: "portfolio", // ← choose: "crisp" | "friendly" | "portfolio" | "minimal" | "debug" | "emoji"
  presets: {
    crisp: {
      result: "Output",
      mode: "Mode",
      ct: "Ciphertext",
      fp: "Key fingerprint",
      verify_ok: "Verified",
      verify_fail: "Not verified",
      rtt: "Latency",
      colo: "Edge",
      copy: "Copy",
      copied: "Copied!"
    },
    friendly: {
      result: "Your result",
      mode: "Style",
      ct: "Encrypted blob",
      fp: "Key print",
      verify_ok: "Checks passed",
      verify_fail: "Checks failed",
      rtt: "Round-trip",
      colo: "Served from",
      copy: "Copy",
      copied: "Copied!"
    },
    portfolio: {
      result: "Transformed text",
      mode: "Transform",
      ct: "Secure payload",
      fp: "Public key ID",
      verify_ok: "Origin & token verified",
      verify_fail: "Origin & token failed",
      rtt: "Response time",
      colo: "POP",
      copy: "Copy",
      copied: "Copied!"
    },
    minimal: {
      result: "→",
      mode: "Mode",
      ct: "CT",
      fp: "FP",
      verify_ok: "OK",
      verify_fail: "FAIL",
      rtt: "RTT",
      colo: "Colo",
      copy: "Copy",
      copied: "Copied!"
    },
    debug: {
      result: "Transformed",
      mode: "Mode",
      ct: "Ciphertext (preview)",
      fp: "Key FP",
      verify_ok: "Auth: OK",
      verify_fail: "Auth: FAIL",
      rtt: "RTT",
      colo: "Colo",
      copy: "Copy",
      copied: "Copied!"
    },
    emoji: {
      result: "✨ Result",
      mode: "🎛️ Mode",
      ct: "🔐 Ciphertext",
      fp: "🔑 Key FP",
      verify_ok: "✅ Verified",
      verify_fail: "❌ Not verified",
      rtt: "⏱️ Latency",
      colo: "🌍 Edge",
      copy: "Copy",
      copied: "Copied!"
    }
  }
};
const C = SUMMARY_COPY.presets[SUMMARY_COPY.ACTIVE];

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

function renderSummary({ res, json, ciphertext, keyFingerprintHex, t0, t1 }) {
  const kv = document.getElementById("demo-summary");
  if (!kv) return;

  const colo = (res.headers.get("cf-ray") || "").split("-")[1] || "—";
  const rtt = (t1 - t0).toFixed(1) + " ms";
  const ctPreview = `${ciphertext.slice(0, 56)}… (${ciphertext.length} chars)`;
  const verified = !!json.ok;

  kv.innerHTML = `
    <div class="summary-line"><strong>${C.result}:</strong> ${json.transformed}</div>
    <div class="summary-line"><strong>${C.mode}:</strong> ${json.mode}</div>
    <div class="summary-line"><strong>${C.ct}:</strong>
      <code id="ct-snippet">${ctPreview}</code>
      <button id="ct-copy" class="summary-copy">${C.copy}</button>
    </div>
    <div class="summary-line"><strong>${C.fp}:</strong>
      <code>${keyFingerprintHex.slice(0, 16)}…</code>
    </div>
    <div class="summary-line"><strong>${verified ? C.verify_ok : C.verify_fail}</strong></div>
    <div class="summary-line"><strong>${C.rtt}:</strong> ${rtt}</div>
    <div class="summary-line"><strong>${C.colo}:</strong> ${colo}</div>
  `;

  const copyBtn = document.getElementById("ct-copy");
  copyBtn?.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(ciphertext);
      copyBtn.textContent = C.copied;
      setTimeout(() => (copyBtn.textContent = C.copy), 1200);
    } catch {
      copyBtn.textContent = "Copy failed";
      setTimeout(() => (copyBtn.textContent = C.copy), 1200);
    }
  });
}

// ====== UI wiring ======
btn.addEventListener("click", async () => {
  const text = (textEl.value || "").trim();
  const mode = modeEl.value;
  if (!text) {
    outEl.textContent = "Please enter some text.";
    return;
  }

  btn.disabled = true;
  outEl.textContent = "Working…";
  encEl.textContent = "Encrypting…";

  const t0 = performance.now();
  try {
    const ciphertext = await encryptPayload({ text, mode });
    const t1 = performance.now();

    // Send to API
    const res = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ciphertext })
    });

    const json = await res.json().catch(() => ({}));

    renderSummary({
      res,
      json,
      ciphertext,
      keyFingerprintHex,
      t0,
      t1
    });
  } catch (err) {
    console.error(err);
    outEl.textContent = "Error while encrypting or sending.";
  } finally {
    btn.disabled = false;
  }
});
