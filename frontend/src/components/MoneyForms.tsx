import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "../lib/api";
import { Field, PanelForm, inputClass, useLookups } from "./FormKit";

const CATS_CAMP = [
  ["travel", "Travel"],
  ["food", "Food"],
  ["stay", "Stay"],
  ["goodie_bags", "Goodie bags"],
  ["marketing_materials", "Marketing materials"],
  ["logistics", "Logistics"],
  ["lab_partners", "Lab partners"],
  ["doctors", "Doctor"],
  ["nutritionists", "Nutritionist"],
  ["miscellaneous", "Misc"],
];
const CATS_OPS = [
  ["rent", "Rent"],
  ["salaries", "Salary"],
  ["software", "AI / software"],
  ["office", "Office"],
  ["insurance", "Insurance"],
  ["communication", "Communication"],
  ["accounting", "Accounting"],
  ["legal", "Legal"],
  ["marketing", "Marketing"],
  ["miscellaneous", "Other"],
];
const TOOLS = [
  ["cursor", "Cursor"],
  ["claude", "Claude"],
  ["figma", "Figma"],
  ["other", "Other tool"],
];

export function ExpenseForm({ campId, onDone }: { campId?: string; onDone?: () => void }) {
  const qc = useQueryClient();
  const { data: lu } = useLookups();
  const cats = campId ? CATS_CAMP : CATS_OPS;
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState(campId ? "travel" : "rent");
  const [tool, setTool] = useState("cursor");
  const [emp, setEmp] = useState("");
  const [desc, setDesc] = useState("");
  const [camp, setCamp] = useState(campId || "");
  const mut = useMutation({
    mutationFn: () =>
      api("/expenses", {
        method: "POST",
        body: JSON.stringify({
          expense_date: date,
          amount: Number(amount),
          category,
          subcategory: category === "software" ? tool : null,
          cost_nature: camp || campId ? "direct" : "indirect",
          description: desc || (category === "software" ? `${tool} subscription` : null),
          camp_id: camp || null,
          employee_id: category === "salaries" ? emp || null : null,
        }),
      }),
    onSuccess: () => {
      qc.invalidateQueries();
      setAmount("");
      setDesc("");
      onDone?.();
    },
  });
  return (
    <PanelForm title={campId ? "Add camp expense" : "Add expense"} submit="Submit for approval" busy={mut.isPending} onSubmit={(e) => { e.preventDefault(); mut.mutate(); }} onCancel={onDone}>
      <Field label="Date"><input className={inputClass} type="date" value={date} onChange={(e) => setDate(e.target.value)} required /></Field>
      <Field label="Amount (₹)"><input className={inputClass} type="number" min="1" value={amount} onChange={(e) => setAmount(e.target.value)} required /></Field>
      <Field label="Category">
        <select className={inputClass} value={category} onChange={(e) => setCategory(e.target.value)}>
          {cats.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </Field>
      {category === "software" ? (
        <Field label="Tool">
          <select className={inputClass} value={tool} onChange={(e) => setTool(e.target.value)}>
            {TOOLS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </Field>
      ) : null}
      {category === "salaries" ? (
        <Field label="Employee">
          <select className={inputClass} value={emp} onChange={(e) => setEmp(e.target.value)}>
            <option value="">All / unassigned</option>
            {lu?.employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
        </Field>
      ) : null}
      {!campId ? (
        <Field label="Camp (optional)">
          <select className={inputClass} value={camp} onChange={(e) => setCamp(e.target.value)}>
            <option value="">Company expense</option>
            {lu?.camps.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
      ) : null}
      <Field label="Description"><input className={inputClass} value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Optional" /></Field>
      {mut.isError ? <p className="text-sm text-negative md:col-span-3">{(mut.error as Error).message}</p> : null}
    </PanelForm>
  );
}

export function RevenueForm({ campId, onDone }: { campId?: string; onDone?: () => void }) {
  const qc = useQueryClient();
  const { data: lu } = useLookups();
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [amount, setAmount] = useState("");
  const [channel, setChannel] = useState(campId ? "camp" : "b2b");
  const [pkg, setPkg] = useState("");
  const [client, setClient] = useState("");
  const mut = useMutation({
    mutationFn: () =>
      api("/revenue", {
        method: "POST",
        body: JSON.stringify({
          txn_date: date,
          amount: Number(amount),
          channel,
          camp_id: campId || null,
          package_id: pkg || null,
          client_id: client || null,
          payment_status: channel === "b2b" ? "unpaid" : "paid",
          description: "Manual revenue entry",
        }),
      }),
    onSuccess: () => {
      qc.invalidateQueries();
      setAmount("");
      onDone?.();
    },
  });
  return (
    <PanelForm title="Record revenue" submit="Post to ledger" busy={mut.isPending} onSubmit={(e) => { e.preventDefault(); mut.mutate(); }}>
      <Field label="Date"><input className={inputClass} type="date" value={date} onChange={(e) => setDate(e.target.value)} required /></Field>
      <Field label="Amount (₹)"><input className={inputClass} type="number" min="1" value={amount} onChange={(e) => setAmount(e.target.value)} required /></Field>
      <Field label="Channel">
        <select className={inputClass} value={channel} onChange={(e) => setChannel(e.target.value)}>
          <option value="camp">B2B Camp</option>
          <option value="b2b">B2B</option>
          <option value="app">B2C / App</option>
          <option value="b2c">B2C</option>
          <option value="online_pt">Online Personal Training</option>
          <option value="consultation">Consultation</option>
          <option value="other">Other</option>
        </select>
      </Field>
      <Field label="Package">
        <select className={inputClass} value={pkg} onChange={(e) => setPkg(e.target.value)}>
          <option value="">—</option>
          {lu?.packages.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </Field>
      <Field label="Client">
        <select className={inputClass} value={client} onChange={(e) => setClient(e.target.value)}>
          <option value="">—</option>
          {lu?.clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </Field>
      {mut.isError ? <p className="text-sm text-sf-accent md:col-span-3">{(mut.error as Error).message}</p> : null}
    </PanelForm>
  );
}

export function InvoiceForm({ onDone }: { onDone?: () => void }) {
  const qc = useQueryClient();
  const { data: lu } = useLookups();
  const [client, setClient] = useState("");
  const [camp, setCamp] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [due, setDue] = useState(new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10));
  const [desc, setDesc] = useState("Health camp packages");
  const [qty, setQty] = useState("1");
  const [rate, setRate] = useState("");
  const mut = useMutation({
    mutationFn: () =>
      api("/invoices", {
        method: "POST",
        body: JSON.stringify({
          client_id: client,
          camp_id: camp || null,
          invoice_date: date,
          due_date: due,
          items: [{ description: desc, quantity: Number(qty), rate: Number(rate), gst_rate: 18 }],
        }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["invoices"] });
      onDone?.();
    },
  });
  return (
    <PanelForm title="Create invoice" submit="Save draft" busy={mut.isPending} onSubmit={(e) => { e.preventDefault(); mut.mutate(); }}>
      <Field label="Client">
        <select className={inputClass} value={client} onChange={(e) => setClient(e.target.value)} required>
          <option value="">Select client</option>
          {lu?.clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </Field>
      <Field label="Camp">
        <select className={inputClass} value={camp} onChange={(e) => setCamp(e.target.value)}>
          <option value="">—</option>
          {lu?.camps.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </Field>
      <Field label="Invoice date"><input className={inputClass} type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
      <Field label="Due date"><input className={inputClass} type="date" value={due} onChange={(e) => setDue(e.target.value)} /></Field>
      <Field label="Line description"><input className={inputClass} value={desc} onChange={(e) => setDesc(e.target.value)} /></Field>
      <Field label="Qty"><input className={inputClass} type="number" min="1" value={qty} onChange={(e) => setQty(e.target.value)} /></Field>
      <Field label="Rate (₹)"><input className={inputClass} type="number" min="1" value={rate} onChange={(e) => setRate(e.target.value)} required /></Field>
      {mut.isError ? <p className="text-sm text-sf-accent md:col-span-3">{(mut.error as Error).message}</p> : null}
    </PanelForm>
  );
}

export function PaymentForm({ onDone }: { onDone?: () => void }) {
  const qc = useQueryClient();
  const [invoiceId, setInvoiceId] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [ref, setRef] = useState("");
  const mut = useMutation({
    mutationFn: () =>
      api("/payments", {
        method: "POST",
        body: JSON.stringify({
          direction: "in",
          payment_date: date,
          amount: Number(amount),
          method: "bank",
          invoice_id: invoiceId || null,
          reference: ref,
        }),
      }),
    onSuccess: () => {
      qc.invalidateQueries();
      setAmount("");
      onDone?.();
    },
  });
  return (
    <PanelForm title="Record collection" submit="Post payment" busy={mut.isPending} onSubmit={(e) => { e.preventDefault(); mut.mutate(); }}>
      <Field label="Invoice ID"><input className={inputClass} value={invoiceId} onChange={(e) => setInvoiceId(e.target.value)} placeholder="Paste invoice id" /></Field>
      <Field label="Amount (₹)"><input className={inputClass} type="number" min="1" value={amount} onChange={(e) => setAmount(e.target.value)} required /></Field>
      <Field label="Date"><input className={inputClass} type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
      <Field label="Reference"><input className={inputClass} value={ref} onChange={(e) => setRef(e.target.value)} placeholder="NEFT / UTR" /></Field>
    </PanelForm>
  );
}

export function CampTravellerForm({ campId, onDone }: { campId: string; onDone?: () => void }) {
  const qc = useQueryClient();
  const { data: lu } = useLookups();
  const [emp, setEmp] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [stay, setStay] = useState("");
  const [travel, setTravel] = useState("");
  const [food, setFood] = useState("");
  const [other, setOther] = useState("");
  const mut = useMutation({
    mutationFn: () =>
      api(`/camps/${campId}/traveller`, {
        method: "POST",
        body: JSON.stringify({
          employee_id: emp,
          claim_date: date,
          stay: Number(stay || 0),
          travel: Number(travel || 0),
          food: Number(food || 0),
          other: Number(other || 0),
        }),
      }),
    onSuccess: () => {
      qc.invalidateQueries();
      onDone?.();
    },
  });
  return (
    <PanelForm title="Add traveller" submit="Save camp reimbursement" busy={mut.isPending} onSubmit={(e) => { e.preventDefault(); mut.mutate(); }} onCancel={onDone}>
      <Field label="Who travelled">
        <select className={inputClass} value={emp} onChange={(e) => setEmp(e.target.value)} required>
          <option value="">Select employee</option>
          {lu?.employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
        </select>
      </Field>
      <Field label="Date"><input className={inputClass} type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
      <div className="grid grid-cols-2 gap-3 md:col-span-2 lg:col-span-3 lg:grid-cols-4">
        <Field label="Stay ₹"><input className={inputClass} type="number" min="0" value={stay} onChange={(e) => setStay(e.target.value)} /></Field>
        <Field label="Travel ₹"><input className={inputClass} type="number" min="0" value={travel} onChange={(e) => setTravel(e.target.value)} /></Field>
        <Field label="Food ₹"><input className={inputClass} type="number" min="0" value={food} onChange={(e) => setFood(e.target.value)} /></Field>
        <Field label="Other ₹"><input className={inputClass} type="number" min="0" value={other} onChange={(e) => setOther(e.target.value)} /></Field>
      </div>
      {mut.isError ? <p className="text-sm text-sf-accent md:col-span-3">{(mut.error as Error).message}</p> : null}
    </PanelForm>
  );
}

export function MonthlyClaimForm({ onDone }: { onDone?: () => void }) {
  const qc = useQueryClient();
  const { data: lu } = useLookups();
  const [emp, setEmp] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [category, setCategory] = useState("phone");
  const mut = useMutation({
    mutationFn: () =>
      api("/reimbursements", {
        method: "POST",
        body: JSON.stringify({
          employee_id: emp,
          claim_date: date,
          kind: "monthly",
          category,
          amount: Number(amount),
          period_year: Number(date.slice(0, 4)),
          period_month: Number(date.slice(5, 7)),
        }),
      }),
    onSuccess: () => {
      qc.invalidateQueries();
      onDone?.();
    },
  });
  return (
    <PanelForm title="Monthly reimbursement" submit="Submit" busy={mut.isPending} onSubmit={(e) => { e.preventDefault(); mut.mutate(); }} onCancel={onDone}>
      <Field label="Employee">
        <select className={inputClass} value={emp} onChange={(e) => setEmp(e.target.value)} required>
          <option value="">Select</option>
          {lu?.employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
        </select>
      </Field>
      <Field label="Type">
        <select className={inputClass} value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="phone">Phone</option>
          <option value="internet">Internet</option>
          <option value="travel">Local travel</option>
          <option value="other">Other</option>
        </select>
      </Field>
      <Field label="Amount (₹)"><input className={inputClass} type="number" min="1" value={amount} onChange={(e) => setAmount(e.target.value)} required /></Field>
      <Field label="Month"><input className={inputClass} type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
      {mut.isError ? <p className="text-sm text-sf-accent md:col-span-3">{(mut.error as Error).message}</p> : null}
    </PanelForm>
  );
}

export function ClinicianForm({ kind, onDone }: { kind: "doctor" | "nutritionist"; onDone?: () => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [specialty, setSpecialty] = useState("");
  const [fee, setFee] = useState("");
  const mut = useMutation({
    mutationFn: () =>
      api("/clinicians", {
        method: "POST",
        body: JSON.stringify({ name, kind, specialty, typical_fee: Number(fee || 0) }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["clinicians"] });
      onDone?.();
    },
  });
  return (
    <PanelForm title={kind === "doctor" ? "Add doctor" : "Add nutritionist"} submit="Save" busy={mut.isPending} onSubmit={(e) => { e.preventDefault(); mut.mutate(); }} onCancel={onDone}>
      <Field label="Name"><input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} required /></Field>
      <Field label="Specialty"><input className={inputClass} value={specialty} onChange={(e) => setSpecialty(e.target.value)} /></Field>
      <Field label="Typical fee (₹)"><input className={inputClass} type="number" min="0" value={fee} onChange={(e) => setFee(e.target.value)} /></Field>
    </PanelForm>
  );
}

export function ClinicianPayoutForm({ clinicianId, typicalFee, onDone }: { clinicianId: string; typicalFee?: number; onDone?: () => void }) {
  const qc = useQueryClient();
  const { data: lu } = useLookups();
  const [amount, setAmount] = useState(typicalFee ? String(typicalFee) : "");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [camp, setCamp] = useState("");
  const mut = useMutation({
    mutationFn: () =>
      api(`/clinicians/${clinicianId}/payout`, {
        method: "POST",
        body: JSON.stringify({ payout_date: date, amount: Number(amount), camp_id: camp || null }),
      }),
    onSuccess: () => {
      qc.invalidateQueries();
      onDone?.();
    },
  });
  return (
    <PanelForm title="Record payout" submit="Pay now" busy={mut.isPending} onSubmit={(e) => { e.preventDefault(); mut.mutate(); }} onCancel={onDone}>
      <Field label="Amount (₹)"><input className={inputClass} type="number" min="1" value={amount} onChange={(e) => setAmount(e.target.value)} required /></Field>
      <Field label="Date"><input className={inputClass} type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
      <Field label="Camp (if for a camp)">
        <select className={inputClass} value={camp} onChange={(e) => setCamp(e.target.value)}>
          <option value="">Not camp-linked</option>
          {lu?.camps.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </Field>
      {mut.isError ? <p className="text-sm text-sf-accent md:col-span-3">{(mut.error as Error).message}</p> : null}
    </PanelForm>
  );
}

export function PackageForm({ onDone }: { onDone?: () => void }) {
  const qc = useQueryClient();
  const { data: lu } = useLookups();
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [diag, setDiag] = useState("");
  const [partner, setPartner] = useState("");
  const mut = useMutation({
    mutationFn: () =>
      api("/packages", {
        method: "POST",
        body: JSON.stringify({
          code,
          name,
          selling_price: Number(price),
          costs: [
            { cost_type: "diagnostic", amount: Number(diag || 0), diagnostic_partner_id: partner || null },
            { cost_type: "consultation", amount: 0 },
            { cost_type: "operations", amount: 0 },
            { cost_type: "gateway", amount: 0 },
          ],
        }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["packages"] });
      onDone?.();
    },
  });
  return (
    <PanelForm title="New package" submit="Create" busy={mut.isPending} onSubmit={(e) => { e.preventDefault(); mut.mutate(); }}>
      <Field label="Code"><input className={inputClass} value={code} onChange={(e) => setCode(e.target.value)} required /></Field>
      <Field label="Name"><input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} required /></Field>
      <Field label="Selling price (₹)"><input className={inputClass} type="number" min="1" value={price} onChange={(e) => setPrice(e.target.value)} required /></Field>
      <Field label="Diagnostic cost (₹)"><input className={inputClass} type="number" min="0" value={diag} onChange={(e) => setDiag(e.target.value)} /></Field>
      <Field label="Diagnostic partner">
        <select className={inputClass} value={partner} onChange={(e) => setPartner(e.target.value)}>
          <option value="">—</option>
          {lu?.partners.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </Field>
    </PanelForm>
  );
}

export function PartnerForm({ onDone }: { onDone?: () => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [gstin, setGstin] = useState("");
  const mut = useMutation({
    mutationFn: () => api("/partners", { method: "POST", body: JSON.stringify({ name, gstin }) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["partners"] });
      onDone?.();
    },
  });
  return (
    <PanelForm title="New diagnostic partner" submit="Create" busy={mut.isPending} onSubmit={(e) => { e.preventDefault(); mut.mutate(); }}>
      <Field label="Name"><input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} required /></Field>
      <Field label="GSTIN"><input className={inputClass} value={gstin} onChange={(e) => setGstin(e.target.value)} /></Field>
    </PanelForm>
  );
}

export function UploadBox({ entityType, entityId }: { entityType: string; entityId: string }) {
  const qc = useQueryClient();
  return (
    <div className="rounded-lg border border-dashed border-sf-border p-3 text-sm">
      <div className="font-medium">Attach file</div>
      <p className="text-sf-muted">PDF, images, Excel — stored on disk, not in the database.</p>
      <input
        type="file"
        className="mt-2 text-sm"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          const fd = new FormData();
          fd.append("file", file);
          await api(`/documents?entity_type=${entityType}&entity_id=${entityId}`, { method: "POST", body: fd });
          qc.invalidateQueries({ queryKey: ["docs"] });
        }}
      />
    </div>
  );
}
