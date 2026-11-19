import { lazy, Suspense, useEffect, useState, type ReactNode } from "react";
import { Navigate, Route, Routes, useNavigate } from "react-router";
import AcceptInvitation from "./components/AcceptInvitation";
import ForgotPassword from "./components/ForgotPassword";
import ResetPassword from "./components/ResetPassword";
import Login from "./components/Login";
import { UNAUTHORIZED_EVENT } from "./services/apiClient";
import { hasAccessToken, logout } from "./services/authService";
import { hasBillingProfile } from "./services/billingProfileService";
import { Button } from "@/components/ui/button";
import LoadingBlock from "./components/LoadingBlock";
import StatusAlert from "./components/StatusAlert";
import CompanySwitcher from "./components/CompanySwitcher";
import RequirePermission from "./components/RequirePermission";
import { useAccess } from "./hooks/useAccess";
import { SECTION_PERMISSIONS } from "./config/permissions";
import { firstAllowedSection, readAccess } from "./services/access";

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
const Team = lazy(() => import("./components/Team"));
const Companies = lazy(() => import("./components/Companies"));
const System = lazy(() => import("./components/System"));
const Roles = lazy(() => import("./components/Roles"));
const EmailTemplates = lazy(() => import("./components/EmailTemplates"));

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
  const access = useAccess();
  // A dónde se entra: la primera pantalla que la persona puede usar (no todas pueden facturar)
  const homeSection = firstAllowedSection(access);
  const homeDashboard = `/dashboard/${homeSection}`;

  const handleLoginSuccess = () => {
    setProfileStatus("checking");
    setIsAuthenticated(true);
    navigate(`/dashboard/${firstAllowedSection(readAccess())}`, { replace: true });
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
      : homeDashboard;

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
      return <Navigate to={homeDashboard} replace />;
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
        {/* Una empresa nueva todavía no tiene perfil: desde acá se puede volver a otra empresa */}
        <div className="max-w-xs">
          <CompanySwitcher />
        </div>
        <BillingProfile
          onSaved={() => {
            setProfileStatus("ready");
            navigate(homeDashboard, { replace: true });
          }}
        />
      </div>
    );
  };

  /** Pantalla que exige permisos: sin ellos se muestra el aviso en lugar del contenido. */
  const guard = (section: keyof typeof SECTION_PERMISSIONS, element: ReactNode) => (
    <RequirePermission any={SECTION_PERMISSIONS[section]}>{element}</RequirePermission>
  );

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

        {/* Pública: a ella llega el enlace del email de invitación (no hay registro abierto) */}
        <Route path="/accept-invitation" element={<AcceptInvitation onAccepted={handleLoginSuccess} />} />

        {/* Públicas: recuperar la contraseña (el enlace del email lleva a /reset-password) */}
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />

        <Route path="/billing-setup" element={setupScreen()} />

        <Route
          path="/dashboard"
          element={requireProfile(<Dashboard onLogout={handleLogout} />)}
        >
          <Route index element={<Navigate to={homeSection} replace />} />
          <Route path="invoices" element={guard("invoices", <Invoices />)} />
          <Route path="invoices-list" element={guard("invoices-list", <InvoiceSearch />)} />
          <Route path="customers" element={guard("customers", <Customers />)} />
          <Route path="sale-points" element={guard("sale-points", <SalePoints />)} />
          <Route path="billing-profile" element={guard("billing-profile", <BillingProfile />)} />
          <Route path="audit" element={<AuditLog />} />
          <Route path="trash" element={guard("trash", <Trash />)} />
          <Route path="settings" element={<Settings />} />
          <Route path="team" element={guard("team", <Team />)} />
          <Route path="companies" element={<Companies />} />
          <Route path="system" element={<System />} />
          <Route path="roles" element={<Roles />} />
          <Route path="emails" element={<EmailTemplates />} />
        </Route>

        <Route path="*" element={<Navigate to={home} replace />} />
      </Routes>
    </Suspense>
  );
};

export default App;
