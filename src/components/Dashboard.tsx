import { useEffect } from "react";
import { NavLink, Outlet, useLocation } from "react-router";
import logo from "../assets/admin-lte/v4.9.1/assets/img/AdminLTELogo.png";

const sections = [
  { path: "invoices", label: "Facturar", icon: "$" },
  { path: "invoices-list", label: "Comprobantes emitidos", icon: "L" },
  { path: "customers", label: "Clientes", icon: "C" },
  { path: "sale-points", label: "Puntos de venta", icon: "P" },
  { path: "billing-profile", label: "Datos de facturación", icon: "F" },
];

interface DashboardProps {
  onLogout: () => void;
}

const Dashboard = ({ onLogout }: DashboardProps) => {
  const { pathname } = useLocation();
  const activeSectionLabel = sections.find(
    (section) => pathname.endsWith(`/${section.path}`),
  )?.label ?? "Dashboard";

  useEffect(() => {
    const previousClassName = document.body.className;
    document.body.className = "layout-fixed sidebar-expand-lg bg-body-tertiary";

    return () => {
      document.body.className = previousClassName;
    };
  }, []);

  return (
    <div className="app-wrapper">
      <nav className="app-header navbar navbar-expand bg-body">
        <div className="container-fluid">
          <ul className="navbar-nav">
            <li className="nav-item">
              <button
                aria-label="Abrir o cerrar menú"
                className="nav-link border-0 bg-transparent"
                data-lte-toggle="sidebar"
                type="button"
              >
                <span className="fs-5" aria-hidden="true">☰</span>
              </button>
            </li>
            <li className="nav-item d-none d-md-block">
              <span className="nav-link fw-semibold">Panel de administración</span>
            </li>
          </ul>
          <ul className="navbar-nav ms-auto">
            <li className="nav-item">
              <button className="btn btn-outline-danger btn-sm" type="button" onClick={onLogout}>
                Cerrar sesión
              </button>
            </li>
          </ul>
        </div>
      </nav>

      <aside className="app-sidebar bg-body-secondary shadow" data-bs-theme="dark">
        <div className="sidebar-brand">
          <NavLink
            className="brand-link border-0 bg-transparent w-100"
            to="/dashboard/invoices"
          >
            <img className="brand-image opacity-75 shadow" src={logo} alt="" />
            <span className="brand-text fw-light">Facturín</span>
          </NavLink>
        </div>
        <div className="sidebar-wrapper">
          <nav className="mt-2" aria-label="Navegación principal">
            <ul className="nav sidebar-menu flex-column" role="menu">
              {sections.map((section) => (
                <li className="nav-item" key={section.path}>
                  <NavLink
                    className={({ isActive }) =>
                      `nav-link w-100 text-start ${isActive ? "active" : ""}`
                    }
                    to={section.path}
                  >
                    <span className="nav-icon facturin-nav-icon" aria-hidden="true">
                      {section.icon}
                    </span>
                    <p>{section.label}</p>
                  </NavLink>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      </aside>

      <main className="app-main">
        <div className="app-content-header">
          <div className="container-fluid">
            <div className="row align-items-center">
              <div className="col-sm-6">
                <h1 className="mb-0 fs-3">{activeSectionLabel}</h1>
              </div>
              <div className="col-sm-6 d-none d-sm-block">
                <ol className="breadcrumb float-sm-end mb-0">
                  <li className="breadcrumb-item">Facturín</li>
                  <li className="breadcrumb-item active" aria-current="page">
                    {activeSectionLabel}
                  </li>
                </ol>
              </div>
            </div>
          </div>
        </div>
        <div className="app-content">
          <div className="container-fluid pb-4">
            <Outlet />
          </div>
        </div>
      </main>

      <footer className="app-footer">
        <strong>Facturín</strong>
        <span className="ms-2 text-secondary">Gestión simple de facturación.</span>
      </footer>
    </div>
  );
};

export default Dashboard;
