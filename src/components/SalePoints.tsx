import CrudSection from "./CrudSection";
import type { FieldConfig } from "../types/crud";

const salePointFields = [
  {
    name: "number",
    label: "Número",
    type: "number",
    required: true,
    placeholder: "Ej.: 1",
  },
  { name: "name", label: "Nombre", required: true },
] satisfies FieldConfig[];

const SalePoints = () => (
  <CrudSection
    title="Puntos de venta"
    singularName="Punto de venta"
    endpoint="/sale-points"
    fields={salePointFields}
  />
);

export default SalePoints;
