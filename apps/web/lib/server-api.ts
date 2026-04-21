/**
 * Base URL for server-side calls to the Express API.
 * Set `API_URL` in `.env` at the repo root, or duplicate it in `apps/web/.env.local` so `next dev` sees it.
 */
export function getServerApiBaseUrl(): string {
  const fromEnv =
    process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
  return fromEnv.replace(/\/$/, "");
}
