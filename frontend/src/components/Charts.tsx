import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { inr } from "../lib/format";

const PRIMARY = "#063533";
const NEGATIVE = "#cc203b";
const GRID = "#e9eeec";
const COLORS = ["#063533", "#0a4a47", "#cc203b", "#8aa3a1", "#667272", "#1a6b66"];

export function MoneyLine({ data, x = "month", y = "amount", y2 }: { data: object[]; x?: string; y?: string; y2?: string }) {
  return (
    <div className="h-64">
      <ResponsiveContainer>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
          <XAxis dataKey={x} tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => inr(v)} />
          <Tooltip formatter={(v: number) => inr(v, false)} />
          <Line type="monotone" dataKey={y} stroke={PRIMARY} strokeWidth={2} dot={false} />
          {y2 ? <Line type="monotone" dataKey={y2} stroke={NEGATIVE} strokeWidth={2} dot={false} /> : null}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function MoneyBars({ data, x = "label", y = "amount" }: { data: object[]; x?: string; y?: string }) {
  return (
    <div className="h-64">
      <ResponsiveContainer>
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
          <XAxis dataKey={x} tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => inr(v)} />
          <Tooltip formatter={(v: number) => inr(v, false)} />
          <Bar dataKey={y} fill={PRIMARY} radius={[3, 3, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function MoneyPie({ data }: { data: { name: string; value: number }[] }) {
  return (
    <div className="h-64">
      <ResponsiveContainer>
        <PieChart>
          <Pie data={data} dataKey="value" nameKey="name" innerRadius={48} outerRadius={80}>
            {data.map((_, i) => (
              <Cell key={i} fill={COLORS[i % COLORS.length]} />
            ))}
          </Pie>
          <Legend />
          <Tooltip formatter={(v: number) => inr(v, false)} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

export function Panel({ title, children, description }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-md border border-border bg-card p-3 shadow-xs">
      <h3 className="text-sm font-semibold">{title}</h3>
      {description ? <p className="mb-2 mt-0.5 text-xs text-muted-foreground">{description}</p> : <div className="mb-2" />}
      {children}
    </section>
  );
}
