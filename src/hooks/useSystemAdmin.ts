import { useEffect, useState } from "react";
import { getSystemRoles } from "../services/organizationService";

/** ¿Es administradora del sistema (rol global `admin` de auth-api)? false mientras carga o si no se puede saber. */
export const useSystemAdmin = (): boolean => {
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    const controller = new AbortController();

    getSystemRoles(controller.signal)
      .then((roles) => setIsAdmin(roles.includes("admin")))
      .catch(() => setIsAdmin(false));

    return () => controller.abort();
  }, []);

  return isAdmin;
};
