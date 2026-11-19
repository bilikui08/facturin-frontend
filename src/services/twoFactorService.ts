import { call } from "./authApiCall";

export interface TwoFactorStatus {
  /** Activa y configurada: al ingresar se pide el código */
  enabled: boolean;
  confirmed: boolean;
  recovery_codes_remaining: number;
}

export interface TwoFactorSetupData {
  secret: string;
  uri: string;
}

export const getTwoFactorStatus = (signal?: AbortSignal): Promise<TwoFactorStatus> => call<TwoFactorStatus>("/auth/two-factor", "GET", undefined, signal);

/** Volver a activarla: prepara un secreto nuevo (no queda activa hasta confirmar un código). */
export const startTwoFactorSetup = (): Promise<TwoFactorSetupData> => call<TwoFactorSetupData>("/auth/two-factor/enable", "POST");

/** Confirma con el primer código: la activa y devuelve los códigos de recuperación (única vez que se ven). */
export const confirmTwoFactorSetup = (code: string): Promise<{ recovery_codes: string[] } & TwoFactorStatus> =>
  call("/auth/two-factor/enable/confirm", "POST", { code });

export const disableTwoFactor = (password: string, code: string): Promise<TwoFactorStatus> => call("/auth/two-factor/disable", "POST", { password, code });

export const regenerateRecoveryCodes = async (code: string): Promise<string[]> => {
  const data = await call<{ recovery_codes: string[] }>("/auth/two-factor/recovery-codes", "POST", { code });

  return data.recovery_codes;
};
