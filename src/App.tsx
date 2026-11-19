import { lazy, Suspense, useEffect, useState, type ReactNode } from "react";
import { Navigate, Route, Routes, useNavigate } from "react-router";
import Login from "./components/Login";
import { UNAUTHORIZED_EVENT } from "./services/apiClient";
import { hasAccessToken, logout } from "./services/authService";
import { hasBillingProfile } from "./services/billingProfileService";
import { Button } from "@/components/ui/button";
import LoadingBlock from "./components/LoadingBlock";
import StatusAlert from "./components/StatusAlert";

// Cada pantalla se descarga recién cuando se entra a ella: el login (lo primero que se ve) pesa poco.
const Dashboard = lazy(() => import("./components/Dashboard"));
const BillingProfile = lazy(() => import("./components/BillingProfile"));
const Customers = lazy(() => import("./components/Customers"));
const Invoices = lazy(() => import("./components/Invoices"));
const InvoiceSearch = lazy(() => import("./components/InvoiceSearch"));
const AuditLog = lazy(() => import("./components/AuditLog"));
const Trash = lazy(() => import("./components/Trash"));
const Settings = lazy(() => import("./components/Settings"));
const SalePoints = lazy(() => import("./components/SalePoints"));

type ProfileStatus = "checking" | "missing" | "ready" | "error";

const FullPageSpinner = () => (
  <div className="flex min-h-svh items-center justify-center">
    <LoadingBlock />
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
        <div className="mx-auto w-full max-w-lg space-y-4 px-4 py-12">
          <StatusAlert kind="error">No se pudo verificar tu perfil de facturación.</StatusAlert>
          <div className="flex gap-2">
            <Button type="button" onClick={retryCheck}>
              Reintentar
            </Button>
            <Button variant="outline" type="button" onClick={handleLogout}>
              Cerrar sesión
            </Button>
          </div>
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
      <div className="mx-auto w-full max-w-4xl space-y-4 px-4 py-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">
            Completá tu perfil de facturación
          </h1>
          <Button variant="outline" size="sm" type="button" onClick={handleLogout}>
            Cerrar sesión
          </Button>
        </div>
        <p className="text-muted-foreground">
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
    <Suspense fallback={<FullPageSpinner />}>
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
        <Route path="audit" element={<AuditLog />} />
        <Route path="trash" element={<Trash />} />
        <Route path="settings" element={<Settings />} />
        </Route>

        <Route path="*" element={<Navigate to={home} replace />} />
      </Routes>
    </Suspense>
  );
};

export default App;
