import express from "express";
import cors from "cors";
import multer from "multer";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { randomUUID } from "crypto";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname);
const DIST_DIR = path.join(ROOT, "..", "dist");

// Charge .env sans dépendance (Windows / Node) — avant lecture des variables
try {
  const envPath = path.join(ROOT, "..", ".env");
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const i = trimmed.indexOf("=");
      if (i < 1) continue;
      const key = trimmed.slice(0, i).trim();
      const val = trimmed.slice(i + 1).trim();
      if (!(key in process.env)) process.env[key] = val;
    }
  }
} catch {
  /* ignore */
}

const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.join(ROOT, "data");
const UPLOAD_DIR = process.env.UPLOAD_DIR
  ? path.resolve(process.env.UPLOAD_DIR)
  : path.join(ROOT, "uploads");
const DB_PATH = path.join(DATA_DIR, "db.json");

const PORT = Number(process.env.PORT || 3001);
const IS_PROD = Boolean(process.env.RENDER || process.env.NODE_ENV === "production");

// JWT : jamais de secret par défaut connu. Sans variable d'env, secret
// aléatoire par démarrage (les sessions sautent au reboot, mais aucun
// secret prédictible ne circule).
const JWT_SECRET = process.env.JWT_SECRET || randomUUID() + randomUUID();
if (!process.env.JWT_SECRET) {
  console.warn(
    "⚠ JWT_SECRET non défini : secret aléatoire généré (sessions invalidées à chaque redémarrage). Définissez JWT_SECRET dans l'environnement.",
  );
}

const MANAGER_USER = process.env.MANAGER_USER || "gerant";
const MANAGER_PASSWORD = process.env.MANAGER_PASSWORD || "Sauto2026!";
if (!process.env.MANAGER_PASSWORD && IS_PROD) {
  console.warn(
    "⚠ MANAGER_PASSWORD non défini : mot de passe par défaut utilisé. Définissez MANAGER_PASSWORD dans l'environnement Render !",
  );
}

const DEFAULT_HOURS = [
  { day: "Lundi", time: "8h30 – 12h / 13h30 – 19h" },
  { day: "Mardi", time: "8h30 – 12h / 13h30 – 19h" },
  { day: "Mercredi", time: "8h30 – 12h / 13h30 – 19h" },
  { day: "Jeudi", time: "8h30 – 12h / 13h30 – 19h" },
  { day: "Vendredi", time: "8h30 – 12h / 13h30 – 19h" },
  { day: "Samedi", time: "8h30 – 12h / 13h30 – 19h" },
  { day: "Dimanche", time: "Fermé" },
];

const THEME_IDS = ["classique", "atelier", "prestige"];
const DEFAULT_THEME = "classique";
const MODE_IDS = ["clair", "sombre"];
const DEFAULT_MODE = "clair";

function normalizeTheme(value) {
  const id = String(value || "").trim().toLowerCase();
  return THEME_IDS.includes(id) ? id : DEFAULT_THEME;
}

function normalizeMode(value) {
  const id = String(value || "").trim().toLowerCase();
  return MODE_IDS.includes(id) ? id : DEFAULT_MODE;
}

const DEFAULT_AVIS = (() => {
  try {
    const p = path.join(ROOT, "..", "src", "data", "googleAvis.json");
    if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    /* fallback below */
  }
  return [
    {
      id: "seed-1",
      name: "Client Google",
      message:
        "Mon véhicule a été réparé rapidement et avec un résultat impeccable.",
      stars: 5,
      createdAt: "2024-01-01T10:00:00.000Z",
      source: "google",
    },
  ];
})();

const AVIS_VERSION = 2;

function ensureAvis(db) {
  const userAvis = Array.isArray(db.avis)
    ? db.avis.filter(
        (a) =>
          a &&
          !String(a.id || "").startsWith("seed-") &&
          !String(a.id || "").startsWith("google-") &&
          a.source !== "google",
      )
    : [];
  if (db.avisVersion !== AVIS_VERSION || !Array.isArray(db.avis)) {
    db.avis = [...userAvis, ...DEFAULT_AVIS.map((a) => ({ ...a }))];
    db.avisVersion = AVIS_VERSION;
    writeDb(db);
  }
  return db.avis;
}

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(UPLOAD_DIR, { recursive: true });
const PELLICULE_DIR = path.join(UPLOAD_DIR, "pellicule");
fs.mkdirSync(PELLICULE_DIR, { recursive: true });

