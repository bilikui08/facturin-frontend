import { Spinner } from "@/components/ui/spinner";

interface LoadingBlockProps {
  message?: string;
}

/** Indicador de carga centrado, para el interior de una tarjeta o una página. */
const LoadingBlock = ({ message }: LoadingBlockProps) => (
  <div className="flex flex-col items-center justify-center gap-3 p-10 text-muted-foreground">
    <Spinner aria-label="Cargando" className="size-6 text-primary" />
    {message && <p className="text-sm">{message}</p>}
  </div>
);

export default LoadingBlock;
