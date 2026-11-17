interface AfipEnvironmentBadgeProps {
  environment: string | null | undefined;
}

/** Etiqueta que distingue los comprobantes de homologación (pruebas) de los de producción. */
const AfipEnvironmentBadge = ({ environment }: AfipEnvironmentBadgeProps) => {
  if (environment === "produccion") {
    return (
      <span className="badge text-bg-success"
        title="Emitido en producción: tiene validez fiscal">
        Producción
      </span>
    );
  }

  // Cualquier otro valor se trata como homologación (nunca como válido fiscalmente)
  return (
    <span className="badge text-bg-warning"
      title="Emitido en el ambiente de pruebas de AFIP (homologación): no tiene validez fiscal">
      🧪 Homologación
    </span>
  );
};

export default AfipEnvironmentBadge;
