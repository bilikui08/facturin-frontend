import { useEffect, useState, type ReactNode } from "react";
import { Navigate, Route, Routes, useNavigate } from "react-router";
import Dashboard from "./components/Dashboard";
import BillingProfile from "./components/BillingProfile";
import Customers from "./components/Customers";
import Invoices from "./components/Invoices";
import InvoiceSearch from "./components/InvoiceSearch";
import Login from "./components/Login";
import SalePoints from "./components/SalePoints";
import { UNAUTHORIZED_EVENT } from "./services/apiClient";
import { hasAccessToken, logout } from "./services/authService";
import { hasBillingProfile } from "./services/billingProfileService";

type ProfileStatus = "checking" | "missing" | "ready" | "error";

const FullPageSpinner = () => (
  <div className="d-flex vh-100 align-items-center justify-content-center">
    <div className="spinner-border text-primary" role="status">
      <span className="visually-hidden">Cargando...</span>
    </div>
  </div>
);

const App = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(hasAccessToken);
  const [profileStatus, setProfileStatus] = useState<ProfileStatus>("checking");
  const [checkAttempt, setCheckAttempt] = useState(0);
  const navigate = useNavigate();

  const handleLoginSuccess = () => {
    setProfileStatus("checking");
    setIsAuthenticated(true);
    navigate("/dashboard/invoices", { replace: true });
  };

  const handleLogout = () => {
    logout();
    setIsAuthenticated(false);
    navigate("/", { replace: true });
  };

  const retryCheck = () => {
    setProfileStatus("checking");
    setCheckAttempt((n) => n + 1);
  };

  useEffect(() => {
    const onUnauthorized = () => {
      logout();
      setIsAuthenticated(false);
      navigate("/", { replace: true });
    };
    window.addEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
  }, [navigate]);

  // Al estar autenticado, verifica si el usuario tiene perfil de facturación.
  useEffect(() => {
    if (!isAuthenticated) return;
    let isCurrent = true;

    hasBillingProfile()
      .then((exists) => {
        if (isCurrent) setProfileStatus(exists ? "ready" : "missing");
      })
      .catch(() => {
        if (isCurrent) setProfileStatus("error");
      });

    return () => {
      isCurrent = false;
    };
  }, [isAuthenticated, checkAttempt]);

  const home = !isAuthenticated
    ? "/"
    : profileStatus === "missing"
      ? "/billing-setup"
      : "/dashboard/invoices";

  const requireProfile = (element: ReactNode) => {
    if (!isAuthenticated) return <Navigate to="/" replace />;
    if (profileStatus === "checking") return <FullPageSpinner />;
    if (profileStatus === "missing") {
      return <Navigate to="/billing-setup" replace />;
    }
    if (profileStatus === "error") {
      return (
        <div className="container py-5" style={{ maxWidth: 560 }}>
          <div className="alert alert-danger">
            No se pudo verificar tu perfil de facturación.
          </div>
          <button className="btn btn-primary me-2" type="button" onClick={retryCheck}>
            Reintentar
          </button>
          <button className="btn btn-outline-secondary" type="button" onClick={handleLogout}>
            Cerrar sesión
          </button>
        </div>
      );
    }
    return element;
  };

  const setupScreen = () => {
    if (!isAuthenticated) return <Navigate to="/" replace />;
    if (profileStatus === "checking") return <FullPageSpinner />;
    if (profileStatus === "ready") {
      return <Navigate to="/dashboard/invoices" replace />;
    }
    return (
      <div className="container py-4" style={{ maxWidth: 900 }}>
        <div className="d-flex justify-content-between align-items-center mb-3">
          <h1 className="h3 mb-0">Completá tu perfil de facturación</h1>
          <button className="btn btn-outline-danger btn-sm" type="button" onClick={handleLogout}>
            Cerrar sesión
          </button>
        </div>
        <p className="text-secondary">
          Para empezar a facturar primero necesitamos tus datos fiscales.
        </p>
        <BillingProfile
          onSaved={() => {
            setProfileStatus("ready");
            navigate("/dashboard/invoices", { replace: true });
          }}
        />
      </div>
    );
  };

  return (
    <Routes>
      <Route
        path="/"
        element={
          isAuthenticated ? (
            <Navigate to={home} replace />
          ) : (
            <Login onLoginSuccess={handleLoginSuccess} />
          )
        }
      />

      <Route path="/billing-setup" element={setupScreen()} />

      <Route
        path="/dashboard"
        element={requireProfile(<Dashboard onLogout={handleLogout} />)}
      >
        <Route index element={<Navigate to="invoices" replace />} />
        <Route path="invoices" element={<Invoices />} />
        <Route path="invoices-list" element={<InvoiceSearch />} />
        <Route path="customers" element={<Customers />} />
        <Route path="sale-points" element={<SalePoints />} />
        <Route path="billing-profile" element={<BillingProfile />} />
      </Route>

      <Route path="*" element={<Navigate to={home} replace />} />
    </Routes>
  );
};

export default App;
