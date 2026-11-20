import type { ComponentProps } from "react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

interface LoadingButtonProps extends ComponentProps<typeof Button> {
  /** Esta acción está en curso: spinner dentro del botón y no admite otro click. */
  loading?: boolean;
  /** Texto accesible del spinner */
  loadingLabel?: string;
}

/**
 * Botón de una acción que escribe datos: mientras `loading` queda deshabilitado con un spinner adentro. Se combina con `useAction`,
 * que además descarta el segundo click aunque llegue antes de que el botón se vuelva a dibujar.
 */
const LoadingButton = ({ loading = false, loadingLabel = "Procesando", disabled, children, ...props }: LoadingButtonProps) => (
  <Button {...props} disabled={disabled || loading} aria-busy={loading || undefined}>
    {loading && <Spinner aria-label={loadingLabel} />}
    {children}
  </Button>
);

export default LoadingButton;
