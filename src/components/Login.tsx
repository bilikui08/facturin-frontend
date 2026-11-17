import { useEffect, useState, type FormEvent } from "react";
import { login } from "../services/authService";

interface LoginProps {
  onLoginSuccess: () => void;
}

const Login = ({ onLoginSuccess }: LoginProps) => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(false);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const previousClassName = document.body.className;
    document.body.className = "login-page bg-body-secondary";

    return () => {
      document.body.className = previousClassName;
    };
  }, []);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    try {
      await login(email, password, remember);
      onLoginSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ocurrió un error inesperado");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="login-box">
      <h1 className="login-logo">
        <span>
          <b>Factur</b>ín
        </span>
      </h1>
      <div className="card shadow-sm">
        <div className="card-body login-card-body">
          <p className="login-box-msg">Ingresá para administrar tu facturación</p>

          <form onSubmit={handleSubmit}>
            <label htmlFor="email" className="visually-hidden">Email</label>
            <div className="input-group mb-3">
              <input
                type="email"
                className="form-control"
                id="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="nombre@ejemplo.com"
                required
              />
              <span className="input-group-text" aria-hidden="true">@</span>
            </div>

            <label htmlFor="password" className="visually-hidden">Contraseña</label>
            <div className="input-group mb-3">
              <input
                type="password"
                className="form-control"
                id="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Ingrese su contraseña"
                required
              />
              <span className="input-group-text" aria-hidden="true">●</span>
            </div>

            <div className="form-check mb-3">
              <input
                className="form-check-input"
                type="checkbox"
                id="remember"
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
              />
              <label className="form-check-label" htmlFor="remember">
                Recordarme
              </label>
            </div>

            {error && (
              <div className="alert alert-danger py-2" role="alert">
                {error}
              </div>
            )}

            <div className="d-grid">
              <button type="submit" className="btn btn-primary" disabled={isLoading}>
                {isLoading ? "Ingresando..." : "Ingresar"}
              </button>
            </div>
          </form>
        </div>
      </div>
      <p className="text-center text-secondary small mt-3 mb-0">
        Panel de gestión de Facturín
      </p>
    </main>
  );
}

export default Login;
