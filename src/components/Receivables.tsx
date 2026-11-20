import { useState } from "react";
import { P } from "../config/permissions";
import { useAccess } from "../hooks/useAccess";
import { getOpening } from "../services/receivablesService";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import LoadingBlock from "./LoadingBlock";
import StatusAlert from "./StatusAlert";
import { useQuery } from "./useQuery";
import PaymentsPanel from "./receivables/PaymentsPanel";
import ReceivablesOpening from "./receivables/ReceivablesOpening";

/**
 * Cuenta corriente de clientes. Mientras la apertura no está confirmada es lo único que se muestra; confirmada, aparecen los cobros
 * (y la apertura queda como consulta). Estado de cuenta por cliente se suma en la próxima versión.
 */
const Receivables = () => {
  const { can } = useAccess();
  const [version, setVersion] = useState(0);
  const [tab, setTab] = useState("payments");
  const { data: state, loading, error } = useQuery((signal) => getOpening(signal), [version], "No se pudo cargar la cuenta corriente");

  if (loading && !state) return <LoadingBlock />;
  if (error && !state) return <StatusAlert kind="error">{error}</StatusAlert>;

  const opening = state?.opening ?? null;
  const confirmed = opening?.status === "confirmed";

  // Sin apertura confirmada no hay cobros: se completa primero la apertura
  if (!confirmed || !can(P.paymentView, P.paymentManage)) return <ReceivablesOpening onChanged={() => setVersion((n) => n + 1)} />;

  return (
    <Tabs value={tab} onValueChange={setTab}>
      <TabsList aria-label="Secciones de la cuenta corriente">
        <TabsTrigger value="payments">Cobros</TabsTrigger>
        <TabsTrigger value="opening">Apertura</TabsTrigger>
      </TabsList>
      <TabsContent value="payments">
        <PaymentsPanel openingDate={opening.opening_date} />
      </TabsContent>
      <TabsContent value="opening">
        <ReceivablesOpening onChanged={() => setVersion((n) => n + 1)} />
      </TabsContent>
    </Tabs>
  );
};

export default Receivables;
