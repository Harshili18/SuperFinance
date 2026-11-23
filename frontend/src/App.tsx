import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "./components/AppShell";
import { FilterCtx, type FilterState } from "./lib/filters";
import { Landing } from "./pages/Landing";
import { Login } from "./pages/Login";
import { Overview } from "./pages/Overview";
import { Expenses } from "./pages/Expenses";
import { Camps } from "./pages/Camps";
import { CampDetail } from "./pages/CampDetail";
import { B2C } from "./pages/B2C";
import { ClientDetail } from "./pages/Clients";
import {
  Invoices,
  Revenue,
  Reports as PnLPage,
  MIS,
  SettingsPage,
  Documents,
} from "./pages/More";

const qc = new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } } });

export default function App() {
  const [filters, setFilters] = useState<FilterState>({ period: "year" });
  return (
    <QueryClientProvider client={qc}>
      <FilterCtx.Provider value={{ filters, setFilters }}>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/login" element={<Login />} />
            <Route element={<AppShell />}>
              <Route path="overview" element={<Overview />} />
              <Route path="pnl" element={<PnLPage />} />
              <Route path="mis" element={<MIS />} />
              <Route path="expenses" element={<Expenses />} />
              <Route path="revenue" element={<Revenue />} />
              <Route path="invoices" element={<Invoices />} />
              <Route path="camps" element={<Camps />} />
              <Route path="camps/:id" element={<CampDetail />} />
              <Route path="b2c" element={<B2C />} />
              <Route path="clients/:id" element={<ClientDetail />} />
              <Route path="documents" element={<Documents />} />
              <Route path="settings" element={<SettingsPage />} />
              {/* Old “new IA” bookmarks → simpler map */}
              <Route path="transactions" element={<Navigate to="/expenses" replace />} />
              <Route path="sales" element={<Navigate to="/b2c" replace />} />
              <Route path="reports" element={<Navigate to="/pnl" replace />} />
              <Route path="payments" element={<Navigate to="/invoices" replace />} />
              <Route path="profitability" element={<Navigate to="/mis" replace />} />
              <Route path="app-revenue" element={<Navigate to="/b2c" replace />} />
              <Route path="packages" element={<Navigate to="/b2c" replace />} />
              <Route path="clients" element={<Navigate to="/revenue" replace />} />
              <Route path="employees" element={<Navigate to="/expenses" replace />} />
              <Route path="partners" element={<Navigate to="/expenses" replace />} />
              <Route path="clinicians" element={<Navigate to="/camps" replace />} />
              <Route path="budgets" element={<Navigate to="/mis" replace />} />
              <Route path="investor" element={<Navigate to="/overview" replace />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </FilterCtx.Provider>
    </QueryClientProvider>
  );
}
