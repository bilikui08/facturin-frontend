type Environment = "local" | "production";

interface ApiUrls {
  auth: string;
  billing: string;
}

const environments: Record<Environment, ApiUrls> = {
  local: {
    auth: "http://localhost:8080/auth/api",
    billing: "http://localhost:8083/api",
  },
  production: {
    auth: "https://auth.gustavoluis.me/api",
    billing: "https://billing.gustavoluis.me/api",
  },
};

// Entorno: VITE_APP_ENV si está definido; si no, se deduce del modo de Vite
// (`vite build` => production, `vite` / `vite --mode local` => local).
const resolveEnvironment = (): Environment => {
  const explicit = import.meta.env.VITE_APP_ENV;
  if (explicit === "local" || explicit === "production") return explicit;
  return import.meta.env.MODE === "production" ? "production" : "local";
};

export const APP_ENV = resolveEnvironment();

// Cada URL se puede pisar individualmente con VITE_AUTH_API_URL / VITE_BILLING_API_URL.
export const AUTH_API_URL: string =
  import.meta.env.VITE_AUTH_API_URL ?? environments[APP_ENV].auth;
export const BILLING_API_URL: string =
  import.meta.env.VITE_BILLING_API_URL ?? environments[APP_ENV].billing;
