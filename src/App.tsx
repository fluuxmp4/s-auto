import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type RefObject,
} from "react";
import { jsPDF } from "jspdf";
import {
  applyTheme,
  fetchAvis,
  fetchHours,
  fetchPellicule,
  fetchTheme,
  submitAvis,
  submitDevis,
  type AvisItem,
  type HourRow,
  type PelliculePhoto,
} from "./api";
import "./App.css";

const PHONE = "09 88 08 18 53";
const PHONE_TEL = "+33988081853";
/** Boîte atelier (affichable / mailto public) */
const CONTACT_EMAIL = "69ssauto@gmail.com";
/** Réception technique FormSubmit — ne pas afficher sur le site */
const FORM_INBOX = "enzollahona@gmail.com";
const ADDRESS = "14 Chem. de Chapoly-Laval, 69230 Saint-Genis-Laval";
const MAX_PHOTOS = 5;
const MAX_PHOTO_BYTES = 4 * 1024 * 1024;
const MAX_TOTAL_BYTES = 9 * 1024 * 1024;
const SENDER_NAME = "Devis site sauto";
const MAX_PDF_BYTES = 4.5 * 1024 * 1024;
const MAX_ATTACH_BYTES = 900 * 1024;

async function fileToJpegDataUrl(
  file: File,
  maxSide = 1000,
  quality = 0.68,
): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas indisponible");
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  return canvas.toDataURL("image/jpeg", quality);
}

async function dataUrlToFile(dataUrl: string, filename: string): Promise<File> {
  const res = await fetch(dataUrl);
  const blob = await res.blob();
  return new File([blob], filename, { type: "image/jpeg" });
}

async function compressPhotos(files: File[]): Promise<File[]> {
  const out: File[] = [];
  for (let i = 0; i < files.length; i++) {
    let quality = 0.68;
    let maxSide = 1000;
    let file = await dataUrlToFile(
      await fileToJpegDataUrl(files[i], maxSide, quality),
      `photo-${i + 1}.jpg`,
    );
    while (file.size > MAX_ATTACH_BYTES && quality > 0.4) {
      quality -= 0.1;
      maxSide = Math.max(640, maxSide - 120);
      file = await dataUrlToFile(
        await fileToJpegDataUrl(files[i], maxSide, quality),
        `photo-${i + 1}.jpg`,
      );
    }
    out.push(file);
  }
  return out;
}

/** Héberge un fichier temporairement pour un lien direct */
async function uploadTempFile(file: File): Promise<string | null> {
  try {
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch("https://tmpfiles.org/api/v1/upload", {
      method: "POST",
      body: fd,
    });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      data?: { url?: string };
    };
    const url = json.data?.url;
    if (!url) return null;
    return url.replace("tmpfiles.org/", "tmpfiles.org/dl/");
  } catch {
    return null;
  }
}

