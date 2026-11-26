import { useQuery } from "@tanstack/react-query";
import {
  BarChart3,
  ChevronLeft,
  ChevronRight,
  FileText,
  LayoutDashboard,
  LogOut,
  Menu,
  Moon,
  Receipt,
  Search,
  Settings,
  ShoppingBag,
  Sun,
  Tent,
  TrendingUp,
  Wallet,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { api, type User } from "../lib/api";
import { FilterBar } from "./FilterBar";

const SECTIONS: { label: string; items: { to: string; title: string; icon: typeof LayoutDashboard }[] }[] = [
  {
    label: "Overview",
    items: [
      { to: "/overview", title: "Dashboard", icon: LayoutDashboard },
      { to: "/pnl", title: "Overall P&L", icon: BarChart3 },
      { to: "/mis", title: "MIS & Analytics", icon: TrendingUp },
    ],
  },
  {
    label: "Money",
    items: [
      { to: "/expenses", title: "Expenses", icon: Wallet },
      { to: "/revenue", title: "Revenue", icon: Receipt },
      { to: "/invoices", title: "Invoices", icon: FileText },
    ],
  },
  {
    label: "Operations",
    items: [
      { to: "/camps", title: "Camps", icon: Tent },
      { to: "/b2c", title: "B2C", icon: ShoppingBag },
    ],
  },
];

const INVESTOR_PATHS = new Set(["/overview", "/pnl", "/mis", "/camps", "/b2c"]);

export function AppShell() {
  const nav = useNavigate();
  const [q, setQ] = useState("");
  const [mobile, setMobile] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const { data: me } = useQuery({ queryKey: ["me"], queryFn: () => api<User>("/auth/me") });
  const { data: search } = useQuery({
    queryKey: ["search", q],
    queryFn: () => api<{ results: { kind: string; id: string; label: string }[] }>(`/search?q=${encodeURIComponent(q)}`),
    enabled: q.length >= 2,
  });

  useEffect(() => {
    if (me?.theme === "dark") document.documentElement.classList.add("dark");
    else document.documentElement.classList.remove("dark");
  }, [me?.theme]);

  async function toggleTheme() {
    const next = document.documentElement.classList.contains("dark") ? "light" : "dark";
    document.documentElement.classList.toggle("dark", next === "dark");
    await api("/auth/theme", { method: "POST", body: JSON.stringify({ theme: next }) });
  }

  const investor = me?.role === "investor";

  async function logout() {
    await api("/auth/logout", { method: "POST" });
    nav("/login");
  }

  const sidebarInner = (compact: boolean) => (
    <>
      <div className={`flex items-center gap-2.5 ${compact ? "justify-center px-2 py-5" : "px-4 py-5"}`}>
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground shadow-xs">
          S
        </span>
        {!compact ? (
          <span className="min-w-0 leading-tight">
            <span className="block truncate text-[15px] font-bold tracking-tight text-foreground">SuperFinance</span>
            <span className="block text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">SUPERSSHYFT</span>
          </span>
        ) : null}
      </div>

      <nav className="flex-1 space-y-5 overflow-y-auto px-3 pb-3">
        {SECTIONS.map((section) => {
          const items = investor ? section.items.filter((i) => INVESTOR_PATHS.has(i.to)) : section.items;
          if (!items.length) return null;
          return (
            <div key={section.label}>
              {!compact ? (
                <p className="mb-1.5 px-2.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/80">
                  {section.label}
                </p>
              ) : null}
              <div className="space-y-0.5">
                {items.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    title={item.title}
                    onClick={() => setMobile(false)}
                    className={({ isActive }) =>
                      `group relative flex items-center gap-2.5 rounded-xl px-2.5 py-2.5 text-[13px] font-medium transition ${
                        compact ? "justify-center" : ""
                      } ${
                        isActive
                          ? "bg-sidebar-accent text-sidebar-accent-foreground"
                          : "text-sidebar-foreground hover:bg-muted hover:text-foreground"
                      }`
                    }
                  >
                    {({ isActive }) => (
                      <>
                        {isActive && !compact ? (
                          <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-primary" />
                        ) : null}
                        <item.icon size={17} strokeWidth={1.75} className="shrink-0" />
                        {!compact ? <span className="truncate">{item.title}</span> : null}
                      </>
                    )}
                  </NavLink>
                ))}
              </div>
            </div>
          );
        })}
      </nav>

      <div className={`border-t border-sidebar-border ${compact ? "p-2" : "p-3"}`}>
        {!investor ? (
          <NavLink
            to="/settings"
            onClick={() => setMobile(false)}
            title="Settings"
            className={({ isActive }) =>
              `mb-1 flex items-center gap-2.5 rounded-xl px-2.5 py-2.5 text-[13px] font-medium transition ${
                compact ? "justify-center" : ""
              } ${
                isActive
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-foreground hover:bg-muted hover:text-foreground"
              }`
            }
          >
            <Settings size={17} strokeWidth={1.75} className="shrink-0" />
            {!compact ? <span>Settings</span> : null}
          </NavLink>
        ) : null}
        <button
          type="button"
          onClick={() => setCollapsed((v) => !v)}
          className={`hidden w-full items-center gap-2 rounded-xl px-2.5 py-2 text-[12px] font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground md:flex ${
            compact ? "justify-center" : ""
          }`}
        >
          {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
          {!compact ? <span>Collapse</span> : null}
        </button>
      </div>
    </>
  );

  return (
    <div className="flex min-h-screen w-full bg-background">
      <aside
        className={`sticky top-0 hidden h-screen shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-[width] duration-200 md:flex ${
          collapsed ? "w-[76px]" : "w-[240px]"
        }`}
      >
        {sidebarInner(collapsed)}
      </aside>

      {mobile ? (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-foreground/30 backdrop-blur-[2px]" onClick={() => setMobile(false)} />
          <aside className="relative flex h-full w-[250px] flex-col bg-sidebar text-sidebar-foreground shadow-soft">
            {sidebarInner(false)}
          </aside>
        </div>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col overflow-x-hidden">
        <header className="sticky top-0 z-20 flex h-14 min-w-0 items-center gap-2 border-b border-border/80 bg-card/90 px-3 backdrop-blur-md md:px-5">
          <button
            className="shrink-0 rounded-xl p-2 text-muted-foreground transition hover:bg-muted md:hidden"
            onClick={() => setMobile(true)}
            aria-label="Open menu"
          >
            <Menu size={16} />
          </button>

          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search camps, clients, invoices…"
              className="h-9 w-full max-w-[280px] rounded-xl border border-input bg-background pl-9 pr-3 text-sm outline-none transition placeholder:text-muted-foreground/70 focus-visible:border-primary/40 focus-visible:ring-2 focus-visible:ring-primary/15 lg:max-w-sm"
            />
            {search?.results?.length ? (
              <div className="absolute z-30 mt-1.5 w-full max-w-md overflow-hidden rounded-2xl border border-border bg-card py-1 shadow-soft">
                {search.results.map((r) => (
                  <button
                    key={r.kind + r.id}
                    className="block w-full px-3.5 py-2 text-left text-sm transition hover:bg-muted"
                    onClick={() => {
                      setQ("");
                      const map: Record<string, string> = {
                        camp: `/camps/${r.id}`,
                        client: "/revenue",
                        package: "/b2c",
                        partner: "/expenses",
                        employee: "/expenses",
                        clinician: "/camps",
                        vendor: "/expenses",
                        invoice: "/invoices",
                      };
                      nav(map[r.kind] || "/overview");
                    }}
                  >
                    <span className="mr-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{r.kind}</span>
                    {r.label}
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          <FilterBar />

          <button
            onClick={toggleTheme}
            className="shrink-0 rounded-xl p-2 text-muted-foreground transition hover:bg-muted hover:text-foreground"
            title="Theme"
          >
            <Sun size={15} className="hidden dark:block" />
            <Moon size={15} className="dark:hidden" />
          </button>

          <div className="hidden min-w-0 items-center gap-2.5 rounded-xl border border-border bg-background px-2.5 py-1.5 lg:flex">
            <span className="flex size-7 items-center justify-center rounded-full bg-primary/10 text-[11px] font-bold text-primary">
              {(me?.name || "U").slice(0, 1).toUpperCase()}
            </span>
            <div className="min-w-0 max-w-[120px] text-left">
              <p className="truncate text-xs font-semibold">{me?.name || "Signed in"}</p>
              <p className="truncate text-[10px] capitalize text-muted-foreground">{(me?.role || "viewer").replace("_", " ")}</p>
            </div>
          </div>

          <button onClick={logout} className="btn-secondary h-9 px-2.5 text-xs">
            <LogOut size={13} />
            <span className="hidden sm:inline">Sign out</span>
          </button>
        </header>

        <main className="min-w-0 flex-1">
          <div className="min-w-0 space-y-4 p-3 md:p-5 lg:px-6 lg:py-5">
            <Outlet />
          </div>
        </main>
      </div>

      {mobile ? (
        <button
          className="fixed bottom-4 right-4 z-50 rounded-full bg-primary p-3 text-primary-foreground shadow-soft md:hidden"
          onClick={() => setMobile(false)}
        >
          <X size={16} />
        </button>
      ) : null}
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-wrap items-end justify-between gap-2">
      <div className="min-w-0">
        <h1 className="truncate text-xl font-bold tracking-tight text-foreground md:text-2xl">{title}</h1>
        {subtitle ? <p className="mt-0.5 max-w-2xl text-sm text-muted-foreground">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}
