import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import {
  applyTheme,
  createRendezVous,
  deleteAvis,
  deleteDevis,
  deletePellicule,
  deleteRendezVous,
  fetchAvis,
  fetchDevis,
  fetchHours,
  fetchPellicule,
  fetchRendezVous,
  fetchTheme,
  getToken,
  login,
  saveHours,
  saveTheme,
  setToken,
  updateDevisStatus,
  updateRendezVous,
  uploadPellicule,
  THEME_OPTIONS,
  MODE_OPTIONS,
  type AvisItem,
  type DevisItem,
  type DevisStatus,
  type HourRow,
  type PelliculePhoto,
  type RendezVousItem,
  type RdvStatus,
  type ThemeId,
  type ModeId,
} from "./api";
import "./Admin.css";

const STATUS_LABEL: Record<DevisStatus, string> = {
  nouveau: "Nouveau",
  en_cours: "En cours",
  traite: "Traité",
  archive: "Archivé",
};

const RDV_STATUS_LABEL: Record<RdvStatus, string> = {
  prevu: "Prévu",
  en_cours: "En cours",
  termine: "Terminé",
  annule: "Annulé",
};

const SERVICE_OPTIONS = [
  "Carrosserie",
  "Peinture",
  "Pare-brise / vitrage",
  "Grêle / débosselage",
  "Jantes",
  "Rénovation des phares",
  "Sinistre assurance",
  "Autre",
];

const EMPTY_RDV_FORM = {
  title: "",
  client: "",
  phone: "",
  service: "",
  date: "",
  time: "09:00",
  duration: 60,
  notes: "",
  status: "prevu" as RdvStatus,
};

function starsLabel(n: number) {
  return "★".repeat(n) + "☆".repeat(Math.max(0, 5 - n));
}

