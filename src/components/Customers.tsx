import CrudSection from "./CrudSection";
import type { FieldConfig } from "../types/crud";

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
    columnClass: "col-12",
  },
] satisfies FieldConfig[];

const Customers = () => (
  <CrudSection
    title="Clientes"
    singularName="Cliente"
    endpoint="/customers"
    fields={customerFields}
  />
);

export default Customers;
