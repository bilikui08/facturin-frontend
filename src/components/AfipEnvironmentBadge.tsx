import { FlaskConical } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface AfipEnvironmentBadgeProps {
  environment: string | null | undefined;
}

/** Etiqueta que distingue los comprobantes de homologación (pruebas) de los de producción. */
const AfipEnvironmentBadge = ({ environment }: AfipEnvironmentBadgeProps) => {
  if (environment === "produccion") {
    return (
      <Badge variant="success" title="Emitido en producción: tiene validez fiscal">
        Producción
      </Badge>
    );
  }

  // Cualquier otro valor se trata como homologación (nunca como válido fiscalmente)
  return (
    <Badge
      variant="warning"
      title="Emitido en el ambiente de pruebas de AFIP (homologación): no tiene validez fiscal"
    >
      <FlaskConical aria-hidden="true" />
      Homologación
    </Badge>
  );
};

export default AfipEnvironmentBadge;