function toDateKey(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function buildMonthCells(view: Date) {
  const first = startOfMonth(view);
  const startOffset = (first.getDay() + 6) % 7; // lundi = 0
  const cells: { key: string; date: Date; inMonth: boolean }[] = [];
  const cursor = new Date(first);
  cursor.setDate(cursor.getDate() - startOffset);
  for (let i = 0; i < 42; i += 1) {
    const date = new Date(cursor);
    cells.push({
      key: toDateKey(date),
      date,
      inMonth: date.getMonth() === view.getMonth(),
    });
    cursor.setDate(cursor.getDate() + 1);
  }
  return cells;
}

async function compressImageFile(
  file: File,
  maxSide = 1400,
  quality = 0.82,
): Promise<File> {
  if (!file.type.startsWith("image/")) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close();
    const blob: Blob | null = await new Promise((resolve) =>
      canvas.toBlob((b) => resolve(b), "image/jpeg", quality),
    );
    if (!blob) return file;
    const name = file.name.replace(/\.\w+$/, "") + ".jpg";
    return new File([blob], name, { type: "image/jpeg" });
  } catch {
    return file;
  }
}

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleString("fr-FR", {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

export default function AdminPage() {
  const [token, setTokenState] = useState<string | null>(() => getToken());
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loggingIn, setLoggingIn] = useState(false);

  const [tab, setTab] = useState<
    | "dashboard"
    | "devis"
    | "agenda"
    | "horaires"
    | "apparence"
    | "avis"
    | "pellicule"
  >("dashboard");
  const [devis, setDevis] = useState<DevisItem[]>([]);
  const [avisList, setAvisList] = useState<AvisItem[]>([]);
  const [pellicule, setPellicule] = useState<PelliculePhoto[]>([]);
  const [rendezVous, setRendezVous] = useState<RendezVousItem[]>([]);
  const [hours, setHours] = useState<HourRow[]>([]);
  const [theme, setTheme] = useState<ThemeId>("classique");
  const [mode, setMode] = useState<ModeId>("clair");
  const [filter, setFilter] = useState<"tous" | DevisStatus>("tous");
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [savingTheme, setSavingTheme] = useState(false);
  const [uploadingPellicule, setUploadingPellicule] = useState(false);
  const [calMonth, setCalMonth] = useState(() => startOfMonth(new Date()));
  const [selectedDay, setSelectedDay] = useState(() => toDateKey(new Date()));
  const [rdvForm, setRdvForm] = useState(EMPTY_RDV_FORM);
  const [editingRdvId, setEditingRdvId] = useState<string | null>(null);
  const [savingRdv, setSavingRdv] = useState(false);

  const filtered = useMemo(
    () =>
      filter === "tous" ? devis : devis.filter((d) => d.status === filter),
    [devis, filter],
  );

  const counts = useMemo(() => {
    const c = { nouveau: 0, en_cours: 0, traite: 0, archive: 0 };
    for (const d of devis) c[d.status] += 1;
    return c;
  }, [devis]);

  const dashboardStats = useMemo(() => {
    const now = new Date();
    const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const today = toDateKey(now);
    const weekAgo = new Date(now);
    weekAgo.setDate(weekAgo.getDate() - 7);
    const devisThisMonth = devis.filter((d) =>
      d.createdAt.startsWith(monthKey),
    ).length;
    const devisThisWeek = devis.filter((d) => {
      const t = new Date(d.createdAt).getTime();
      return t >= weekAgo.getTime();
    }).length;
    const rdvToday = rendezVous.filter(
      (r) => r.date === today && r.status !== "annule",
    ).length;
    const rdvUpcoming = rendezVous.filter(
      (r) => r.date >= today && r.status !== "annule" && r.status !== "termine",
    ).length;
    return {
      devisTotal: devis.length,
      devisThisMonth,
      devisThisWeek,
      devisNouveau: counts.nouveau,
      avisTotal: avisList.length,
      pelliculeTotal: pellicule.length,
      rdvToday,
      rdvUpcoming,
      rdvTotal: rendezVous.length,
    };
  }, [devis, counts.nouveau, avisList.length, pellicule.length, rendezVous]);

  const monthCells = useMemo(() => buildMonthCells(calMonth), [calMonth]);

  const rdvByDay = useMemo(() => {
    const map = new Map<string, RendezVousItem[]>();
    for (const r of rendezVous) {
      const list = map.get(r.date) || [];
      list.push(r);
      map.set(r.date, list);
    }
    for (const [, list] of map) {
      list.sort((a, b) => a.time.localeCompare(b.time));
    }
    return map;
  }, [rendezVous]);

  const dayRdvs = useMemo(
    () => rdvByDay.get(selectedDay) || [],
    [rdvByDay, selectedDay],
  );

  const upcomingRdvs = useMemo(() => {
    const today = toDateKey(new Date());
    return rendezVous
      .filter((r) => r.date >= today && r.status !== "annule")
      .slice(0, 6);
  }, [rendezVous]);

  const recentDevis = useMemo(() => devis.slice(0, 5), [devis]);

  async function loadAll() {
    setLoading(true);
    setError("");
    try {
      const [d, h, t, a, p, r] = await Promise.all([
        fetchDevis(),
        fetchHours(),
        fetchTheme(),
        fetchAvis(),
        fetchPellicule(),
        fetchRendezVous(),
      ]);
      setDevis(d.devis);
      setHours(h.hours);
      setTheme(t.theme);
      setMode(t.mode || "clair");
      applyTheme(t.theme, t.mode || "clair");
      setAvisList(a.avis || []);
      setPellicule(p.photos || []);
      setRendezVous(r.rendezVous || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Chargement impossible");
      if (String(err).includes("Session") || String(err).includes("autoris")) {
        setToken(null);
        setTokenState(null);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (token) void loadAll();
  }, [token]);

  async function handleLogin(e: FormEvent) {
    e.preventDefault();
    setLoggingIn(true);
    setLoginError("");
    try {
      const res = await login(username.trim(), password);
      setToken(res.token);
      setTokenState(res.token);
      setPassword("");
    } catch (err) {
      setLoginError(
        err instanceof Error ? err.message : "Connexion impossible",
      );
    } finally {
      setLoggingIn(false);
    }
  }

  function logout() {
    setToken(null);
    setTokenState(null);
    setDevis([]);
  }

  async function changeStatus(id: string, status: DevisStatus) {
    try {
      const res = await updateDevisStatus(id, status);
      setDevis((prev) => prev.map((d) => (d.id === id ? res.devis : d)));
      setMessage("Statut mis à jour");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur statut");
    }
  }

  async function removeDevis(id: string) {
    if (!confirm("Supprimer ce devis définitivement ?")) return;
    try {
      await deleteDevis(id);
      setDevis((prev) => prev.filter((d) => d.id !== id));
      if (selected === id) setSelected(null);
      setMessage("Devis supprimé");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Suppression impossible");
    }
  }

  async function handleSaveHours(e: FormEvent) {
    e.preventDefault();
    setMessage("");
    setError("");
    try {
      const res = await saveHours(hours);
      setHours(res.hours);
      setMessage("Horaires enregistrés — visibles sur le site");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Enregistrement impossible");
    }
  }

  async function handleSaveTheme() {
    setMessage("");
    setError("");
    setSavingTheme(true);
    try {
      const res = await saveTheme(theme, mode);
      setTheme(res.theme);
      setMode(res.mode);
      applyTheme(res.theme, res.mode);
      setMessage("Apparence enregistrée — visible sur le site public");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Enregistrement impossible");
    } finally {
      setSavingTheme(false);
    }
  }

  async function removeAvis(id: string) {
    if (!confirm("Supprimer cet avis définitivement ?")) return;
    try {
      await deleteAvis(id);
      setAvisList((prev) => prev.filter((a) => a.id !== id));
      setMessage("Avis supprimé");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Suppression impossible");
    }
  }

  async function handlePelliculeUpload(files: FileList | null) {
    if (!files?.length) return;
    setMessage("");
    setError("");
    setUploadingPellicule(true);
    try {
      const compressed: File[] = [];
      for (const file of Array.from(files)) {
        compressed.push(await compressImageFile(file, 1400, 0.82));
      }
      const res = await uploadPellicule(compressed);
      setPellicule(res.pellicule);
      setMessage(`${res.photos.length} photo(s) ajoutée(s) à la pellicule`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload impossible");
    } finally {
      setUploadingPellicule(false);
    }
  }

  async function removePelliculePhoto(id: string) {
    if (!confirm("Supprimer cette photo de la pellicule ?")) return;
    try {
      await deletePellicule(id);
      setPellicule((prev) => prev.filter((p) => p.id !== id));
      setMessage("Photo supprimée");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Suppression impossible");
    }
  }

  function resetRdvForm(day = selectedDay) {
    setEditingRdvId(null);
    setRdvForm({ ...EMPTY_RDV_FORM, date: day });
  }

  function editRdv(item: RendezVousItem) {
    setEditingRdvId(item.id);
    setSelectedDay(item.date);
    setRdvForm({
      title: item.title,
      client: item.client,
      phone: item.phone,
      service: item.service,
      date: item.date,
      time: item.time,
      duration: item.duration,
      notes: item.notes,
      status: item.status,
    });
  }

  async function handleSaveRdv(e: FormEvent) {
    e.preventDefault();
    setMessage("");
    setError("");
    setSavingRdv(true);
    try {
      if (editingRdvId) {
        const res = await updateRendezVous(editingRdvId, rdvForm);
        setRendezVous((prev) =>
          prev
            .map((r) => (r.id === editingRdvId ? res.rendezVous : r))
            .sort((a, b) =>
              `${a.date}T${a.time}`.localeCompare(`${b.date}T${b.time}`),
            ),
        );
        setMessage("Rendez-vous mis à jour");
      } else {
        const res = await createRendezVous(rdvForm);
        setRendezVous((prev) =>
          [res.rendezVous, ...prev].sort((a, b) =>
            `${a.date}T${a.time}`.localeCompare(`${b.date}T${b.time}`),
          ),
        );
        setMessage("Rendez-vous ajouté");
      }
      setSelectedDay(rdvForm.date);
      resetRdvForm(rdvForm.date);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Enregistrement impossible");
    } finally {
      setSavingRdv(false);
    }
  }

  async function removeRdv(id: string) {
    if (!confirm("Supprimer ce rendez-vous ?")) return;
    try {
      await deleteRendezVous(id);
      setRendezVous((prev) => prev.filter((r) => r.id !== id));
      if (editingRdvId === id) resetRdvForm();
      setMessage("Rendez-vous supprimé");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Suppression impossible");
    }
  }

  if (!token) {
    return (
      <div className="admin-login">
        <form className="admin-login__card" onSubmit={handleLogin}>
          <p className="admin-login__brand">
            S <span>AUTO</span>
          </p>
          <h1>Espace gérant</h1>
          <p className="admin-login__hint">
            Accès réservé à la gestion atelier : devis, agenda et apparence.
          </p>
          {loginError && <p className="admin-alert">{loginError}</p>}
          <label>
            Identifiant
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              required
            />
          </label>
          <label>
            Mot de passe
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </label>
          <button type="submit" disabled={loggingIn}>
            {loggingIn ? "Connexion…" : "Se connecter"}
          </button>
          <Link to="/" className="admin-login__back">
            ← Retour au site
          </Link>
        </form>
      </div>
    );
  }

  const active = devis.find((d) => d.id === selected) || null;

  return (
    <div className="admin">
      <header className="admin__top">
        <div>
          <p className="admin__brand">
            S <span>AUTO</span> · Panel
          </p>
          <p className="admin__sub">Gestion atelier</p>
        </div>
        <div className="admin__top-actions">
          <Link to="/">Voir le site</Link>
          <button type="button" onClick={logout}>
            Déconnexion
          </button>
        </div>
      </header>

      <div className="admin__tabs">
        <button
          type="button"
          className={tab === "dashboard" ? "is-active" : ""}
          onClick={() => setTab("dashboard")}
        >
          Tableau de bord
        </button>
        <button
          type="button"
          className={tab === "devis" ? "is-active" : ""}
          onClick={() => setTab("devis")}
        >
          Devis
          {counts.nouveau > 0 && (
            <span className="tab-badge tab-badge--hot">{counts.nouveau}</span>
          )}
        </button>
        <button
          type="button"
          className={tab === "agenda" ? "is-active" : ""}
          onClick={() => {
            setTab("agenda");
            if (!rdvForm.date) resetRdvForm(selectedDay);
          }}
        >
          Agenda
          {dashboardStats.rdvToday > 0 && (
            <span className="tab-badge">{dashboardStats.rdvToday}</span>
          )}
        </button>
        <button
          type="button"
          className={tab === "avis" ? "is-active" : ""}
          onClick={() => setTab("avis")}
        >
          Avis
          <span className="tab-badge">{avisList.length}</span>
        </button>
        <button
          type="button"
          className={tab === "pellicule" ? "is-active" : ""}
          onClick={() => setTab("pellicule")}
        >
          Pellicule
          <span className="tab-badge">{pellicule.length}</span>
        </button>
        <button
          type="button"
          className={tab === "horaires" ? "is-active" : ""}
          onClick={() => setTab("horaires")}
        >
          Horaires
        </button>
        <button
          type="button"
          className={tab === "apparence" ? "is-active" : ""}
          onClick={() => setTab("apparence")}
        >
          Apparence
        </button>
      </div>

      {(message || error) && (
        <p className={error ? "admin-alert" : "admin-ok"} role="status">
          {error || message}
        </p>
      )}

      {tab === "dashboard" && (
        <div className="admin__dashboard">
          <div className="dash-head">
            <div>
              <h2>Tableau de bord</h2>
              <p className="admin__muted">
                Vue d’ensemble de l’atelier — devis, agenda et activité.
              </p>
            </div>
            <button
              type="button"
              className="btn"
              onClick={() => void loadAll()}
            >
              Actualiser
            </button>
          </div>

          {loading && <p className="admin__muted">Chargement…</p>}

          <div className="dash-grid">
            <button
              type="button"
              className="dash-card dash-card--accent"
              onClick={() => setTab("devis")}
            >
              <span className="dash-card__label">Demandes de devis</span>
              <strong className="dash-card__value">
                {dashboardStats.devisTotal}
              </strong>
              <span className="dash-card__hint">
                Total reçu · {dashboardStats.devisNouveau}{" "}
                {dashboardStats.devisNouveau > 1 ? "nouveaux" : "nouveau"}
              </span>
            </button>
            <div className="dash-card">
              <span className="dash-card__label">Cette semaine</span>
              <strong className="dash-card__value">
                {dashboardStats.devisThisWeek}
              </strong>
              <span className="dash-card__hint">Devis reçus sur 7 jours</span>
            </div>
            <div className="dash-card">
              <span className="dash-card__label">Ce mois</span>
              <strong className="dash-card__value">
                {dashboardStats.devisThisMonth}
              </strong>
              <span className="dash-card__hint">Devis du mois en cours</span>
            </div>
            <button
              type="button"
              className="dash-card"
              onClick={() => setTab("agenda")}
            >
              <span className="dash-card__label">RDV aujourd’hui</span>
              <strong className="dash-card__value">
                {dashboardStats.rdvToday}
              </strong>
              <span className="dash-card__hint">
                {dashboardStats.rdvUpcoming} à venir au total
              </span>
            </button>
            <button
              type="button"
              className="dash-card"
              onClick={() => setTab("avis")}
            >
              <span className="dash-card__label">Avis clients</span>
              <strong className="dash-card__value">
                {dashboardStats.avisTotal}
              </strong>
              <span className="dash-card__hint">Publiés sur le site</span>
            </button>
            <button
              type="button"
              className="dash-card"
              onClick={() => setTab("pellicule")}
            >
              <span className="dash-card__label">Pellicule</span>
              <strong className="dash-card__value">
                {dashboardStats.pelliculeTotal}
              </strong>
              <span className="dash-card__hint">Photos atelier</span>
            </button>
          </div>

          <div className="dash-panels">
            <section className="dash-panel">
              <div className="dash-panel__head">
                <h3>Dernières demandes</h3>
                <button
                  type="button"
                  className="btn"
                  onClick={() => setTab("devis")}
                >
                  Voir tout
                </button>
              </div>
              {recentDevis.length === 0 ? (
                <p className="admin__muted">Aucune demande pour le moment.</p>
              ) : (
                <ul className="dash-list">
                  {recentDevis.map((d) => (
                    <li key={d.id}>
                      <button
                        type="button"
                        onClick={() => {
                          setSelected(d.id);
                          setTab("devis");
                        }}
                      >
                        <span className={`badge badge--${d.status}`}>
                          {STATUS_LABEL[d.status]}
                        </span>
                        <strong>
                          {[d.prenom, d.name].filter(Boolean).join(" ")}
                        </strong>
                        <span>{d.service}</span>
                        <time>{formatDate(d.createdAt)}</time>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="dash-panel">
              <div className="dash-panel__head">
                <h3>Prochains rendez-vous</h3>
                <button
                  type="button"
                  className="btn"
                  onClick={() => setTab("agenda")}
                >
                  Calendrier
                </button>
              </div>
              {upcomingRdvs.length === 0 ? (
                <p className="admin__muted">
                  Aucun rendez-vous à venir. Ajoutez-en depuis l’agenda.
                </p>
              ) : (
                <ul className="dash-list">
                  {upcomingRdvs.map((r) => (
                    <li key={r.id}>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedDay(r.date);
                          setCalMonth(startOfMonth(new Date(r.date + "T12:00:00")));
                          editRdv(r);
                          setTab("agenda");
                        }}
                      >
                        <span className={`rdv-pill rdv-pill--${r.status}`}>
                          {r.time}
                        </span>
                        <strong>{r.title}</strong>
                        <span>
                          {r.date}
                          {r.client ? ` · ${r.client}` : ""}
                        </span>
                        <span>{RDV_STATUS_LABEL[r.status]}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </div>
      )}

      {tab === "agenda" && (
        <div className="admin__agenda">
          <div className="dash-head">
            <div>
              <h2>Agenda &amp; calendrier atelier</h2>
              <p className="admin__muted">
                Planifiez les rendez-vous, interventions et passages clients.
              </p>
            </div>
            <button
              type="button"
              className="btn primary"
              onClick={() => resetRdvForm(selectedDay)}
            >
              Nouveau RDV
            </button>
          </div>

          <div className="agenda-layout">
            <div className="cal">
              <div className="cal__nav">
                <button
                  type="button"
                  className="btn"
                  onClick={() =>
                    setCalMonth(
                      new Date(calMonth.getFullYear(), calMonth.getMonth() - 1, 1),
                    )
                  }
                >
                  ←
                </button>
                <strong>
                  {calMonth.toLocaleDateString("fr-FR", {
                    month: "long",
                    year: "numeric",
                  })}
                </strong>
                <button
                  type="button"
                  className="btn"
                  onClick={() =>
                    setCalMonth(
                      new Date(calMonth.getFullYear(), calMonth.getMonth() + 1, 1),
                    )
                  }
                >
                  →
                </button>
              </div>
              <div className="cal__weekdays">
                {["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"].map((d) => (
                  <span key={d}>{d}</span>
                ))}
              </div>
              <div className="cal__grid">
                {monthCells.map((cell) => {
                  const count = rdvByDay.get(cell.key)?.length || 0;
                  const isToday = cell.key === toDateKey(new Date());
                  const isSelected = cell.key === selectedDay;
                  return (
                    <button
                      key={cell.key}
                      type="button"
                      className={[
                        "cal__day",
                        cell.inMonth ? "" : "is-out",
                        isToday ? "is-today" : "",
                        isSelected ? "is-selected" : "",
                        count ? "has-events" : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                      onClick={() => {
                        setSelectedDay(cell.key);
                        if (!editingRdvId) {
                          setRdvForm((f) => ({ ...f, date: cell.key }));
                        }
                      }}
                    >
                      <span>{cell.date.getDate()}</span>
                      {count > 0 && <em>{count}</em>}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="agenda-side">
              <section className="dash-panel">
                <div className="dash-panel__head">
                  <h3>
                    {new Date(selectedDay + "T12:00:00").toLocaleDateString(
                      "fr-FR",
                      { weekday: "long", day: "numeric", month: "long" },
                    )}
                  </h3>
                </div>
                {dayRdvs.length === 0 ? (
                  <p className="admin__muted">Aucun rendez-vous ce jour.</p>
                ) : (
                  <ul className="rdv-day-list">
                    {dayRdvs.map((r) => (
                      <li key={r.id} className={`rdv-day-item rdv-day-item--${r.status}`}>
                        <div>
                          <strong>
                            {r.time} · {r.title}
                          </strong>
                          <p>
                            {[r.client, r.service, RDV_STATUS_LABEL[r.status]]
                              .filter(Boolean)
                              .join(" · ")}
                          </p>
                          {r.phone && (
                            <a href={`tel:${r.phone.replace(/\s/g, "")}`}>
                              {r.phone}
                            </a>
                          )}
                        </div>
                        <div className="rdv-day-item__actions">
                          <button
                            type="button"
                            className="btn"
                            onClick={() => editRdv(r)}
                          >
                            Modifier
                          </button>
                          <button
                            type="button"
                            className="btn danger"
                            onClick={() => void removeRdv(r.id)}
                          >
                            Suppr.
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <form className="rdv-form dash-panel" onSubmit={handleSaveRdv}>
                <h3>
                  {editingRdvId ? "Modifier le rendez-vous" : "Nouveau rendez-vous"}
                </h3>
                <label>
                  Titre
                  <input
                    value={rdvForm.title}
                    onChange={(e) =>
                      setRdvForm((f) => ({ ...f, title: e.target.value }))
                    }
                    placeholder="Ex. Réparation aile AV"
                    required
                  />
                </label>
                <div className="rdv-form__row">
                  <label>
                    Date
                    <input
                      type="date"
                      value={rdvForm.date}
                      onChange={(e) =>
                        setRdvForm((f) => ({ ...f, date: e.target.value }))
                      }
                      required
                    />
                  </label>
                  <label>
                    Heure
                    <input
                      type="time"
                      value={rdvForm.time}
                      onChange={(e) =>
                        setRdvForm((f) => ({ ...f, time: e.target.value }))
                      }
                      required
                    />
                  </label>
                  <label>
                    Durée (min)
                    <input
                      type="number"
                      min={15}
                      max={480}
                      step={15}
                      value={rdvForm.duration}
                      onChange={(e) =>
                        setRdvForm((f) => ({
                          ...f,
                          duration: Number(e.target.value) || 60,
                        }))
                      }
                    />
                  </label>
                </div>
                <div className="rdv-form__row">
                  <label>
                    Client
                    <input
                      value={rdvForm.client}
                      onChange={(e) =>
                        setRdvForm((f) => ({ ...f, client: e.target.value }))
                      }
                      placeholder="Nom du client"
                    />
                  </label>
                  <label>
                    Téléphone
                    <input
                      value={rdvForm.phone}
                      onChange={(e) =>
                        setRdvForm((f) => ({ ...f, phone: e.target.value }))
                      }
                      placeholder="06…"
                    />
                  </label>
                </div>
                <div className="rdv-form__row">
                  <label>
                    Prestation
                    <select
                      value={rdvForm.service}
                      onChange={(e) =>
                        setRdvForm((f) => ({ ...f, service: e.target.value }))
                      }
                    >
                      <option value="">Choisir…</option>
                      {SERVICE_OPTIONS.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Statut
                    <select
                      value={rdvForm.status}
                      onChange={(e) =>
                        setRdvForm((f) => ({
                          ...f,
                          status: e.target.value as RdvStatus,
                        }))
                      }
                    >
                      {(Object.keys(RDV_STATUS_LABEL) as RdvStatus[]).map(
                        (s) => (
                          <option key={s} value={s}>
                            {RDV_STATUS_LABEL[s]}
                          </option>
                        ),
                      )}
                    </select>
                  </label>
                </div>
                <label>
                  Notes
                  <textarea
                    rows={3}
                    value={rdvForm.notes}
                    onChange={(e) =>
                      setRdvForm((f) => ({ ...f, notes: e.target.value }))
                    }
                    placeholder="Véhicule, assurance, remarques…"
                  />
                </label>
                <div className="rdv-form__actions">
                  <button
                    type="submit"
                    className="btn primary"
                    disabled={savingRdv}
                  >
                    {savingRdv
                      ? "Enregistrement…"
                      : editingRdvId
                        ? "Enregistrer"
                        : "Ajouter au calendrier"}
                  </button>
                  {editingRdvId && (
                    <button
                      type="button"
                      className="btn"
                      onClick={() => resetRdvForm(selectedDay)}
                    >
                      Annuler
                    </button>
                  )}
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {tab === "devis" && (
        <div className="admin__devis">
          <div className="admin__filters">
            {(
              [
                "tous",
                "nouveau",
                "en_cours",
                "traite",
                "archive",
              ] as const
            ).map((f) => (
              <button
                key={f}
                type="button"
                className={filter === f ? "is-active" : ""}
                onClick={() => setFilter(f)}
              >
                {f === "tous" ? "Tous" : STATUS_LABEL[f]}
              </button>
            ))}
            <button type="button" className="ghost" onClick={() => void loadAll()}>
              Actualiser
            </button>
          </div>

          {loading && <p className="admin__muted">Chargement…</p>}

          <div className="admin__split">
            <ul className="devis-list">
              {filtered.map((d) => (
                <li key={d.id}>
                  <button
                    type="button"
                    className={
                      selected === d.id ? "devis-row is-active" : "devis-row"
                    }
                    onClick={() => setSelected(d.id)}
                  >
                    <span className={`badge badge--${d.status}`}>
                      {STATUS_LABEL[d.status]}
                    </span>
                    <strong>
                      {[d.prenom, d.name].filter(Boolean).join(" ")}
                    </strong>
                    <span>{d.service}</span>
                    <time>{formatDate(d.createdAt)}</time>
                  </button>
                </li>
              ))}
              {!loading && filtered.length === 0 && (
                <li className="admin__muted">Aucun devis pour ce filtre.</li>
              )}
            </ul>

            <div className="devis-detail">
              {!active && (
                <p className="admin__muted">
                  Sélectionnez un devis pour voir le détail.
                </p>
              )}
              {active && (
                <>
                  <div className="devis-detail__head">
                    <div>
                      <h2>
                        {[active.prenom, active.name].filter(Boolean).join(" ")}
                      </h2>
                      <p>{formatDate(active.createdAt)}</p>
                    </div>
                    <span className={`badge badge--${active.status}`}>
                      {STATUS_LABEL[active.status]}
                    </span>
                  </div>

                  <dl className="devis-meta">
                    <div>
                      <dt>Prénom</dt>
                      <dd>{active.prenom || "—"}</dd>
                    </div>
                    <div>
                      <dt>Nom</dt>
                      <dd>{active.name}</dd>
                    </div>
                    <div>
                      <dt>E-mail</dt>
                      <dd>
                        {active.email ? (
                          <a href={`mailto:${active.email}`}>{active.email}</a>
                        ) : (
                          "—"
                        )}
                      </dd>
                    </div>
                    <div>
                      <dt>Téléphone</dt>
                      <dd>
                        <a href={`tel:${active.phone.replace(/\s+/g, "")}`}>
                          {active.phone}
                        </a>
                      </dd>
                    </div>
                    <div>
                      <dt>Prestation</dt>
                      <dd>{active.service}</dd>
                    </div>
                  </dl>

                  <h3>Message</h3>
                  <p className="devis-message">
                    {active.message || "(aucun message)"}
                  </p>

                  <h3>Photos ({active.photos.length})</h3>
                  {active.photos.length === 0 ? (
                    <p className="admin__muted">Pas de photo</p>
                  ) : (
                    <div className="devis-photos">
                      {active.photos.map((src) => (
                        <a key={src} href={src} target="_blank" rel="noreferrer">
                          <img src={src} alt="Photo devis" />
                        </a>
                      ))}
                    </div>
                  )}

                  <div className="devis-actions">
                    <label>
                      Statut
                      <select
                        value={active.status}
                        onChange={(e) =>
                          void changeStatus(
                            active.id,
                            e.target.value as DevisStatus,
                          )
                        }
                      >
                        {(
                          Object.keys(STATUS_LABEL) as DevisStatus[]
                        ).map((s) => (
                          <option key={s} value={s}>
                            {STATUS_LABEL[s]}
                          </option>
                        ))}
                      </select>
                    </label>
                    <a
                      className="btn"
                      href={`tel:${active.phone.replace(/\s+/g, "")}`}
                    >
                      Appeler
                    </a>
                    <button
                      type="button"
                      className="btn danger"
                      onClick={() => void removeDevis(active.id)}
                    >
                      Supprimer
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {tab === "avis" && (
        <div className="admin__avis">
          <p className="admin__muted">
            Avis publiés sur le site. Vous pouvez supprimer un avis abusif.
          </p>
          {loading && <p className="admin__muted">Chargement…</p>}
          <ul className="avis-admin-list">
            {avisList.map((a) => (
              <li key={a.id} className="avis-admin-card">
                <div className="avis-admin-card__top">
                  <strong>{a.name}</strong>
                  <span className="avis-admin-stars">{starsLabel(a.stars)}</span>
                </div>
                <p>{a.message || "— Sans message —"}</p>
                <div className="avis-admin-card__bottom">
                  <time>{formatDate(a.createdAt)}</time>
                  <button
                    type="button"
                    className="btn danger"
                    onClick={() => void removeAvis(a.id)}
                  >
                    Supprimer
                  </button>
                </div>
              </li>
            ))}
            {!loading && avisList.length === 0 && (
              <li className="admin__muted">Aucun avis pour le moment.</li>
            )}
          </ul>
        </div>
      )}

      {tab === "pellicule" && (
        <div className="admin__pellicule">
          <p className="admin__muted">
            Ajoutez les photos (Google / atelier). Elles s’affichent dans
            Pellicule sur le site. Re-uploadez-les si une ancienne photo ne
            s’affiche plus après un redéploiement Render.
          </p>
          <label className="pellicule-upload">
            <span>
              {uploadingPellicule
                ? "Envoi en cours…"
                : "Ajouter des photos (JPG, PNG…)"}
            </span>
            <input
              type="file"
              accept="image/*"
              multiple
              disabled={uploadingPellicule}
              onChange={(e) => {
                void handlePelliculeUpload(e.target.files);
                e.target.value = "";
              }}
            />
          </label>
          {loading && <p className="admin__muted">Chargement…</p>}
          <ul className="pellicule-admin-grid">
            {pellicule.map((photo) => (
              <li key={photo.id}>
                <img src={photo.src} alt={photo.alt} />
                <button
                  type="button"
                  className="btn danger"
                  onClick={() => void removePelliculePhoto(photo.id)}
                >
                  Supprimer
                </button>
              </li>
            ))}
          </ul>
          {!loading && pellicule.length === 0 && (
            <p className="admin__muted">Aucune photo pour le moment.</p>
          )}
        </div>
      )}

      {tab === "horaires" && (
        <form className="admin__hours" onSubmit={handleSaveHours}>
          <p className="admin__muted">
            Ces horaires s’affichent automatiquement sur la page Devis du
            site.
          </p>
          {hours.map((h, i) => (
            <div key={h.day} className="hours-row">
              <label>
                Jour
                <input
                  value={h.day}
                  onChange={(e) => {
                    const next = [...hours];
                    next[i] = { ...next[i], day: e.target.value };
                    setHours(next);
                  }}
                  required
                />
              </label>
              <label>
                Horaire
                <input
                  value={h.time}
                  onChange={(e) => {
                    const next = [...hours];
                    next[i] = { ...next[i], time: e.target.value };
                    setHours(next);
                  }}
                  required
                />
              </label>
            </div>
          ))}
          <button type="submit" className="btn primary">
            Enregistrer les horaires
          </button>
        </form>
      )}

      {tab === "apparence" && (
        <div className="admin__theme">
          <p className="admin__muted">
            Choisissez le mode (clair / sombre) et une palette pour le site
            public. Le panel gérant reste toujours en sombre. Après
            enregistrement, ouvrez « Voir le site » pour vérifier le rendu.
          </p>

          <h3 className="admin__theme-title">Mode</h3>
          <div className="mode-grid" role="radiogroup" aria-label="Mode">
            {MODE_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                role="radio"
                aria-checked={mode === opt.id}
                className={
                  mode === opt.id ? "mode-card is-active" : "mode-card"
                }
                onClick={() => {
                  setMode(opt.id);
                  applyTheme(theme, opt.id);
                }}
              >
                <strong>{opt.label}</strong>
                <span>{opt.description}</span>
              </button>
            ))}
          </div>

          <h3 className="admin__theme-title">Palette</h3>
          <div className="theme-grid" role="radiogroup" aria-label="Palettes">
            {THEME_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                role="radio"
                aria-checked={theme === opt.id}
                className={
                  theme === opt.id ? "theme-card is-active" : "theme-card"
                }
                onClick={() => {
                  setTheme(opt.id);
                  applyTheme(opt.id, mode);
                }}
              >
                <span className="theme-card__swatches" aria-hidden>
                  {opt.swatches.map((color) => (
                    <span
                      key={color}
                      style={{ background: color }}
                      className="theme-card__swatch"
                    />
                  ))}
                </span>
                <strong>{opt.label}</strong>
                <span>{opt.description}</span>
              </button>
            ))}
          </div>
          <button
            type="button"
            className="btn primary"
            disabled={savingTheme}
            onClick={() => void handleSaveTheme()}
          >
            {savingTheme ? "Enregistrement…" : "Enregistrer l’apparence"}
          </button>
        </div>
      )}
    </div>
  );
}
