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
const JWT_SECRET = process.env.JWT_SECRET || "s-auto-dev-secret-change-me";
const MANAGER_USER = process.env.MANAGER_USER || "gerant";
const MANAGER_PASSWORD = process.env.MANAGER_PASSWORD || "Sauto2026!";

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
      const file = path.join(UPLOAD_DIR, String(p.src).replace(/^\/uploads\//, ""));
      return fs.existsSync(file);
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

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const safe = file.originalname.replace(/[^\w.\-]+/g, "_");
    cb(null, `${Date.now()}-${randomUUID().slice(0, 8)}-${safe}`);
  },
});

const pelliculeStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, PELLICULE_DIR),
  filename: (_req, file, cb) => {
    const safe = file.originalname.replace(/[^\w.\-]+/g, "_");
    cb(null, `${Date.now()}-${randomUUID().slice(0, 8)}-${safe}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 6 * 1024 * 1024, files: 6 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith("image/")) cb(null, true);
    else cb(new Error("Seules les images sont acceptées"));
  },
});

const uploadPellicule = multer({
  storage: pelliculeStorage,
  limits: { fileSize: 8 * 1024 * 1024, files: 12 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith("image/")) cb(null, true);
    else cb(new Error("Seules les images sont acceptées"));
  },
});

const app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" }));
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
  if (!Array.isArray(hours) || hours.length === 0) {
    return res.status(400).json({ error: "Horaires invalides" });
  }
  const cleaned = hours.map((h) => ({
    day: String(h.day || "").trim(),
    time: String(h.time || "").trim(),
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

app.post("/api/auth/login", (req, res) => {
  const username = String(req.body?.username || "").trim();
  const password = String(req.body?.password || "");
  const db = readDb();
  const manager = db.manager;
  if (!manager || username !== manager.username) {
    return res.status(401).json({ error: "Identifiants incorrects" });
  }
  if (!bcrypt.compareSync(password, manager.passwordHash)) {
    return res.status(401).json({ error: "Identifiants incorrects" });
  }
  const token = jwt.sign(
    { role: "manager", username: manager.username },
    JWT_SECRET,
    { expiresIn: "7d" },
  );
  res.json({ token, username: manager.username });
});

app.get("/api/auth/me", auth, (req, res) => {
  res.json({ username: req.user.username, role: req.user.role });
});

app.post("/api/devis", upload.array("photos", 5), (req, res) => {
  try {
    const prenom = String(req.body?.prenom || "").trim();
    const name = String(req.body?.name || "").trim();
    const email = String(req.body?.email || "").trim();
    const phone = String(req.body?.phone || "").trim();
    const service = String(req.body?.service || "").trim();
    const message = String(req.body?.message || "").trim();

    if (!prenom || !name || !email || !phone || !service) {
      return res.status(400).json({ error: "Champs obligatoires manquants" });
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

app.post("/api/avis", (req, res) => {
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
    const file = path.join(
      UPLOAD_DIR,
      String(photo.src).replace(/^\/uploads\//, ""),
    );
    if (fs.existsSync(file)) return res.sendFile(file);
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
          String(req.body?.alt || "Photo atelier S AUTO").trim() ||
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
    const file = path.join(
      UPLOAD_DIR,
      String(target.src).replace(/^\/uploads\//, ""),
    );
    if (fs.existsSync(file)) {
      try {
        fs.unlinkSync(file);
      } catch {
        /* ignore */
      }
    }
  }
  res.json({ ok: true });
});

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(400).json({ error: err.message || "Erreur" });
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
