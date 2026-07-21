import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import {
  applyTheme,
  deleteDevis,
  fetchDevis,
  fetchHours,
  fetchTheme,
  getToken,
  login,
  saveHours,
  saveTheme,
  setToken,
  updateDevisStatus,
  THEME_OPTIONS,
  MODE_OPTIONS,
  type DevisItem,
  type DevisStatus,
  type HourRow,
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

  const [tab, setTab] = useState<"devis" | "horaires" | "apparence">("devis");
  const [devis, setDevis] = useState<DevisItem[]>([]);
  const [hours, setHours] = useState<HourRow[]>([]);
  const [theme, setTheme] = useState<ThemeId>("classique");
  const [mode, setMode] = useState<ModeId>("clair");
  const [filter, setFilter] = useState<"tous" | DevisStatus>("tous");
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [savingTheme, setSavingTheme] = useState(false);

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

  async function loadAll() {
    setLoading(true);
    setError("");
    try {
      const [d, h, t] = await Promise.all([
        fetchDevis(),
        fetchHours(),
        fetchTheme(),
      ]);
      setDevis(d.devis);
      setHours(h.hours);
      setTheme(t.theme);
      setMode(t.mode || "clair");
      applyTheme(t.theme, t.mode || "clair");
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

  if (!token) {
    return (
      <div className="admin-login">
        <form className="admin-login__card" onSubmit={handleLogin}>
          <p className="admin-login__brand">
            S <span>AUTO</span>
          </p>
          <h1>Espace gérant</h1>
          <p className="admin-login__hint">
            Accès réservé à la gestion des devis, horaires et apparence.
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
          className={tab === "devis" ? "is-active" : ""}
          onClick={() => setTab("devis")}
        >
          Devis ({counts.nouveau} nouveaux)
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

      {tab === "horaires" && (
        <form className="admin__hours" onSubmit={handleSaveHours}>
          <p className="admin__muted">
            Ces horaires s’affichent automatiquement sur la page Contact du
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
            Choisissez le mode (clair / sombre) et une palette. L’aperçu est
            immédiat ; cliquez sur Enregistrer pour le site public.
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