function ensurePellicule(db) {
  if (!Array.isArray(db.pellicule)) {
    db.pellicule = [];
    writeDb(db);
    return db.pellicule;
  }
  const cleaned = db.pellicule.filter((p) => {
    if (!p || !p.id) return false;
    if (p.data) return true;
    if (p.src && String(p.src).startsWith("/uploads/")) {
      const file = safeUploadPath(p.src);
      return Boolean(file) && fs.existsSync(file);
    }
    return Boolean(p.src);
  });
  if (cleaned.length !== db.pellicule.length) {
    db.pellicule = cleaned;
    writeDb(db);
  }
  return db.pellicule;
}

function publicPellicule(db) {
  return ensurePellicule(db).map((p) => ({
    id: p.id,
    alt: p.alt || "Photo atelier S AUTO",
    createdAt: p.createdAt,
    src: p.data ? `/api/pellicule/${p.id}/image` : p.src,
  }));
}

function readDb() {
  if (!fs.existsSync(DB_PATH)) {
    const passwordHash = bcrypt.hashSync(MANAGER_PASSWORD, 10);
    const initial = {
      hours: DEFAULT_HOURS,
      theme: DEFAULT_THEME,
      mode: DEFAULT_MODE,
      devis: [],
      avis: DEFAULT_AVIS.map((a) => ({ ...a })),
      avisVersion: AVIS_VERSION,
      pellicule: [],
      manager: { username: MANAGER_USER, passwordHash },
    };
    fs.writeFileSync(DB_PATH, JSON.stringify(initial, null, 2), "utf8");
    return initial;
  }
  return JSON.parse(fs.readFileSync(DB_PATH, "utf8"));
}

function writeDb(db) {
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2), "utf8");
}

// Résout un chemin sous /uploads en bloquant toute traversée (../)
function safeUploadPath(src) {
  const rel = String(src || "").replace(/^\/uploads\//, "");
  const file = path.resolve(UPLOAD_DIR, rel);
  const base = path.resolve(UPLOAD_DIR) + path.sep;
  return file.startsWith(base) ? file : null;
}

// Le mot de passe gérant de l'environnement fait foi : rotation possible
// en changeant simplement la variable d'env (le hash en base est resynchronisé).
{
  const db = readDb();
  const m = db.manager;
  if (
    !m ||
    m.username !== MANAGER_USER ||
    !bcrypt.compareSync(MANAGER_PASSWORD, m.passwordHash)
  ) {
    db.manager = {
      username: MANAGER_USER,
      passwordHash: bcrypt.hashSync(MANAGER_PASSWORD, 12),
    };
    writeDb(db);
    console.log("Identifiants gérant synchronisés depuis l'environnement");
  }
}

/** Limiteur de débit en mémoire, par IP */
function rateLimit({ windowMs, max, message }) {
  const hits = new Map();
  setInterval(() => {
    const now = Date.now();
    for (const [key, rec] of hits) {
      if (now - rec.start > windowMs) hits.delete(key);
    }
  }, windowMs).unref();

  return (req, res, next) => {
    const ip = req.ip || req.socket.remoteAddress || "?";
    const now = Date.now();
    let rec = hits.get(ip);
    if (!rec || now - rec.start > windowMs) {
      rec = { start: now, count: 0 };
      hits.set(ip, rec);
    }
    rec.count += 1;
    if (rec.count > max) {
      return res
        .status(429)
        .json({ error: message || "Trop de requêtes, réessayez plus tard." });
    }
    next();
  };
}

// Types d'images autorisés (le mimetype est déclaratif mais on limite la surface)
const IMAGE_MIMES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/heic",
  "image/heif",
  "image/avif",
]);

function imageFilter(_req, file, cb) {
  if (IMAGE_MIMES.has(file.mimetype)) cb(null, true);
  else cb(new Error("Seules les images sont acceptées (JPG, PNG, WEBP…)"));
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const ext = (path.extname(file.originalname) || ".jpg")
      .toLowerCase()
      .replace(/[^\w.]/g, "")
      .slice(0, 10);
    cb(null, `${Date.now()}-${randomUUID().slice(0, 8)}${ext}`);
  },
});

const pelliculeStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, PELLICULE_DIR),
  filename: (_req, file, cb) => {
    const ext = (path.extname(file.originalname) || ".jpg")
      .toLowerCase()
      .replace(/[^\w.]/g, "")
      .slice(0, 10);
    cb(null, `${Date.now()}-${randomUUID().slice(0, 8)}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 6 * 1024 * 1024, files: 6 },
  fileFilter: imageFilter,
});

const uploadPellicule = multer({
  storage: pelliculeStorage,
  limits: { fileSize: 8 * 1024 * 1024, files: 12 },
  fileFilter: imageFilter,
});

const app = express();
app.disable("x-powered-by");
// Derrière le proxy Render : nécessaire pour récupérer la vraie IP client
app.set("trust proxy", 1);

// —— En-têtes de sécurité ——
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader(
    "Permissions-Policy",
    "camera=(self), microphone=(), geolocation=(), payment=()",
  );
  if (IS_PROD) {
    res.setHeader(
      "Strict-Transport-Security",
      "max-age=31536000; includeSubDomains",
    );
  }
  next();
});

// —— CORS restreint aux origines connues ——
const ALLOWED_ORIGINS = new Set(
  [
    "https://sauto-kq4l.onrender.com",
    process.env.SITE_ORIGIN, // origine supplémentaire (futur nom de domaine)
  ].filter(Boolean),
);
const LOCAL_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;
app.use(
  cors({
    origin(origin, cb) {
      // Requêtes same-origin / serveur-à-serveur : pas d'en-tête Origin
      if (!origin || ALLOWED_ORIGINS.has(origin) || LOCAL_ORIGIN.test(origin)) {
        return cb(null, true);
      }
      return cb(new Error("Origine non autorisée"));
    },
  }),
);

app.use(express.json({ limit: "2mb" }));

// —— Limites de débit ——
app.use(
  "/api/",
  rateLimit({
    windowMs: 5 * 60 * 1000,
    max: 400,
    message: "Trop de requêtes, patientez quelques minutes.",
  }),
);
const loginLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 8,
  message: "Trop de tentatives de connexion. Réessayez dans 10 minutes.",
});
const avisLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: "Trop d’avis envoyés. Réessayez plus tard.",
});
const devisLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  message: "Trop de demandes envoyées. Réessayez plus tard ou appelez-nous.",
});

app.use("/uploads", express.static(UPLOAD_DIR));

function auth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Non autorisé" });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: "Session expirée" });
  }
}

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.get("/api/hours", (_req, res) => {
  const db = readDb();
  res.json({ hours: db.hours || DEFAULT_HOURS });
});

app.put("/api/hours", auth, (req, res) => {
  const hours = req.body?.hours;
  if (!Array.isArray(hours) || hours.length === 0 || hours.length > 14) {
    return res.status(400).json({ error: "Horaires invalides" });
  }
  const cleaned = hours.map((h) => ({
    day: String(h.day || "").trim().slice(0, 40),
    time: String(h.time || "").trim().slice(0, 80),
  }));
  const db = readDb();
  db.hours = cleaned;
  writeDb(db);
  res.json({ hours: db.hours });
});

app.get("/api/theme", (_req, res) => {
  const db = readDb();
  res.json({
    theme: normalizeTheme(db.theme),
    mode: normalizeMode(db.mode),
    themes: THEME_IDS,
    modes: MODE_IDS,
  });
});

app.put("/api/theme", auth, (req, res) => {
  const rawTheme = String(req.body?.theme || "")
    .trim()
    .toLowerCase();
  const rawMode = String(req.body?.mode || "")
    .trim()
    .toLowerCase();

  if (!THEME_IDS.includes(rawTheme)) {
    return res.status(400).json({
      error: `Thème invalide. Choisir : ${THEME_IDS.join(", ")}`,
    });
  }
  if (!MODE_IDS.includes(rawMode)) {
    return res.status(400).json({
      error: `Mode invalide. Choisir : ${MODE_IDS.join(", ")}`,
    });
  }

  const theme = normalizeTheme(rawTheme);
  const mode = normalizeMode(rawMode);
  const db = readDb();
  db.theme = theme;
  db.mode = mode;
  writeDb(db);
  res.json({ theme: db.theme, mode: db.mode });
});

// Hash factice pour garder un temps de réponse constant (anti-énumération)
const DUMMY_HASH = bcrypt.hashSync(randomUUID(), 12);

app.post("/api/auth/login", loginLimiter, (req, res) => {
  const username = String(req.body?.username || "").trim().slice(0, 100);
  const password = String(req.body?.password || "").slice(0, 200);
  const db = readDb();
  const manager = db.manager;
  const validUser = Boolean(manager) && username === manager.username;
  // On compare toujours un hash pour ne pas révéler si l'utilisateur existe
  const validPass = bcrypt.compareSync(
    password,
    validUser ? manager.passwordHash : DUMMY_HASH,
  );
  if (!validUser || !validPass) {
    return res.status(401).json({ error: "Identifiants incorrects" });
  }
  const token = jwt.sign(
    { role: "manager", username: manager.username },
    JWT_SECRET,
    { expiresIn: "12h" },
  );
  res.json({ token, username: manager.username });
});

app.get("/api/auth/me", auth, (req, res) => {
  res.json({ username: req.user.username, role: req.user.role });
});

app.post("/api/devis", devisLimiter, upload.array("photos", 5), (req, res) => {
  try {
    const prenom = String(req.body?.prenom || "").trim().slice(0, 100);
    const name = String(req.body?.name || "").trim().slice(0, 100);
    const email = String(req.body?.email || "").trim().slice(0, 200);
    const phone = String(req.body?.phone || "").trim().slice(0, 30);
    const service = String(req.body?.service || "").trim().slice(0, 100);
    const message = String(req.body?.message || "").trim().slice(0, 3000);

    if (!prenom || !name || !email || !phone || !service) {
      return res.status(400).json({ error: "Champs obligatoires manquants" });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: "Adresse e-mail invalide" });
    }

    const photos = (req.files || []).map((f) => `/uploads/${f.filename}`);
    const devis = {
      id: randomUUID(),
      createdAt: new Date().toISOString(),
      prenom,
      name,
      email,
      phone,
      service,
      message,
      photos,
      status: "nouveau",
    };

    const db = readDb();
    db.devis = [devis, ...(db.devis || [])];
    writeDb(db);

    res.status(201).json({ ok: true, devis });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Impossible d’enregistrer le devis" });
  }
});

app.get("/api/devis", auth, (_req, res) => {
  const db = readDb();
  res.json({ devis: db.devis || [] });
});

app.patch("/api/devis/:id", auth, (req, res) => {
  const id = req.params.id;
  const status = String(req.body?.status || "").trim();
  const allowed = ["nouveau", "en_cours", "traite", "archive"];
  if (!allowed.includes(status)) {
    return res.status(400).json({ error: "Statut invalide" });
  }
  const db = readDb();
  const idx = (db.devis || []).findIndex((d) => d.id === id);
  if (idx < 0) return res.status(404).json({ error: "Devis introuvable" });
  db.devis[idx].status = status;
  db.devis[idx].updatedAt = new Date().toISOString();
  writeDb(db);
  res.json({ devis: db.devis[idx] });
});

app.delete("/api/devis/:id", auth, (req, res) => {
  const id = req.params.id;
  const db = readDb();
  const before = db.devis?.length || 0;
  const target = (db.devis || []).find((d) => d.id === id);
  db.devis = (db.devis || []).filter((d) => d.id !== id);
  if ((db.devis.length || 0) === before) {
    return res.status(404).json({ error: "Devis introuvable" });
  }
  if (target?.photos?.length) {
    for (const p of target.photos) {
      const file = path.join(UPLOAD_DIR, path.basename(p));
      if (fs.existsSync(file)) fs.unlinkSync(file);
    }
  }
  writeDb(db);
  res.json({ ok: true });
});

app.get("/api/avis", (_req, res) => {
  const db = readDb();
  const avis = ensureAvis(db);
  res.json({ avis });
});

app.post("/api/avis", avisLimiter, (req, res) => {
  const name = String(req.body?.name || "").trim();
  const message = String(req.body?.message || "").trim();
  const stars = Number(req.body?.stars);

  if (!name || name.length < 2) {
    return res.status(400).json({ error: "Indiquez votre nom" });
  }
  if (!Number.isInteger(stars) || stars < 1 || stars > 5) {
    return res.status(400).json({ error: "Choisissez une note de 1 à 5 étoiles" });
  }
  if (message.length > 800) {
    return res.status(400).json({ error: "Message trop long (800 caractères max)" });
  }
  if (name.length > 80) {
    return res.status(400).json({ error: "Nom trop long" });
  }

  const entry = {
    id: randomUUID(),
    name,
    message,
    stars,
    createdAt: new Date().toISOString(),
    source: "site",
  };

  const db = readDb();
  ensureAvis(db);
  db.avis = [entry, ...(db.avis || [])];
  writeDb(db);
  res.status(201).json({ ok: true, avis: entry });
});

app.delete("/api/avis/:id", auth, (req, res) => {
  const id = req.params.id;
  const db = readDb();
  ensureAvis(db);
  const before = db.avis.length;
  db.avis = db.avis.filter((a) => a.id !== id);
  if (db.avis.length === before) {
    return res.status(404).json({ error: "Avis introuvable" });
  }
  writeDb(db);
  res.json({ ok: true });
});

app.get("/api/pellicule", (_req, res) => {
  const db = readDb();
  res.json({ photos: publicPellicule(db) });
});

app.get("/api/pellicule/:id/image", (req, res) => {
  const db = readDb();
  ensurePellicule(db);
  const photo = (db.pellicule || []).find((p) => p.id === req.params.id);
  if (!photo) return res.status(404).json({ error: "Photo introuvable" });

  if (photo.data) {
    const buf = Buffer.from(photo.data, "base64");
    res.setHeader("Content-Type", photo.mime || "image/jpeg");
    res.setHeader("Cache-Control", "public, max-age=86400");
    return res.send(buf);
  }

  if (photo.src && String(photo.src).startsWith("/uploads/")) {
    const file = safeUploadPath(photo.src);
    if (file && fs.existsSync(file)) return res.sendFile(file);
  }
  return res.status(404).json({ error: "Fichier image manquant" });
});

app.post("/api/pellicule", auth, uploadPellicule.array("photos", 12), (req, res) => {
  try {
    const files = req.files || [];
    if (!files.length) {
      return res.status(400).json({ error: "Aucune image envoyée" });
    }
    const db = readDb();
    ensurePellicule(db);
    const created = [];

    for (const f of files) {
      const id = randomUUID();
      const buf = fs.readFileSync(f.path);
      if (buf.length > 2.5 * 1024 * 1024) {
        try {
          fs.unlinkSync(f.path);
        } catch {
          /* ignore */
        }
        return res.status(400).json({
          error: "Image trop lourde (max 2,5 Mo). Compressez-la puis réessayez.",
        });
      }
      const entry = {
        id,
        alt:
          String(req.body?.alt || "Photo atelier S AUTO").trim().slice(0, 200) ||
          "Photo atelier S AUTO",
        createdAt: new Date().toISOString(),
        mime: f.mimetype || "image/jpeg",
        data: buf.toString("base64"),
        src: `/api/pellicule/${id}/image`,
      };
      created.push(entry);
      try {
        fs.unlinkSync(f.path);
      } catch {
        /* ignore */
      }
    }

    db.pellicule = [...created, ...(db.pellicule || [])];
    writeDb(db);
    res.status(201).json({
      ok: true,
      photos: created.map(({ data, ...rest }) => rest),
      pellicule: publicPellicule(db),
    });
  } catch (err) {
    res.status(400).json({ error: err.message || "Upload impossible" });
  }
});

app.delete("/api/pellicule/:id", auth, (req, res) => {
  const id = req.params.id;
  const db = readDb();
  ensurePellicule(db);
  const target = db.pellicule.find((p) => p.id === id);
  if (!target) return res.status(404).json({ error: "Photo introuvable" });
  db.pellicule = db.pellicule.filter((p) => p.id !== id);
  writeDb(db);
  if (target.src && String(target.src).startsWith("/uploads/")) {
    const file = safeUploadPath(target.src);
    if (file && fs.existsSync(file)) {
      try {
        fs.unlinkSync(file);
      } catch {
        /* ignore */
      }
    }
  }
  res.json({ ok: true });
});

// Messages d'erreur sûrs à montrer (multer, CORS, validation) ; le reste
// est loggé côté serveur sans fuiter de détails internes.
const SAFE_ERRORS = [
  "Seules les images sont acceptées",
  "Origine non autorisée",
  "File too large",
  "Too many files",
];
app.use((err, _req, res, _next) => {
  console.error(err);
  const msg = String(err?.message || "");
  const safe = SAFE_ERRORS.some((s) => msg.includes(s));
  res.status(400).json({ error: safe ? msg : "Requête invalide" });
});

// Production : sert le site React (dossier dist/)
if (fs.existsSync(DIST_DIR)) {
  app.use(express.static(DIST_DIR, { index: false }));
  app.get(/^(?!\/api(?:\/|$)|\/uploads(?:\/|$)).*/, (req, res) => {
    res.sendFile(path.join(DIST_DIR, "index.html"));
  });
}

app.listen(PORT, "0.0.0.0", () => {
  console.log(`S AUTO → http://0.0.0.0:${PORT}`);
  console.log(`Gérant : ${MANAGER_USER} / (mot de passe .env ou défaut)`);
  if (fs.existsSync(DIST_DIR)) {
    console.log("Frontend dist/ servi en production");
  }
});

// Sous concurrently (Windows), stdin non-TTY peut fermer le process trop tôt
if (!process.stdin.isTTY) {
  process.stdin.resume();
}
