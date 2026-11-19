import { useEffect } from "react";

/** Reemplazo de <Recaptcha/> en los tests: una casilla que, al tildarla, entrega una respuesta; al reiniciarse (resetKey) se destilda. */
const RecaptchaMock = ({ onChange, resetKey = 0 }: { onChange: (token: string | null) => void; resetKey?: number }) => {
  useEffect(() => {
    onChange(null);
  }, [resetKey, onChange]);

  return <input type="checkbox" aria-label="No soy un robot" onChange={(e) => onChange(e.target.checked ? "captcha-ok" : null)} key={resetKey} />;
};

export default RecaptchaMock;
