import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { api, apiUrl } from "../lib/api";
import { inrExact } from "../lib/format";
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
  const [previewOpen, setPreviewOpen] = useState(false);
  const [sendAfter, setSendAfter] = useState<{ id: string; number?: string; client?: string; total?: number } | null>(null);
  const clientName = lu?.clients.find((c) => c.id === client)?.name || "Client";
  const campName = lu?.camps.find((c) => c.id === camp)?.name;
  const qtyN = Number(qty) || 0;
  const rateN = Number(rate) || 0;
  const subtotal = qtyN * rateN;
  const tax = Math.round(subtotal * 0.18 * 100) / 100;
  const total = Math.round((subtotal + tax) * 100) / 100;
  const mut = useMutation({
    mutationFn: () =>
      api<{ id: string; number: string; status: string; total: number }>("/invoices", {
        method: "POST",
        body: JSON.stringify({
          client_id: client,
          camp_id: camp || null,
          invoice_date: date,
          due_date: due,
          items: [{ description: desc, quantity: Number(qty), rate: Number(rate), gst_rate: 18 }],
        }),
      }),
    onSuccess: (created) => {
      qc.invalidateQueries({ queryKey: ["invoices"] });
      setSendAfter({
        id: created.id,
        number: created.number,
        client: clientName,
        total: created.total,
      });
    },
  });
  return (
    <>
      <PanelForm
        title="Create invoice"
        submit="Save draft"
        busy={mut.isPending}
        onSubmit={(e) => { e.preventDefault(); mut.mutate(); }}
        extraActions={
          <button
            type="button"
            className="btn-secondary"
            onClick={() => setPreviewOpen(true)}
            disabled={!client || !rate}
          >
            Preview
          </button>
        }
      >
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
      {previewOpen ? (
        <InvoicePreviewModal
          clientName={clientName}
          campName={campName}
          date={date}
          due={due}
          desc={desc}
          qty={qtyN}
          rate={rateN}
          subtotal={subtotal}
          tax={tax}
          total={total}
          onClose={() => setPreviewOpen(false)}
        />
      ) : null}
      {sendAfter ? (
        <SendInvoiceModal
          invoice={sendAfter}
          onClose={() => {
            setSendAfter(null);
            onDone?.();
          }}
          onSent={() => {
            qc.invalidateQueries({ queryKey: ["invoices"] });
            onDone?.();
          }}
        />
      ) : null}
    </>
  );
}

