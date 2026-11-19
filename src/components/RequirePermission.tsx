import type { ReactNode } from "react";
import { Lock } from "lucide-react";
import { useAccess } from "../hooks/useAccess";

interface RequirePermissionProps {
  /** Alcanza con uno de estos permisos */
  any: readonly string[];
  children: ReactNode;
}

/** Pantalla sin permiso: se muestra en lugar del contenido (el servidor también lo rechazaría con un 403). */
export const NoPermission = () => (
  <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed p-12 text-center text-muted-foreground" role="status">
    <Lock className="size-8 opacity-50" aria-hidden="true" />
    <p className="font-medium text-foreground">No tenés permiso para ver esta pantalla</p>
    <p className="text-sm">Pedile a la persona que administra tu empresa que te lo habilite.</p>
  </div>
);

const RequirePermission = ({ any, children }: RequirePermissionProps) => {
  const { can } = useAccess();

  return any.length === 0 || can(...any) ? <>{children}</> : <NoPermission />;
};

export default RequirePermission;
