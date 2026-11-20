import { Link } from "react-router";
import { Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import CrudSection from "./CrudSection";
import type { FieldConfig } from "../types/crud";
import { P } from "../config/permissions";
import { useAccess } from "../hooks/useAccess";

const customerFields = [
  { name: "name", label: "Nombre o razón social", required: true },
  {
    name: "document_type_id",
    label: "Tipo de documento",
    required: true,
    optionsEndpoint: "/document-types",
  },
  { name: "document_number", label: "Número de documento", required: true },
  {
    name: "tax_condition_id",
    label: "Condición frente al IVA",
    required: true,
    optionsEndpoint: "/tax-conditions",
  },
  {
    name: "address",
    label: "Domicilio",
    fullWidth: true,
  },
] satisfies FieldConfig[];

const Customers = () => {
  const { can } = useAccess();

  return (
    <CrudSection
      title="Clientes"
      singularName="Cliente"
      endpoint="/customers"
      fields={customerFields}
      readOnly={!can(P.customerManage)}
      // Exportar pide poder ver clientes (poder emitir comprobantes no alcanza: eso es solo para elegir a quién facturar)
      // Atajo a la cuenta corriente del cliente (solo para quien puede ver cobros)
      rowActions={
        can(P.paymentView, P.paymentManage)
          ? (item) => (
              <Button asChild variant="outline" size="sm">
                <Link to={`/dashboard/receivables/customer/${item.id}`} aria-label={`Cuenta corriente de ${String(item.name ?? item.id)}`} title="Cuenta corriente">
                  <Wallet />
                  CC
                </Link>
              </Button>
            )
          : undefined
      }
      exportPath={can(P.customerView) || can(P.customerManage) ? "/customers/export" : undefined}
    />
  );
};

export default Customers;
