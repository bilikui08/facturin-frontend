import type { ReactNode } from "react";
import { CircleAlert, CircleCheck } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { cn } from "@/lib/utils";

interface StatusAlertProps {
  kind: "error" | "success";
  className?: string;
  children: ReactNode;
}

/** Mensaje de error o de éxito para mostrar arriba de un formulario o listado. */
const StatusAlert = ({ kind, className, children }: StatusAlertProps) => (
  <Alert variant={kind === "error" ? "destructive" : "success"} className={cn(className)}>
    {kind === "error" ? <CircleAlert /> : <CircleCheck />}
    <AlertDescription>{children}</AlertDescription>
  </Alert>
);

export default StatusAlert;