async function buildDevisHtml(input: {
  prenom: string;
  name: string;
  email: string;
  phone: string;
  service: string;
  message: string;
  photoFiles: File[];
  photoUrls: string[];
}): Promise<File> {
  const dateLabel = new Date().toLocaleString("fr-FR", {
    dateStyle: "long",
    timeStyle: "short",
  });
  const ref = `SA-${Date.now().toString().slice(-8)}`;
  const fullName = `${input.prenom} ${input.name}`.trim();

  const photoCards: string[] = [];
  for (let i = 0; i < input.photoFiles.length; i++) {
    const dataUrl = await fileToJpegDataUrl(input.photoFiles[i], 880, 0.64);
    const openLink = input.photoUrls[i]
      ? `<a class="photo-link" href="${input.photoUrls[i]}" target="_blank" rel="noopener">Agrandir</a>`
      : "";
    photoCards.push(`
      <div class="photo-card">
        <div class="photo-frame">
          <img src="${dataUrl}" alt="Photo dommage ${i + 1}" />
        </div>
        <div class="photo-meta">
          <span>Photo ${i + 1}</span>
          ${openLink}
        </div>
      </div>`);
  }

  const photosSection = photoCards.length
    ? `<section class="section">
        <div class="section-head">
          <h2>Photos des dommages</h2>
          <span class="count">${photoCards.length} fichier${photoCards.length > 1 ? "s" : ""}</span>
        </div>
        <div class="photo-grid">${photoCards.join("")}</div>
      </section>`
    : `<section class="section">
        <div class="empty">Aucune photo jointe à cette demande.</div>
      </section>`;

  const phoneHref = input.phone.replace(/\s+/g, "");
  const msg = escapeHtml(input.message.trim() || "Aucun message complémentaire.");

  const html = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Devis S AUTO — ${escapeHtml(fullName)}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=Sora:wght@300;400;500;600&display=swap" rel="stylesheet" />
  <style>
    :root {
      --brand: #0066c8;
      --brand-deep: #004a96;
      --accent: #d4001a;
      --ink: #0c1222;
      --muted: #5c677a;
      --line: #e4e9f1;
      --bg: #eef2f7;
      --card: #ffffff;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: "Sora", system-ui, sans-serif;
      color: var(--ink);
      background:
        radial-gradient(ellipse 80% 50% at 100% 0%, rgba(0,102,200,.12), transparent),
        linear-gradient(180deg, #e8eef6 0%, var(--bg) 40%, #e7ebf2 100%);
      line-height: 1.55;
      -webkit-font-smoothing: antialiased;
    }
    .wrap {
      width: min(720px, calc(100% - 1.5rem));
      margin: 1.5rem auto 2.5rem;
    }
    .card {
      background: var(--card);
      border-radius: 18px;
      overflow: hidden;
      box-shadow:
        0 1px 0 rgba(255,255,255,.7) inset,
        0 18px 50px rgba(12,18,34,.1);
    }
    .hero {
      background: linear-gradient(135deg, #0a1a3a 0%, #123066 48%, var(--brand) 100%);
      color: #fff;
      padding: 1.75rem 1.5rem 1.5rem;
      position: relative;
    }
    .hero::after {
      content: "";
      position: absolute;
      right: -40px;
      top: -40px;
      width: 160px;
      height: 160px;
      border-radius: 50%;
      background: rgba(255,255,255,.08);
    }
    .brand {
      font-family: "Syne", sans-serif;
      font-weight: 800;
      font-size: 1.55rem;
      letter-spacing: -0.03em;
      margin: 0 0 .35rem;
    }
    .brand span { color: #7eb6ff; }
    .eyebrow {
      display: inline-flex;
      align-items: center;
      gap: .4rem;
      font-size: .72rem;
      font-weight: 600;
      letter-spacing: .12em;
      text-transform: uppercase;
      color: rgba(255,255,255,.75);
      margin-bottom: .85rem;
    }
    .eyebrow i {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: #3dde8a;
      display: inline-block;
    }
    .hero h1 {
      font-family: "Syne", sans-serif;
      font-size: clamp(1.35rem, 4vw, 1.75rem);
      font-weight: 700;
      letter-spacing: -0.03em;
      margin: 0 0 .55rem;
      line-height: 1.15;
      max-width: 16ch;
    }
    .hero-sub {
      margin: 0;
      color: rgba(255,255,255,.78);
      font-weight: 300;
      font-size: .92rem;
    }
    .meta-bar {
      display: flex;
      flex-wrap: wrap;
      gap: .6rem;
      padding: 1rem 1.5rem;
      background: #f7f9fc;
      border-bottom: 1px solid var(--line);
    }
    .chip {
      display: inline-flex;
      align-items: center;
      gap: .35rem;
      padding: .4rem .7rem;
      border-radius: 999px;
      background: #fff;
      border: 1px solid var(--line);
      font-size: .78rem;
      font-weight: 500;
      color: var(--muted);
    }
    .chip strong { color: var(--ink); font-weight: 600; }
    .chip--accent {
      background: rgba(212,0,26,.08);
      border-color: rgba(212,0,26,.2);
      color: var(--accent);
    }
    .body { padding: 1.35rem 1.5rem 1.6rem; }
    .section { margin-top: 1.35rem; }
    .section:first-child { margin-top: 0; }
    .section-head {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: 1rem;
      margin-bottom: .85rem;
    }
    .section-head h2 {
      font-family: "Syne", sans-serif;
      font-size: 1.05rem;
      letter-spacing: -0.02em;
      margin: 0;
    }
    .count {
      font-size: .75rem;
      color: var(--muted);
      font-weight: 500;
    }
    .info-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: .75rem;
    }
    @media (max-width: 560px) {
      .info-grid { grid-template-columns: 1fr; }
    }
    .info {
      padding: .9rem 1rem;
      border: 1px solid var(--line);
      border-radius: 12px;
      background: linear-gradient(180deg, #fff, #fbfcfe);
    }
    .info label {
      display: block;
      font-size: .68rem;
      font-weight: 600;
      letter-spacing: .1em;
      text-transform: uppercase;
      color: var(--brand);
      margin-bottom: .3rem;
    }
    .info p {
      margin: 0;
      font-size: .98rem;
      font-weight: 500;
      letter-spacing: -0.01em;
      word-break: break-word;
    }
    .info a { color: var(--ink); text-decoration: none; }
    .info a:hover { color: var(--brand); }
    .message {
      padding: 1rem 1.1rem;
      border-radius: 12px;
      background: #f4f7fb;
      border-left: 3px solid var(--brand);
      white-space: pre-wrap;
      font-weight: 400;
      color: #243044;
      font-size: .95rem;
    }
    .photo-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
      gap: .85rem;
    }
    .photo-card {
      border: 1px solid var(--line);
      border-radius: 14px;
      overflow: hidden;
      background: #fff;
    }
    .photo-frame {
      aspect-ratio: 4/3;
      background: #dbe3ee;
      overflow: hidden;
    }
    .photo-frame img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
    }
    .photo-meta {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: .55rem .75rem;
      font-size: .8rem;
      font-weight: 500;
      color: var(--muted);
    }
    .photo-link {
      color: var(--brand);
      text-decoration: none;
      font-weight: 600;
    }
    .photo-link:hover { text-decoration: underline; }
    .cta-row {
      display: flex;
      flex-wrap: wrap;
      gap: .65rem;
      margin-top: 1.4rem;
    }
    .btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: .85rem 1.15rem;
      border-radius: 10px;
      font-weight: 600;
      font-size: .9rem;
      text-decoration: none;
      transition: transform .15s ease, background .15s ease;
    }
    .btn:hover { transform: translateY(-1px); }
    .btn-primary {
      background: var(--brand);
      color: #fff;
    }
    .btn-primary:hover { background: var(--brand-deep); }
    .btn-ghost {
      background: #fff;
      color: var(--ink);
      border: 1px solid var(--line);
    }
    .footer {
      padding: 1rem 1.5rem 1.25rem;
      border-top: 1px solid var(--line);
      color: var(--muted);
      font-size: .8rem;
      font-weight: 300;
    }
    .footer strong { color: var(--ink); font-weight: 600; }
    .empty {
      padding: 1.1rem;
      border-radius: 12px;
      border: 1px dashed var(--line);
      color: var(--muted);
      text-align: center;
      font-size: .9rem;
    }
  </style>
</head>
<body>
  <div class="wrap">
    <article class="card">
      <header class="hero">
        <p class="eyebrow"><i></i> Nouvelle demande</p>
        <p class="brand">S <span>AUTO</span></p>
        <h1>Demande de devis</h1>
        <p class="hero-sub">Carrosserie · Peinture · Pare-brise — reçue depuis le site</p>
      </header>

      <div class="meta-bar">
        <span class="chip">Réf. <strong>${ref}</strong></span>
        <span class="chip">${escapeHtml(dateLabel)}</span>
        <span class="chip chip--accent">${escapeHtml(input.service)}</span>
      </div>

      <div class="body">
        <section class="section">
          <div class="section-head"><h2>Client</h2></div>
          <div class="info-grid">
            <div class="info">
              <label>Prénom</label>
              <p>${escapeHtml(input.prenom)}</p>
            </div>
            <div class="info">
              <label>Nom</label>
              <p>${escapeHtml(input.name)}</p>
            </div>
            <div class="info">
              <label>E-mail</label>
              <p><a href="mailto:${escapeHtml(input.email)}">${escapeHtml(input.email)}</a></p>
            </div>
            <div class="info">
              <label>Téléphone</label>
              <p><a href="tel:${escapeHtml(phoneHref)}">${escapeHtml(input.phone)}</a></p>
            </div>
            <div class="info">
              <label>Prestation</label>
              <p>${escapeHtml(input.service)}</p>
            </div>
            <div class="info">
              <label>Photos</label>
              <p>${input.photoFiles.length} jointe${input.photoFiles.length > 1 ? "s" : ""}</p>
            </div>
          </div>
        </section>

        <section class="section">
          <div class="section-head"><h2>Message</h2></div>
          <div class="message">${msg}</div>
        </section>

        ${photosSection}

        <div class="cta-row">
          <a class="btn btn-primary" href="tel:${escapeHtml(phoneHref)}">Appeler le client</a>
          <a class="btn btn-ghost" href="sms:${escapeHtml(phoneHref)}">Envoyer un SMS</a>
        </div>
      </div>

      <footer class="footer">
        <strong>S AUTO</strong> — ${escapeHtml(ADDRESS)}<br />
        Document généré automatiquement par le site vitrine.
      </footer>
    </article>
  </div>
</body>
</html>`;

  return new File([html], `devis-sauto-${ref}.html`, { type: "text/html" });
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function buildDevisPdf(input: {
  prenom: string;
  name: string;
  email: string;
  phone: string;
  service: string;
  message: string;
  photos: File[];
}): Promise<File> {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 16;
  let y = 20;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text("S AUTO — Demande de devis", margin, y);
  y += 8;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(80);
  doc.text("Envoye depuis le site web", margin, y);
  y += 12;
  doc.setTextColor(0);

  const lines = [
    `Date : ${new Date().toLocaleString("fr-FR")}`,
    `Prenom : ${input.prenom}`,
    `Nom : ${input.name}`,
    `Email : ${input.email}`,
    `Telephone : ${input.phone}`,
    `Prestation : ${input.service}`,
    `Photos : ${input.photos.length}`,
  ];

  doc.setFontSize(12);
  for (const line of lines) {
    doc.text(line, margin, y);
    y += 7;
  }

  y += 4;
  doc.setFont("helvetica", "bold");
  doc.text("Message", margin, y);
  y += 7;
  doc.setFont("helvetica", "normal");
  const message =
    input.message.trim() || "(Aucun message complementaire)";
  const wrapped = doc.splitTextToSize(message, pageW - margin * 2);
  doc.text(wrapped, margin, y);
  y += wrapped.length * 6 + 10;

  for (let i = 0; i < input.photos.length; i++) {
    const dataUrl = await fileToJpegDataUrl(input.photos[i], 1100, 0.7);
    const props = doc.getImageProperties(dataUrl);
    const maxW = pageW - margin * 2;
    const maxH = 90;
    let imgW = maxW;
    let imgH = (props.height * imgW) / props.width;
    if (imgH > maxH) {
      imgH = maxH;
      imgW = (props.width * imgH) / props.height;
    }

    if (y + imgH + 14 > doc.internal.pageSize.getHeight() - margin) {
      doc.addPage();
      y = 20;
    }

    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text(`Photo ${i + 1}`, margin, y);
    y += 5;
    doc.addImage(dataUrl, "JPEG", margin, y, imgW, imgH);
    y += imgH + 12;
  }

  const blob = doc.output("blob");
  const safeName = `${input.prenom}-${input.name}`
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  return new File(
    [blob],
    `devis-sauto-${safeName || "client"}-${Date.now()}.pdf`,
    { type: "application/pdf" },
  );
}

const MAPS_URL =
  "https://www.google.com/maps/search/?api=1&query=S+AUTO+Carrosserie+14+Chemin+de+Chapoly-Laval+69230+Saint-Genis-Laval";
const MAPS_EMBED =
  "https://maps.google.com/maps?q=14%20Chem.%20de%20Chapoly-Laval%2C%2069230%20Saint-Genis-Laval&t=&z=15&ie=UTF8&iwloc=&output=embed";

const SERVICES = [
  {
    num: "01",
    name: "Carrosserie",
    desc: "Réparation de bosses, rayures, chocs et éléments déformés. Remise en état soignée pour tous types de véhicules — particuliers, utilitaires et SUV.",
  },
  {
    num: "02",
    name: "Peinture",
    desc: "Peinture automobile au teintomètre, finitions laquées et retouches invisibles. Résultat homogène, fidèle à la teinte d’origine.",
  },
  {
    num: "03",
    name: "Pare-brise & vitrage",
    desc: "Réparation d’impacts et remplacement de pare-brise, vitres latérales et lunettes arrière. Intervention rapide, toutes marques.",
  },
  {
    num: "04",
    name: "Assurances & sinistres",
    desc: "Prise en charge des démarches de déclaration sinistre. Nous travaillons avec toutes les assurances pour simplifier votre dossier.",
  },
];

const ATOUTS = [
  {
    title: "Devis rapide sur photos",
    text: "Envoyez vos photos, recevez une estimation claire sans déplacement inutile.",
  },
  {
    title: "Travail soigné, délais tenus",
    text: "Atelier indépendant à taille humaine : suivi personnalisé et dates de restitution respectées.",
  },
  {
    title: "Véhicule de courtoisie",
    text: "Restez mobile pendant les réparations grâce à notre véhicule de courtoisie (selon disponibilité).",
  },
];

const STEPS = [
  {
    title: "Contact",
    text: "Appelez-nous ou envoyez votre demande avec photos du véhicule.",
  },
  {
    title: "Devis",
    text: "Nous établissons un devis détaillé, compatible avec votre assurance.",
  },
  {
    title: "Réparation",
    text: "Carrosserie, peinture ou vitrage — intervention en atelier à Saint-Genis-Laval.",
  },
  {
    title: "Restitution",
    text: "Contrôle qualité et remise des clés. Votre véhicule comme neuf.",
  },
];

const DEFAULT_REVIEWS: AvisItem[] = [
  {
    id: "seed-1",
    name: "Client Google",
    message:
      "Mon véhicule a été réparé rapidement et avec un résultat impeccable.",
    stars: 5,
    createdAt: "2024-01-01T10:00:00.000Z",
  },
  {
    id: "seed-2",
    name: "Région lyonnaise",
    message:
      "Accueil pro, devis clair et finition nickel. Je recommande pour la carrosserie et le pare-brise.",
    stars: 5,
    createdAt: "2024-03-01T10:00:00.000Z",
  },
  {
    id: "seed-3",
    name: "Client satisfait",
    message:
      "Prise en charge assurance sans stress, délais respectés. Atelier sérieux à Saint-Genis-Laval.",
    stars: 5,
    createdAt: "2024-06-01T10:00:00.000Z",
  },
];

function starsLabel(n: number) {
  return "★".repeat(n) + "☆".repeat(Math.max(0, 5 - n));
}

const DEFAULT_HOURS: HourRow[] = [
  { day: "Lundi", time: "8h30 – 12h / 13h30 – 19h" },
  { day: "Mardi", time: "8h30 – 12h / 13h30 – 19h" },
  { day: "Mercredi", time: "8h30 – 12h / 13h30 – 19h" },
  { day: "Jeudi", time: "8h30 – 12h / 13h30 – 19h" },
  { day: "Vendredi", time: "8h30 – 12h / 13h30 – 19h" },
  { day: "Samedi", time: "8h30 – 12h / 13h30 – 19h" },
  { day: "Dimanche", time: "Fermé" },
];

function useReveal(): RefObject<HTMLDivElement | null> {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const targets = el.querySelectorAll(".reveal, .atout");
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            io.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.15, rootMargin: "0px 0px -40px 0px" },
    );

    targets.forEach((t) => io.observe(t));
    return () => io.disconnect();
  }, []);

  return ref;
}

function PhoneIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M7.5 3.5h3l1.2 4.2-2 1.2a12.5 12.5 0 0 0 5.4 5.4l1.2-2 4.2 1.2v3c0 .8-.5 1.5-1.3 1.6A15.5 15.5 0 0 1 3.9 5.8c.1-.8.8-1.3 1.6-1.3Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function App() {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [formStatus, setFormStatus] = useState<
    "idle" | "loading" | "sent" | "error"
  >("idle");
  const [photos, setPhotos] = useState<File[]>([]);
  const [photoPreviews, setPhotoPreviews] = useState<string[]>([]);
  const [photoError, setPhotoError] = useState("");
  const [hours, setHours] = useState<HourRow[]>(DEFAULT_HOURS);
  const [reviews, setReviews] = useState<AvisItem[]>(DEFAULT_REVIEWS);
  const [avisOpen, setAvisOpen] = useState(false);
  const [avisName, setAvisName] = useState("");
  const [avisMessage, setAvisMessage] = useState("");
  const [avisStars, setAvisStars] = useState(0);
  const [avisHover, setAvisHover] = useState(0);
  const [avisStatus, setAvisStatus] = useState<
    "idle" | "loading" | "sent" | "error"
  >("idle");
  const [avisError, setAvisError] = useState("");
  const [pellicule, setPellicule] = useState<PelliculePhoto[]>([]);
  const [lightbox, setLightbox] = useState<PelliculePhoto | null>(null);
  const pageRef = useReveal();

  const avisAverage = useMemo(() => {
    if (!reviews.length) return 5;
    const sum = reviews.reduce((acc, r) => acc + (r.stars || 0), 0);
    return Math.round((sum / reviews.length) * 10) / 10;
  }, [reviews]);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    document.body.style.overflow = menuOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [menuOpen]);

  useEffect(() => {
    fetchHours()
      .then((res) => {
        if (res.hours?.length) setHours(res.hours);
      })
      .catch(() => {
        /* garde les horaires par défaut si l’API est down */
      });
  }, []);

  useEffect(() => {
    fetchTheme()
      .then((res) => {
        applyTheme(res.theme || "classique", res.mode || "clair");
      })
      .catch(() => {
        applyTheme("classique", "clair");
      });
  }, []);

  useEffect(() => {
    fetchAvis()
      .then((res) => {
        if (res.avis?.length) setReviews(res.avis);
      })
      .catch(() => {
        /* garde les avis par défaut */
      });
  }, []);

  useEffect(() => {
    fetchPellicule()
      .then((res) => {
        if (res.photos?.length) setPellicule(res.photos);
      })
      .catch(() => {
        /* galerie vide si API down */
      });
  }, []);

  useEffect(() => {
    if (!lightbox) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setLightbox(null);
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = menuOpen ? "hidden" : "";
    };
  }, [lightbox, menuOpen]);

  function closeMenu() {
    setMenuOpen(false);
  }

  async function handleAvisSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setAvisError("");
    if (avisStars < 1 || avisStars > 5) {
      setAvisError("Choisissez une note de 1 à 5 étoiles.");
      return;
    }
    const name = avisName.trim();
    if (name.length < 2) {
      setAvisError("Indiquez votre nom.");
      return;
    }
    setAvisStatus("loading");
    try {
      const res = await submitAvis({
        name,
        message: avisMessage.trim(),
        stars: avisStars,
      });
      setReviews((prev) => [res.avis, ...prev]);
      setAvisName("");
      setAvisMessage("");
      setAvisStars(0);
      setAvisStatus("sent");
      setAvisOpen(false);
    } catch (err) {
      setAvisStatus("error");
      setAvisError(
        err instanceof Error ? err.message : "Envoi impossible, réessayez.",
      );
    }
  }

  function clearPhotos() {
    setPhotoPreviews((prev) => {
      prev.forEach((url) => URL.revokeObjectURL(url));
      return [];
    });
    setPhotos([]);
    setPhotoError("");
  }

  function handlePhotosChange(e: ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(e.target.files || []);
    e.target.value = "";
    if (!selected.length) return;

    const next = [...photos];
    let err = "";

    for (const file of selected) {
      if (!file.type.startsWith("image/")) {
        err = "Seules les images sont acceptées (JPG, PNG, HEIC…).";
        continue;
      }
      if (file.size > MAX_PHOTO_BYTES) {
        err = "Chaque photo doit faire moins de 4 Mo.";
        continue;
      }
      if (next.length >= MAX_PHOTOS) {
        err = `Maximum ${MAX_PHOTOS} photos par demande.`;
        break;
      }
      const total =
        next.reduce((sum, f) => sum + f.size, 0) + file.size;
      if (total > MAX_TOTAL_BYTES) {
        err = "Le poids total des photos dépasse 9 Mo.";
        break;
      }
      next.push(file);
    }

    setPhotoError(err);
    setPhotoPreviews((prev) => {
      prev.forEach((url) => URL.revokeObjectURL(url));
      return next.map((f) => URL.createObjectURL(f));
    });
    setPhotos(next);
  }

  function removePhoto(index: number) {
    const next = photos.filter((_, i) => i !== index);
    setPhotoPreviews((prev) => {
      URL.revokeObjectURL(prev[index]);
      return prev.filter((_, i) => i !== index);
    });
    setPhotos(next);
    setPhotoError("");
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    const prenom = String(data.get("prenom") || "");
    const name = String(data.get("name") || "");
    const email = String(data.get("email") || "");
    const phone = String(data.get("phone") || "");
    const service = String(data.get("service") || "");
    const message = String(data.get("message") || "");
    const subject = `Devis site S AUTO — ${service} — ${prenom} ${name}`;

    setFormStatus("loading");

    try {
      const jpegPhotos = await compressPhotos(photos);

      // 1) Enregistrement direct dans le panel gérant
      await submitDevis({
        prenom,
        name,
        email,
        phone,
        service,
        message,
        photos: jpegPhotos,
      });

      setFormStatus("sent");
      form.reset();
      clearPhotos();

      // 2) E-mail en arrière-plan (ne bloque pas le panel)
      void (async () => {
        try {
          const photoUrls = (
            await Promise.all(jpegPhotos.map((f) => uploadTempFile(f)))
          ).map((u) => u || "");
          const pdf = await buildDevisPdf({
            prenom,
            name,
            email,
            phone,
            service,
            message,
            photos: jpegPhotos,
          });
          const htmlDoc = await buildDevisHtml({
            prenom,
            name,
            email,
            phone,
            service,
            message,
            photoFiles: jpegPhotos,
            photoUrls,
          });
          const devisOnlineUrl = await uploadTempFile(htmlDoc);
          const urlLines = photoUrls
            .map((u, i) => (u ? `  • Photo ${i + 1} : ${u}` : null))
            .filter(Boolean);
          const bodyText = [
            "━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
            "  S AUTO  ·  Nouvelle demande de devis",
            "━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
            "",
            devisOnlineUrl
              ? `✨ Voir le devis moderne :\n${devisOnlineUrl}\n`
              : "",
            "CLIENT",
            `  Prénom     : ${prenom}`,
            `  Nom        : ${name}`,
            `  E-mail     : ${email}`,
            `  Téléphone  : ${phone}`,
            `  Prestation : ${service}`,
            `  Photos     : ${jpegPhotos.length}`,
            "",
            "MESSAGE",
            `  ${message || "(aucun)"}`,
            "",
            urlLines.length
              ? ["PHOTOS (liens directs)", ...urlLines, ""].join("\n")
              : "",
            "Aussi disponible dans le panel gérant /admin",
            "━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
          ]
            .filter(Boolean)
            .join("\n");

          const payload = new FormData();
          payload.append("name", SENDER_NAME);
          payload.append("Prenom_client", prenom);
          payload.append("Nom_client", name);
          payload.append("Email_client", email);
          payload.append("Telephone", phone);
          payload.append("Prestation", service);
          if (devisOnlineUrl) payload.append("Devis_moderne", devisOnlineUrl);
          payload.append("message", bodyText);
          payload.append("_subject", subject);
          payload.append("_template", "box");
          payload.append("_captcha", "false");
          payload.append("_cc", CONTACT_EMAIL);
          jpegPhotos.forEach((file, i) => {
            payload.append(i === 0 ? "attachment" : `attachment${i + 1}`, file);
          });
          payload.append(`attachment${jpegPhotos.length + 1}`, htmlDoc);
          if (pdf.size <= MAX_PDF_BYTES) {
            payload.append(`attachment${jpegPhotos.length + 2}`, pdf);
          }

          await fetch(`https://formsubmit.co/ajax/${FORM_INBOX}`, {
            method: "POST",
            headers: { Accept: "application/json" },
            body: payload,
          });
        } catch {
          /* e-mail optionnel */
        }
      })();
    } catch {
      setFormStatus("error");
    }
  }

  const navClass = [
    "nav",
    scrolled || menuOpen ? "is-scrolled" : "",
    menuOpen ? "is-open" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div ref={pageRef}>
      <header className={navClass}>
        <div className="nav__inner">
          <a href="#top" className="nav__logo" onClick={closeMenu}>
            <img
              src="/logo.png"
              alt="S AUTO — Carrosserie & Pare-Brise"
              width={120}
              height={140}
            />
          </a>

          <nav className="nav__links" aria-label="Navigation principale">
            <a href="#services">Services</a>
            <a href="#atelier">L’atelier</a>
            <a href="#pellicule">Pellicule</a>
            <a href="#avis">Avis</a>
            <a href="#devis">Devis</a>
          </nav>

          <button
            type="button"
            className="nav__toggle"
            aria-label={menuOpen ? "Fermer le menu" : "Ouvrir le menu"}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((v) => !v)}
          >
            <span />
            <span />
            <span />
          </button>

          <a className="nav__phone" href={`tel:${PHONE_TEL}`}>
            <PhoneIcon />
            {PHONE}
          </a>
        </div>

        <div className="nav__drawer">
          <a href="#services" onClick={closeMenu}>
            Services
          </a>
          <a href="#atelier" onClick={closeMenu}>
            L’atelier
          </a>
          <a href="#pellicule" onClick={closeMenu}>
            Pellicule
          </a>
          <a href="#avis" onClick={closeMenu}>
            Avis
          </a>
          <a href="#devis" onClick={closeMenu}>
            Devis
          </a>
        </div>
      </header>

      <main id="top">
        <section className="hero" aria-label="Accueil">
          <div className="hero__media">
            <img
              src="/hero.png"
              alt="Véhicule en atelier — carrosserie et finition"
              width={2400}
              height={1600}
              fetchPriority="high"
            />
          </div>
          <div className="hero__content">
            <p className="hero__brand">
              <img
                src="/logo.png"
                alt="S AUTO — Carrosserie & Pare-Brise"
                width={760}
                height={900}
              />
            </p>
            <h1 className="hero__headline">
              Carrosserie & pare-brise à Saint-Genis-Laval
            </h1>
            <p className="hero__lead">
              Atelier indépendant : carrosserie, peinture et vitrage — toutes
              marques, toutes assurances. Clients de Lyon et sa région.
            </p>
            <div className="hero__actions">
              <a className="btn btn--primary" href={`tel:${PHONE_TEL}`}>
                Appeler le {PHONE}
              </a>
              <a className="btn btn--ghost" href="#devis">
                Demander un devis
              </a>
            </div>
          </div>
        </section>

        <section id="services" className="section services">
          <div className="container">
            <div className="section__head reveal">
              <p className="section__label">Prestations</p>
              <h2 className="section__title">
                Tout pour remettre votre véhicule en état
              </h2>
              <p className="section__text">
                Spécialistes carrosserie, peinture et remplacement de vitrage
                automobile. Intervention sur voitures, utilitaires et SUV.
              </p>
            </div>

            <div className="services__grid">
              {SERVICES.map((s) => (
                <article key={s.num} className="service reveal">
                  <span className="service__num">{s.num}</span>
                  <div>
                    <h3 className="service__name">{s.name}</h3>
                  </div>
                  <p className="service__desc">{s.desc}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="atelier" className="section atouts">
          <div className="container">
            <div className="section__head reveal">
              <p className="section__label">Pourquoi S AUTO</p>
              <h2 className="section__title">
                Un atelier de confiance près de Lyon
              </h2>
              <p className="section__text">
                Depuis 2023, nous accompagnons particuliers et professionnels
                avec un service clair, réactif et exigeant sur la finition.
              </p>
            </div>

            <div className="atouts__grid">
              {ATOUTS.map((a) => (
                <article key={a.title} className="atout reveal">
                  <div className="atout__line" />
                  <h3>{a.title}</h3>
                  <p>{a.text}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="section process">
          <div className="container">
            <div className="section__head reveal">
              <p className="section__label">Déroulement</p>
              <h2 className="section__title">De la prise de contact à la clé</h2>
              <p className="section__text">
                Un parcours simple, sans surprise — de la photo au véhicule
                restitué.
              </p>
            </div>

            <ol className="process__steps">
              {STEPS.map((s) => (
                <li key={s.title} className="step reveal">
                  <h3>{s.title}</h3>
                  <p>{s.text}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section id="pellicule" className="section pellicule">
          <div className="container">
            <div className="section__head reveal">
              <p className="section__label">Pellicule</p>
              <h2 className="section__title">L’atelier en images</h2>
              <p className="section__text">
                Photos de l’atelier S AUTO — carrosserie, peinture et vitrage à
                Saint-Genis-Laval.
              </p>
            </div>

            {pellicule.length > 0 ? (
              <div className="film-strip reveal" role="list">
                {pellicule.map((photo) => (
                  <button
                    key={photo.id}
                    type="button"
                    className="film-strip__frame"
                    role="listitem"
                    onClick={() => setLightbox(photo)}
                    aria-label={`Agrandir : ${photo.alt}`}
                  >
                    <img src={photo.src} alt={photo.alt} loading="lazy" />
                  </button>
                ))}
              </div>
            ) : (
              <p className="pellicule__empty reveal">
                La galerie se remplit bientôt. En attendant, retrouvez nos photos
                sur Google.
              </p>
            )}

            <div className="pellicule__actions reveal">
              <a
                className="btn btn--outline"
                href={MAPS_URL}
                target="_blank"
                rel="noreferrer"
              >
                Voir sur Google
              </a>
            </div>
          </div>
        </section>

        <section id="avis" className="section avis">
          <div className="container">
            <div className="section__head reveal">
              <p className="section__label">Avis clients</p>
              <h2 className="section__title">La confiance se voit sur la route</h2>
            </div>

            <div className="avis__score reveal">
              <strong>{avisAverage.toFixed(1).replace(".", ",")}</strong>
              <div>
                <div className="avis__stars" aria-hidden="true">
                  {starsLabel(Math.round(avisAverage))}
                </div>
                <span>
                  {reviews.length} avis · Saint-Genis-Laval
                </span>
              </div>
              <button
                type="button"
                className="btn btn--dark avis__cta"
                onClick={() => {
                  setAvisOpen((v) => !v);
                  setAvisStatus("idle");
                  setAvisError("");
                }}
              >
                {avisOpen ? "Fermer" : "Laisser un avis"}
              </button>
            </div>

            {avisOpen && (
              <form
                className="avis__form reveal is-visible"
                onSubmit={(e) => void handleAvisSubmit(e)}
              >
                <h3>Votre avis</h3>
                <p>Partagez votre expérience à l’atelier S AUTO.</p>

                <div className="field">
                  <span id="avis-stars-label">Note sur 5 *</span>
                  <div
                    className="star-picker"
                    role="radiogroup"
                    aria-labelledby="avis-stars-label"
                  >
                    {[1, 2, 3, 4, 5].map((n) => {
                      const active = (avisHover || avisStars) >= n;
                      return (
                        <button
                          key={n}
                          type="button"
                          role="radio"
                          aria-checked={avisStars === n}
                          aria-label={`${n} étoile${n > 1 ? "s" : ""}`}
                          className={
                            active ? "star-picker__btn is-on" : "star-picker__btn"
                          }
                          onMouseEnter={() => setAvisHover(n)}
                          onMouseLeave={() => setAvisHover(0)}
                          onClick={() => setAvisStars(n)}
                        >
                          ★
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="field">
                  <label htmlFor="avis-name">Nom *</label>
                  <input
                    id="avis-name"
                    name="avis-name"
                    required
                    minLength={2}
                    maxLength={80}
                    autoComplete="name"
                    value={avisName}
                    onChange={(e) => setAvisName(e.target.value)}
                  />
                </div>

                <div className="field">
                  <label htmlFor="avis-message">Message (optionnel)</label>
                  <textarea
                    id="avis-message"
                    name="avis-message"
                    maxLength={800}
                    placeholder="Ce que vous avez apprécié…"
                    value={avisMessage}
                    onChange={(e) => setAvisMessage(e.target.value)}
                  />
                </div>

                {avisError && (
                  <p className="form-error" role="alert">
                    {avisError}
                  </p>
                )}

                <button
                  type="submit"
                  className="btn btn--primary"
                  disabled={avisStatus === "loading"}
                >
                  {avisStatus === "loading" ? "Envoi…" : "Publier mon avis"}
                </button>
              </form>
            )}

            {avisStatus === "sent" && !avisOpen && (
              <p className="form-success avis__thanks" role="status">
                Merci pour votre avis !
              </p>
            )}

            <div className="avis__grid">
              {reviews.map((r) => (
                <article key={r.id} className="avis__item reveal">
                  <div className="avis__item-stars" aria-label={`${r.stars} sur 5`}>
                    {starsLabel(r.stars)}
                  </div>
                  {r.message ? (
                    <blockquote>« {r.message} »</blockquote>
                  ) : (
                    <blockquote className="avis__item-empty">
                      Avis sans commentaire
                    </blockquote>
                  )}
                  <cite>— {r.name}</cite>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="devis" className="section contact">
          <div className="container">
            <div className="section__head reveal">
              <p className="section__label">Devis</p>
              <h2 className="section__title">Parlons de votre véhicule</h2>
              <p className="section__text">
                Atelier situé zone d’activités Chapoly-Laval — parking accessible,
                entrée PMR.
              </p>
            </div>

            <div className="contact__layout">
              <div className="contact__details reveal">
                <dl className="detail">
                  <dt>Téléphone</dt>
                  <dd>
                    <a href={`tel:${PHONE_TEL}`}>{PHONE}</a>
                  </dd>
                </dl>
                <dl className="detail">
                  <dt>Adresse</dt>
                  <dd>
                    <a href={MAPS_URL} target="_blank" rel="noreferrer">
                      {ADDRESS}
                    </a>
                  </dd>
                </dl>
                <dl className="detail">
                  <dt>Horaires</dt>
                  <dd>
                    <ul className="hours">
                      {hours.map((h) => (
                        <li key={h.day}>
                          <span>{h.day}</span>
                          <strong>{h.time}</strong>
                        </li>
                      ))}
                    </ul>
                  </dd>
                </dl>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem" }}>
                  <a className="btn btn--dark" href={`tel:${PHONE_TEL}`}>
                    Appeler maintenant
                  </a>
                  <a
                    className="btn btn--outline"
                    href={MAPS_URL}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Itinéraire
                  </a>
                </div>
              </div>

              <form
                className="contact__form reveal"
                onSubmit={handleSubmit}
              >
                <h3>Demande de devis</h3>
                <p>
                  Décrivez le sinistre et ajoutez des photos : la demande arrive
                  directement dans l’espace gérant (et par e-mail).
                </p>

                {formStatus === "sent" && (
                  <p className="form-success" role="status">
                    Demande envoyée avec les photos. Nous vous rappelons dès que
                    possible.
                  </p>
                )}

                {formStatus === "error" && (
                  <p className="form-error" role="alert">
                    Impossible d’enregistrer la demande pour le moment. Réessayez
                    ou appelez le {PHONE}.
                  </p>
                )}

                <div className="form-row">
                  <div className="field">
                    <label htmlFor="prenom">Prénom</label>
                    <input
                      id="prenom"
                      name="prenom"
                      required
                      autoComplete="given-name"
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="name">Nom</label>
                    <input
                      id="name"
                      name="name"
                      required
                      autoComplete="family-name"
                    />
                  </div>
                </div>

                <div className="form-row">
                  <div className="field">
                    <label htmlFor="email">E-mail</label>
                    <input
                      id="email"
                      name="email"
                      type="email"
                      required
                      autoComplete="email"
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="phone">Téléphone</label>
                    <input
                      id="phone"
                      name="phone"
                      type="tel"
                      required
                      autoComplete="tel"
                    />
                  </div>
                </div>

                <div className="field">
                  <label htmlFor="service">Prestation</label>
                  <select id="service" name="service" required defaultValue="">
                    <option value="" disabled>
                      Choisir…
                    </option>
                    <option>Carrosserie</option>
                    <option>Peinture</option>
                    <option>Pare-brise / vitrage</option>
                    <option>Sinistre assurance</option>
                    <option>Autre</option>
                  </select>
                </div>

                <div className="field">
                  <label htmlFor="message">Message</label>
                  <textarea
                    id="message"
                    name="message"
                    placeholder="Marque, modèle, description des dommages…"
                  />
                </div>

                <div className="field">
                  <label htmlFor="photos">Photos des dommages</label>
                  <label className="photo-drop" htmlFor="photos">
                    <span className="photo-drop__title">
                      Ajouter des photos
                    </span>
                    <span className="photo-drop__hint">
                      Jusqu’à {MAX_PHOTOS} images · 4 Mo max chacune
                    </span>
                    <input
                      id="photos"
                      name="photos"
                      type="file"
                      accept="image/*"
                      multiple
                      capture="environment"
                      onChange={handlePhotosChange}
                    />
                  </label>
                  {photoError && (
                    <p className="photo-error" role="alert">
                      {photoError}
                    </p>
                  )}
                  {photoPreviews.length > 0 && (
                    <ul className="photo-grid">
                      {photoPreviews.map((src, i) => (
                        <li key={src} className="photo-grid__item">
                          <img src={src} alt={`Photo ${i + 1}`} />
                          <button
                            type="button"
                            className="photo-grid__remove"
                            aria-label={`Retirer la photo ${i + 1}`}
                            onClick={() => removePhoto(i)}
                          >
                            ×
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <button
                  type="submit"
                  className="btn btn--primary"
                  disabled={formStatus === "loading"}
                >
                  {formStatus === "loading"
                    ? "Création du PDF…"
                    : "Envoyer la demande"}
                </button>
              </form>
            </div>

            <div className="map-wrap reveal">
              <iframe
                title="Carte — S AUTO Saint-Genis-Laval"
                src={MAPS_EMBED}
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
                allowFullScreen
              />
            </div>
          </div>
        </section>
      </main>

      <footer className="footer">
        <div className="container">
          <div className="footer__top">
            <div>
              <p className="footer__brand">
                <img
                  src="/logo.png"
                  alt="S AUTO"
                  width={160}
                  height={190}
                />
              </p>
              <p className="footer__tag">
                Carrosserie · Peinture · Pare-brise — Saint-Genis-Laval
              </p>
            </div>
            <a className="btn btn--primary footer__cta" href={`tel:${PHONE_TEL}`}>
              {PHONE}
            </a>
          </div>
          <div className="footer__bottom">
            <p>© {new Date().getFullYear()} S AUTO — Tous droits réservés</p>
            <p>SIRET 952 063 048 00013</p>
          </div>
        </div>
      </footer>

      {lightbox && (
        <div
          className="lightbox"
          role="dialog"
          aria-modal="true"
          aria-label={lightbox.alt}
          onClick={() => setLightbox(null)}
        >
          <button
            type="button"
            className="lightbox__close"
            aria-label="Fermer"
            onClick={() => setLightbox(null)}
          >
            ×
          </button>
          <img
            src={lightbox.src}
            alt={lightbox.alt}
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}
