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

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

function readDb() {
  if (!fs.existsSync(DB_PATH)) {
    const passwordHash = bcrypt.hashSync(MANAGER_PASSWORD, 10);
    const initial = {
      hours: DEFAULT_HOURS,
      devis: [],
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

const upload = multer({
  storage,
  limits: { fileSize: 6 * 1024 * 1024, files: 6 },
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
