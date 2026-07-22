const TOKEN_KEY = "sauto_manager_token";

export type HourRow = { day: string; time: string };

export type DevisStatus = "nouveau" | "en_cours" | "traite" | "archive";

export type DevisItem = {
  id: string;
  createdAt: string;
  updatedAt?: string;
  prenom?: string;
  name: string;
  email?: string;
  phone: string;
  service: string;
  message: string;
  photos: string[];
  status: DevisStatus;
};

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

async function api<T>(
  path: string,
  options: RequestInit & { auth?: boolean } = {},
): Promise<T> {
  const headers = new Headers(options.headers || {});
  if (options.auth) {
    const token = getToken();
    if (token) headers.set("Authorization", `Bearer ${token}`);
  }
  if (options.body && !(options.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }

  const res = await fetch(path, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      (data as { error?: string }).error || `Erreur ${res.status}`,
    );
  }
  return data as T;
}

export function fetchHours() {
  return api<{ hours: HourRow[] }>("/api/hours");
}

export function saveHours(hours: HourRow[]) {
  return api<{ hours: HourRow[] }>("/api/hours", {
    method: "PUT",
    auth: true,
    body: JSON.stringify({ hours }),
  });
}

export type ThemeId = "classique" | "atelier" | "prestige";
export type ModeId = "clair" | "sombre";

export const THEME_OPTIONS: {
  id: ThemeId;
  label: string;
  description: string;
  swatches: [string, string, string];
}[] = [
  {
    id: "classique",
    label: "Classique",
    description: "Bleu atelier & rouge S AUTO — identité actuelle.",
    swatches: ["#0066c8", "#d4001a", "#0a1a3a"],
  },
  {
    id: "atelier",
    label: "Atelier",
    description: "Anthracite & ambre — ambiance garage / métal.",
    swatches: ["#c45c26", "#1a1a1a", "#8b7355"],
  },
  {
    id: "prestige",
    label: "Prestige",
    description: "Vert profond & cuivre — rendu plus haut de gamme.",
    swatches: ["#0d5c4d", "#b85c38", "#0f1f1c"],
  },
];

export const MODE_OPTIONS: {
  id: ModeId;
  label: string;
  description: string;
}[] = [
  {
    id: "clair",
    label: "Clair",
    description: "Fond clair, texte foncé — lecture de jour.",
  },
  {
    id: "sombre",
    label: "Sombre",
    description: "Fond sombre, texte clair — rendu nocturne.",
  },
];

export function fetchTheme() {
  return api<{
    theme: ThemeId;
    mode: ModeId;
    themes: ThemeId[];
    modes: ModeId[];
  }>("/api/theme");
}

export function saveTheme(theme: ThemeId, mode: ModeId) {
  return api<{ theme: ThemeId; mode: ModeId }>("/api/theme", {
    method: "PUT",
    auth: true,
    body: JSON.stringify({ theme, mode }),
  });
}

export function applyTheme(theme: ThemeId, mode: ModeId = "clair") {
  document.documentElement.setAttribute("data-theme", theme);
  document.documentElement.setAttribute("data-mode", mode);
  document.documentElement.style.colorScheme =
    mode === "sombre" ? "dark" : "light";
}

export function login(username: string, password: string) {
  return api<{ token: string; username: string }>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
}

export function fetchDevis() {
  return api<{ devis: DevisItem[] }>("/api/devis", { auth: true });
}

export function updateDevisStatus(id: string, status: DevisStatus) {
  return api<{ devis: DevisItem }>(`/api/devis/${id}`, {
    method: "PATCH",
    auth: true,
    body: JSON.stringify({ status }),
  });
}

export function deleteDevis(id: string) {
  return api<{ ok: boolean }>(`/api/devis/${id}`, {
    method: "DELETE",
    auth: true,
  });
}

export type AvisItem = {
  id: string;
  name: string;
  message: string;
  stars: number;
  createdAt: string;
  source?: string;
};

export function fetchAvis() {
  return api<{ avis: AvisItem[] }>("/api/avis");
}

export function submitAvis(input: {
  name: string;
  message?: string;
  stars: number;
}) {
  return api<{ ok: boolean; avis: AvisItem }>("/api/avis", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function deleteAvis(id: string) {
  return api<{ ok: boolean }>(`/api/avis/${id}`, {
    method: "DELETE",
    auth: true,
  });
}

export type PelliculePhoto = {
  id: string;
  src: string;
  alt: string;
  createdAt: string;
};

export function fetchPellicule() {
  return api<{ photos: PelliculePhoto[] }>("/api/pellicule");
}

export function uploadPellicule(files: File[]) {
  const fd = new FormData();
  files.forEach((f) => fd.append("photos", f));
  return api<{
    ok: boolean;
    photos: PelliculePhoto[];
    pellicule: PelliculePhoto[];
  }>("/api/pellicule", {
    method: "POST",
    auth: true,
    body: fd,
  });
}

export function deletePellicule(id: string) {
  return api<{ ok: boolean }>(`/api/pellicule/${id}`, {
    method: "DELETE",
    auth: true,
  });
}

export type RdvStatus = "prevu" | "en_cours" | "termine" | "annule";

export type RendezVousItem = {
  id: string;
  title: string;
  client: string;
  phone: string;
  service: string;
  date: string;
  time: string;
  duration: number;
  notes: string;
  status: RdvStatus;
  createdAt: string;
  updatedAt?: string;
};

export function fetchRendezVous() {
  return api<{ rendezVous: RendezVousItem[] }>("/api/rendez-vous", {
    auth: true,
  });
}

export function createRendezVous(
  input: Omit<RendezVousItem, "id" | "createdAt" | "updatedAt">,
) {
  return api<{ ok: boolean; rendezVous: RendezVousItem }>("/api/rendez-vous", {
    method: "POST",
    auth: true,
    body: JSON.stringify(input),
  });
}

export function updateRendezVous(
  id: string,
  input: Omit<RendezVousItem, "id" | "createdAt" | "updatedAt">,
) {
  return api<{ ok: boolean; rendezVous: RendezVousItem }>(
    `/api/rendez-vous/${id}`,
    {
      method: "PATCH",
      auth: true,
      body: JSON.stringify(input),
    },
  );
}

export function deleteRendezVous(id: string) {
  return api<{ ok: boolean }>(`/api/rendez-vous/${id}`, {
    method: "DELETE",
    auth: true,
  });
}

export async function submitDevis(input: {
  prenom: string;
  name: string;
  email: string;
  phone: string;
  service: string;
  message: string;
  photos: File[];
}) {
  const fd = new FormData();
  fd.append("prenom", input.prenom);
  fd.append("name", input.name);
  fd.append("email", input.email);
  fd.append("phone", input.phone);
  fd.append("service", input.service);
  fd.append("message", input.message);
  input.photos.forEach((f) => fd.append("photos", f));
  return api<{ ok: boolean; devis: DevisItem }>("/api/devis", {
    method: "POST",
    body: fd,
  });
}
