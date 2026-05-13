/** Typed JSON fetch with a readable Error message for React Query / UI. */
export async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, cache: "no-store" });
  const text = await res.text();
  if (!res.ok) {
    let msg = `${res.status} ${res.statusText}`;
    try {
      const j = JSON.parse(text) as { error?: string };
      if (typeof j.error === "string" && j.error.length > 0) msg = j.error;
    } catch {
      if (text.trim()) msg = text.trim().slice(0, 200);
    }
    throw new Error(msg);
  }
  return JSON.parse(text) as T;
}
