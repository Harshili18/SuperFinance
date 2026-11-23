import { useQuery } from "@tanstack/react-query";
import {
  BarChart3,
  FileText,
  LayoutDashboard,
  LayoutGrid,
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

  const sidebar = (
    <>
      <div className="flex items-center gap-2 px-3 py-4">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-white text-[#063533]">
          <LayoutGrid className="size-4" />
        </span>
        <span className="min-w-0 leading-tight">
          <span className="block truncate text-sm font-extrabold tracking-tight">SUPERFINANCE</span>
          <span className="block text-[10px] uppercase tracking-[0.12em] text-sidebar-foreground/50">Finance & MIS</span>
        </span>
      </div>
      <nav className="flex-1 space-y-4 overflow-y-auto px-2 pb-3">
        {SECTIONS.map((section) => {
          const items = investor ? section.items.filter((i) => INVESTOR_PATHS.has(i.to)) : section.items;
          if (!items.length) return null;
          return (
            <div key={section.label}>
              <p className="mb-1 px-2.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-sidebar-foreground/40">
                {section.label}
              </p>
              <div className="space-y-0.5">
                {items.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    onClick={() => setMobile(false)}
                    className={({ isActive }) =>
                      `flex items-center gap-2 rounded-md px-2.5 py-2 text-[13px] font-medium ${
                        isActive
                          ? "bg-sidebar-accent text-sidebar-accent-foreground"
                          : "text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
                      }`
                    }
                  >
                    <item.icon size={16} className="shrink-0" />
                    <span className="truncate">{item.title}</span>
                  </NavLink>
                ))}
              </div>
            </div>
          );
        })}
      </nav>
      {!investor ? (
        <div className="border-t border-sidebar-border p-2">
          <NavLink
            to="/settings"
            onClick={() => setMobile(false)}
            className={({ isActive }) =>
              `flex items-center gap-2 rounded-md px-2.5 py-2 text-[13px] font-medium ${
                isActive
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
              }`
            }
          >
            <Settings size={16} className="shrink-0" />
            <span>Settings</span>
          </NavLink>
        </div>
      ) : null}
    </>
  );

  return (
    <div className="flex min-h-screen w-full bg-background">
      <aside className="sticky top-0 hidden h-screen w-[220px] shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground md:flex">
        {sidebar}
      </aside>
      {mobile ? (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setMobile(false)} />
          <aside className="relative flex h-full w-[220px] flex-col bg-sidebar text-sidebar-foreground">{sidebar}</aside>
        </div>
      ) : null}
      <div className="flex min-w-0 flex-1 flex-col overflow-x-hidden">
        <header className="sticky top-0 z-20 flex h-12 min-w-0 items-center gap-2 border-b border-border bg-card/95 px-3 backdrop-blur md:px-4">
          <button className="shrink-0 rounded-md p-1.5 text-muted-foreground md:hidden" onClick={() => setMobile(true)} aria-label="Open menu">
            <Menu size={16} />
          </button>
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search…"
              className="h-8 w-full max-w-[200px] rounded-md border border-input bg-transparent pl-8 pr-2 text-sm outline-none focus-visible:ring-1 focus-visible:ring-ring lg:max-w-xs"
            />
            {search?.results?.length ? (
              <div className="absolute z-30 mt-1 w-full max-w-md rounded-md border border-border bg-popover py-1 shadow-lg">
                {search.results.map((r) => (
                  <button
                    key={r.kind + r.id}
                    className="block w-full px-3 py-1.5 text-left text-sm hover:bg-muted"
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
                    <span className="text-[11px] uppercase text-muted-foreground">{r.kind}</span> {r.label}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          <FilterBar />
          <button onClick={toggleTheme} className="shrink-0 rounded-md p-1.5 text-muted-foreground hover:bg-muted" title="Theme">
            <Sun size={15} className="hidden dark:block" />
            <Moon size={15} className="dark:hidden" />
          </button>
          <div className="hidden min-w-0 max-w-[140px] text-right lg:block">
            <p className="truncate text-xs font-semibold">{me?.name || "Signed in"}</p>
            <p className="truncate text-[10px] uppercase tracking-[0.1em] text-muted-foreground">{(me?.role || "viewer").replace("_", " ")}</p>
          </div>
          <button
            onClick={logout}
            className="inline-flex h-7 shrink-0 items-center gap-1 rounded-md border border-input px-2 text-xs font-medium hover:bg-muted"
          >
            <LogOut size={13} />
            <span className="hidden sm:inline">Sign out</span>
          </button>
        </header>
        <main className="min-w-0 flex-1">
          <div className="min-w-0 space-y-4 p-3 md:p-5">
            <Outlet />
          </div>
        </main>
      </div>
      {mobile ? (
        <button className="fixed bottom-4 right-4 z-50 rounded-full bg-primary p-3 text-primary-foreground shadow md:hidden" onClick={() => setMobile(false)}>
          <X size={16} />
        </button>
      ) : null}
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
      <div className="min-w-0">
        <h1 className="truncate text-xl font-bold tracking-tight">{title}</h1>
        {subtitle ? <p className="mt-0.5 text-sm text-muted-foreground">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}
