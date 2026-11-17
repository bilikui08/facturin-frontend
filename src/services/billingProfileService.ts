import { ApiError, apiRequest } from "./apiClient";

const hasId = (value: unknown): boolean =>
  typeof value === "object" &&
  value !== null &&
  (typeof (value as { id?: unknown }).id === "string" ||
    typeof (value as { id?: unknown }).id === "number");

// true si el usuario logueado ya tiene perfil de facturación.
export const hasBillingProfile = async (): Promise<boolean> => {
  try {
    const data = await apiRequest("/user-billing-profile");
    return Array.isArray(data) ? data.some(hasId) : hasId(data);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return false;
    throw err;
  }
};
