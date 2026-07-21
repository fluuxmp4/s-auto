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
