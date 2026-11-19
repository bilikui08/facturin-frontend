import { useEffect, useRef, useState } from "react";
import { RECAPTCHA_SITE_KEY } from "../config/api";

interface Grecaptcha {
  render: (container: HTMLElement, options: Record<string, unknown>) => number;
  reset: (widgetId?: number) => void;
}

declare global {
  interface Window {
    grecaptcha?: Grecaptcha;
    __onRecaptchaLoaded?: () => void;
  }
}

let loader: Promise<void> | null = null;

/** Carga el script de Google una sola vez (si falla, el próximo intento vuelve a probar). */
const loadScript = (): Promise<void> => {
  if (window.grecaptcha?.render) return Promise.resolve();

  loader ??= new Promise<void>((resolve, reject) => {
    window.__onRecaptchaLoaded = () => resolve();
    const script = document.createElement("script");
    script.src = "https://www.google.com/recaptcha/api.js?onload=__onRecaptchaLoaded&render=explicit";
    script.async = true;
    script.defer = true;
    script.onerror = () => {
      loader = null;
      script.remove();
      reject(new Error("load"));
    };
    document.head.appendChild(script);
  });

  return loader;
};

interface RecaptchaProps {
  /** Recibe la respuesta del widget, o null cuando vence o se reinicia */
  onChange: (token: string | null) => void;
  /** Al cambiar este número el widget se reinicia (cada respuesta se puede usar una sola vez: tras un intento hay que pedir otra) */
  resetKey?: number;
}

/** Casilla "No soy un robot" (reCAPTCHA v2). La respuesta la verifica auth-api: acá solo se obtiene. */
const Recaptcha = ({ onChange, resetKey = 0 }: RecaptchaProps) => {
  const container = useRef<HTMLDivElement>(null);
  const widgetId = useRef<number | null>(null);
  const onChangeRef = useRef(onChange);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    onChangeRef.current = onChange;
  });

  useEffect(() => {
    let cancelled = false;

    loadScript()
      .then(() => {
        if (cancelled || !container.current || widgetId.current !== null || !window.grecaptcha) return;

        widgetId.current = window.grecaptcha.render(container.current, {
          sitekey: RECAPTCHA_SITE_KEY,
          theme: document.documentElement.classList.contains("dark") ? "dark" : "light",
          callback: (token: string) => onChangeRef.current(token),
          "expired-callback": () => onChangeRef.current(null),
          "error-callback": () => onChangeRef.current(null),
        });
        setFailed(false);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });

    return () => {
      cancelled = true;
    };
  }, [attempt]);

  useEffect(() => {
    if (resetKey > 0 && widgetId.current !== null) {
      window.grecaptcha?.reset(widgetId.current);
      onChangeRef.current(null);
    }
  }, [resetKey]);

  return (
    <div className="space-y-2">
      <div ref={container} className="flex justify-center" aria-label="Verificación anti robots" />
      {failed && (
        <p className="text-center text-sm text-destructive" role="alert">
          No se pudo cargar la verificación anti robots. Revisá tu conexión y{" "}
          <button type="button" className="underline underline-offset-4" onClick={() => setAttempt((n) => n + 1)}>
            volvé a intentar
          </button>
          .
        </p>
      )}
    </div>
  );
};

export default Recaptcha;