function InvoicePreviewModal({
  clientName,
  campName,
  date,
  due,
  desc,
  qty,
  rate,
  subtotal,
  tax,
  total,
  onClose,
}: {
  clientName: string;
  campName?: string;
  date: string;
  due: string;
  desc: string;
  qty: number;
  rate: number;
  subtotal: number;
  tax: number;
  total: number;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="max-h-[90vh] w-full max-w-2xl overflow-auto rounded-2xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div>
            <div className="text-sm font-semibold">Invoice preview</div>
            <div className="text-xs text-muted-foreground">How this will look as a PDF / print</div>
          </div>
          <div className="flex gap-2">
            <button type="button" className="btn-secondary" onClick={() => window.print()}>Print view</button>
            <button type="button" className="btn-ghost" onClick={onClose}>Close</button>
          </div>
        </div>
        <div className="bg-[#F4F6F6] p-4 md:p-6">
          <div className="mx-auto max-w-[640px] overflow-hidden rounded-lg bg-white shadow-sm">
            <div className="flex items-center justify-between bg-[#063533] px-6 py-4 text-white">
              <div className="text-sm font-bold tracking-wide">SUPERFINANCE</div>
              <div className="text-xs uppercase tracking-wider">Tax invoice</div>
            </div>
            <div className="space-y-5 px-6 py-5 text-sm">
              <div className="flex flex-wrap justify-between gap-4">
                <div>
                  <div className="text-xs text-muted-foreground">Bill to</div>
                  <div className="font-semibold text-[#063533]">{clientName}</div>
                  {campName ? <div className="text-xs text-muted-foreground">Camp · {campName}</div> : null}
                </div>
                <div className="text-right text-xs text-muted-foreground">
                  <div>Draft preview</div>
                  <div>Date {date}</div>
                  <div>Due {due}</div>
                </div>
              </div>
              <div className="border-t border-[#E4E7E7] pt-3">
                <div className="mb-2 grid grid-cols-12 gap-2 text-[11px] font-semibold uppercase tracking-wide text-[#063533]">
                  <div className="col-span-6">Description</div>
                  <div className="col-span-2 text-right">Qty</div>
                  <div className="col-span-2 text-right">Rate</div>
                  <div className="col-span-2 text-right">Amount</div>
                </div>
                <div className="grid grid-cols-12 gap-2 border-t border-[#E4E7E7] py-2 text-sm">
                  <div className="col-span-6">{desc || "—"}</div>
                  <div className="col-span-2 text-right tabular-nums">{qty || 0}</div>
                  <div className="col-span-2 text-right tabular-nums">{inrExact(rate)}</div>
                  <div className="col-span-2 text-right tabular-nums">{inrExact(subtotal)}</div>
                </div>
              </div>
              <div className="ml-auto w-full max-w-[220px] space-y-1 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span className="tabular-nums">{inrExact(subtotal)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">GST 18%</span><span className="tabular-nums">{inrExact(tax)}</span></div>
                <div className="flex justify-between border-t border-[#E4E7E7] pt-2 font-semibold text-[#063533]">
                  <span>Total</span><span className="tabular-nums">{inrExact(total)}</span>
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground">Payment terms: Net 30 · This is a preview only; save draft to create the invoice.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const SEND_CHANNELS = [
  { id: "email", label: "Email" },
  { id: "whatsapp", label: "WhatsApp" },
  { id: "sms", label: "SMS" },
  { id: "print", label: "Print" },
] as const;

export function SendInvoiceModal({
  invoice,
  onClose,
  onSent,
}: {
  invoice: { id: string; number?: string; client?: string; total?: number };
  onClose: () => void;
  onSent?: () => void;
}) {
  const [channel, setChannel] = useState<(typeof SEND_CHANNELS)[number]["id"]>("email");
  const [name, setName] = useState(invoice.client || "");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState(`Please find invoice ${invoice.number || ""} attached.`);
  const needsEmail = channel === "email";
  const needsPhone = channel === "whatsapp" || channel === "sms";
  const mut = useMutation({
    mutationFn: () =>
      api(`/invoices/${invoice.id}/send`, {
        method: "POST",
        body: JSON.stringify({
          channel,
          recipient_name: name || null,
          recipient_email: email || null,
          recipient_phone: phone || null,
          message: message || null,
        }),
      }),
    onSuccess: () => {
      if (channel === "print") {
        window.open(apiUrl(`/invoices/${invoice.id}/pdf`), "_blank", "noopener,noreferrer");
      }
      onSent?.();
      onClose();
    },
  });
  const canSubmit = useMemo(() => {
    if (needsEmail && !email.trim()) return false;
    if (needsPhone && !phone.trim()) return false;
    return true;
  }, [needsEmail, needsPhone, email, phone]);
  const submitLabel =
    channel === "print" ? "Mark sent & print PDF" :
    channel === "email" ? "Send via email" :
    channel === "whatsapp" ? "Send via WhatsApp" :
    "Send via SMS";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-2xl bg-white p-4 shadow-xl md:p-5" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4">
          <div className="text-sm font-semibold">Send invoice {invoice.number || ""}</div>
          <div className="text-xs text-muted-foreground">
            Choose a channel and recipient. Sending posts revenue and marks the invoice as sent.
            {invoice.total != null ? ` · ${inrExact(Number(invoice.total))}` : ""}
          </div>
        </div>
        <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {SEND_CHANNELS.map((c) => (
            <button
              key={c.id}
              type="button"
              className={`rounded-xl border px-3 py-2 text-sm font-medium transition ${
                channel === c.id
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-white text-foreground hover:bg-muted"
              }`}
              onClick={() => setChannel(c.id)}
            >
              {c.label}
            </button>
          ))}
        </div>
        <div className="grid gap-3">
          <Field label="Recipient name">
            <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} placeholder="Contact person" />
          </Field>
          {needsEmail ? (
            <Field label="Email">
              <input className={inputClass} type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="finance@client.com" />
            </Field>
          ) : null}
          {needsPhone ? (
            <Field label="Phone">
              <input className={inputClass} type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} required placeholder="+91…" />
            </Field>
          ) : null}
          {channel === "print" ? (
            <p className="text-xs text-muted-foreground">Print opens the invoice PDF in a new tab after marking it sent.</p>
          ) : (
            <Field label="Message (optional)">
              <textarea className={inputClass + " min-h-[72px]"} value={message} onChange={(e) => setMessage(e.target.value)} />
            </Field>
          )}
          {mut.isError ? <p className="text-sm text-sf-accent">{(mut.error as Error).message}</p> : null}
        </div>
        <div className="mt-5 flex flex-wrap gap-2">
          <button
            type="button"
            className="btn-primary"
            disabled={mut.isPending || !canSubmit}
            onClick={() => mut.mutate()}
          >
            {mut.isPending ? "Sending…" : submitLabel}
          </button>
          <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
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
