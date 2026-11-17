import { apiRequest } from "./apiClient";
import type { FormValues, ResourceId } from "../types/crud";

export const getResources = <T = unknown>(endpoint: string): Promise<T> =>
  apiRequest<T>(endpoint);

export const getResource = <T = unknown>(
  endpoint: string,
  id: ResourceId,
): Promise<T> => apiRequest<T>(`${endpoint}/${id}`);

export const createResource = <T = unknown>(
  endpoint: string,
  values: FormValues,
): Promise<T> =>
  apiRequest<T>(endpoint, {
    method: "POST",
    body: JSON.stringify(values),
  });

export const updateResource = <T = unknown>(
  endpoint: string,
  id: ResourceId,
  values: FormValues,
): Promise<T> =>
  apiRequest<T>(`${endpoint}/${id}`, {
    method: "PUT",
    body: JSON.stringify(values),
  });

export const deleteResource = (
  endpoint: string,
  id: ResourceId,
): Promise<unknown> =>
  apiRequest(`${endpoint}/${id}`, { method: "DELETE" });
