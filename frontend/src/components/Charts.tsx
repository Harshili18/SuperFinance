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

const PRIMARY = "#0f6b4c";
const SECONDARY = "#7ba88a";
const NEGATIVE = "#c45c5c";
const GRID = "#e8ece9";
const TICK = "#6b756f";
const COLORS = ["#0f6b4c", "#3d9b72", "#7bb89a", "#a8c9b8", "#c45c5c", "#c4923a"];

const tipStyle = {
  borderRadius: 12,
  border: "1px solid #e4e9e6",
  boxShadow: "0 8px 24px rgba(18,24,22,0.08)",
  fontSize: 12,
  padding: "10px 12px",
};

export function MoneyLine({ data, x = "month", y = "amount", y2, height = "md" }: { data: object[]; x?: string; y?: string; y2?: string; height?: "sm" | "md" }) {
  return (
    <div className={`w-full min-w-0 ${height === "sm" ? "h-44" : "h-52"}`}>
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
          <XAxis dataKey={x} tick={{ fontSize: 11, fill: TICK }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fontSize: 11, fill: TICK }} tickFormatter={(v) => inr(v)} axisLine={false} tickLine={false} width={56} />
          <Tooltip
            contentStyle={tipStyle}
            formatter={(v: number) => inr(v, false)}
            labelStyle={{ color: TICK, marginBottom: 4 }}
          />
          <Line type="monotone" dataKey={y} stroke={PRIMARY} strokeWidth={2.5} dot={false} activeDot={{ r: 4, fill: PRIMARY }} />
          {y2 ? <Line type="monotone" dataKey={y2} stroke={NEGATIVE} strokeWidth={2} strokeDasharray="4 4" dot={false} /> : null}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function MoneyBars({ data, x = "label", y = "amount", height = "md" }: { data: object[]; x?: string; y?: string; height?: "sm" | "md" }) {
  return (
    <div className={`w-full min-w-0 ${height === "sm" ? "h-44" : "h-52"}`}>
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
          <XAxis dataKey={x} tick={{ fontSize: 11, fill: TICK }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fontSize: 11, fill: TICK }} tickFormatter={(v) => inr(v)} axisLine={false} tickLine={false} width={56} />
          <Tooltip contentStyle={tipStyle} formatter={(v: number) => inr(v, false)} />
          <Bar dataKey={y} fill={PRIMARY} radius={[8, 8, 4, 4]} maxBarSize={36} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function MoneyPie({ data, showLegend = true }: { data: { name: string; value: number }[]; showLegend?: boolean }) {
  return (
    <div className="h-48 w-full min-w-0">
      <ResponsiveContainer>
        <PieChart>
          <Pie data={data} dataKey="value" nameKey="name" innerRadius={44} outerRadius={68} paddingAngle={2} stroke="none">
            {data.map((_, i) => (
              <Cell key={i} fill={COLORS[i % COLORS.length]} />
            ))}
          </Pie>
          {showLegend ? (
            <Legend
              verticalAlign="bottom"
              iconType="circle"
              wrapperStyle={{ fontSize: 12, color: TICK, paddingTop: 4 }}
            />
          ) : null}
          <Tooltip contentStyle={tipStyle} formatter={(v: number) => inr(v, false)} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

export function Panel({ title, children, description }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="surface-card min-w-0 p-3.5 md:p-4">
      <div className="mb-3">
        <h3 className="text-sm font-semibold tracking-tight text-foreground">{title}</h3>
        {description ? <p className="mt-0.5 text-xs text-muted-foreground">{description}</p> : null}
      </div>
      {children}
    </section>
  );
}

export { PRIMARY, SECONDARY, NEGATIVE, COLORS };
