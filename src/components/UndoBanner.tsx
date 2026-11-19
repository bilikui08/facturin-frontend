import { Link } from "react-router";
import { Trash2, Undo2, X } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

interface UndoBannerProps {
  /** "Cliente" */
  singularName: string;
  /** "Cliente SA" */
  label: string;
  undoing: boolean;
  onUndo: () => void;
  onDismiss: () => void;
}

/** Aviso al dar de baja un registro: pasó a la Papelera, con el botón para deshacerlo al momento. */
const UndoBanner = ({ singularName, label, undoing, onUndo, onDismiss }: UndoBannerProps) => (
  <Alert variant="warning">
    <Trash2 aria-hidden="true" />
    <AlertDescription>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span>
          {singularName} «{label}» eliminado. Está en la Papelera: podés restaurarlo desde ahí.
        </span>
        <div className="ml-auto flex items-center gap-1">
          <Button variant="outline" size="sm" type="button" disabled={undoing} onClick={onUndo}>
            {undoing ? <Spinner aria-label="Deshaciendo" /> : <Undo2 />}
            Deshacer
          </Button>
          <Button variant="ghost" size="sm" asChild>
            <Link to="/dashboard/trash">Ver papelera</Link>
          </Button>
          <Button variant="ghost" size="icon" type="button" aria-label="Cerrar aviso" onClick={onDismiss}>
            <X />
          </Button>
        </div>
      </div>
    </AlertDescription>
  </Alert>
);

export default UndoBanner;
