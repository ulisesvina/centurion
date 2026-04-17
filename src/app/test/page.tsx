"use client";

import { useEffect, useState } from "react";

// ─── tipos mínimos ────────────────────────────────────────────────────────────
type Operator = { id: string; name: string; email: string; badgeNumber: string; status: string };
type Call = { id: string; phoneNumber: string; status: string; createdAt: string; emergency?: { priority: string; type: string; status: string } | null };
type Emergency = { id: string; type: string; priority: string; description: string; status: string; address?: string; call: { phoneNumber: string }; assignment?: Assignment | null };
type Assignment = { id: string; emergencyId: string; resolvedAt: string | null; operator: { name: string } };

const PRIORITY_COLOR: Record<string, string> = {
  CRITICAL: "bg-red-600 text-white",
  HIGH: "bg-orange-500 text-white",
  MEDIUM: "bg-yellow-400 text-black",
  LOW: "bg-green-500 text-white",
};

const STATUS_COLOR: Record<string, string> = {
  PENDING: "bg-gray-200 text-gray-700",
  ACTIVE: "bg-blue-200 text-blue-800",
  CLASSIFIED: "bg-purple-200 text-purple-800",
  RESOLVED: "bg-green-200 text-green-800",
  ABANDONED: "bg-red-200 text-red-700",
  ASSIGNED: "bg-blue-300 text-blue-900",
  IN_PROGRESS: "bg-yellow-200 text-yellow-900",
  AVAILABLE: "bg-green-200 text-green-800",
  BUSY: "bg-red-200 text-red-700",
  OFFLINE: "bg-gray-200 text-gray-600",
};

function Badge({ label }: { label: string }) {
  const cls = STATUS_COLOR[label] ?? "bg-gray-100 text-gray-600";
  return <span className={`px-2 py-0.5 rounded text-xs font-semibold ${cls}`}>{label}</span>;
}

function PriorityBadge({ priority }: { priority: string }) {
  const cls = PRIORITY_COLOR[priority] ?? "bg-gray-300";
  return <span className={`px-2 py-0.5 rounded text-xs font-bold ${cls}`}>{priority}</span>;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border border-gray-200 rounded-xl p-4 flex flex-col gap-3">
      <h2 className="font-bold text-lg border-b pb-2">{title}</h2>
      {children}
    </div>
  );
}

async function api(path: string, method = "GET", body?: object) {
  const res = await fetch(path, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.json();
}

export default function TestPage() {
  const [operators, setOperators] = useState<Operator[]>([]);
  const [calls, setCalls] = useState<Call[]>([]);
  const [emergencies, setEmergencies] = useState<Emergency[]>([]);

  // forms
  const [opForm, setOpForm] = useState({ name: "", email: "", badgeNumber: "" });
  const [callPhone, setCallPhone] = useState("");
  const [emForm, setEmForm] = useState({ callId: "", type: "MEDICAL", priority: "HIGH", description: "", address: "" });
  const [assignEmId, setAssignEmId] = useState("");
  const [msg, setMsg] = useState("");

  const flash = (m: string) => { setMsg(m); setTimeout(() => setMsg(""), 3000); };

  const refresh = async () => {
    const [ops, cs, ems] = await Promise.all([
      api("/api/operators"),
      api("/api/calls"),
      api("/api/emergencies"),
    ]);
    setOperators(ops);
    setCalls(cs);
    setEmergencies(ems);
  };

  useEffect(() => { refresh(); }, []);

  // ── handlers ──────────────────────────────────────────────────────────────
  const createOperator = async () => {
    if (!opForm.name || !opForm.email || !opForm.badgeNumber) return flash("Completa todos los campos del operador");
    const r = await api("/api/operators", "POST", opForm);
    if (r.error) return flash(`Error: ${r.error}`);
    flash(`Operador "${r.name}" creado`);
    setOpForm({ name: "", email: "", badgeNumber: "" });
    refresh();
  };

  const createCall = async () => {
    if (!callPhone) return flash("Ingresa un número de teléfono");
    const r = await api("/api/calls", "POST", { phoneNumber: callPhone });
    if (r.error) return flash(`Error: ${r.error}`);
    flash(`Llamada registrada: ${r.id}`);
    setCallPhone("");
    setEmForm((f) => ({ ...f, callId: r.id }));
    refresh();
  };

  const createEmergency = async () => {
    if (!emForm.callId || !emForm.description) return flash("Selecciona una llamada y agrega descripción");
    const r = await api("/api/emergencies", "POST", {
      callId: emForm.callId,
      type: emForm.type,
      priority: emForm.priority,
      description: emForm.description,
      address: emForm.address || undefined,
    });
    if (r.error) return flash(`Error: ${r.error}`);
    flash(`Emergencia creada con prioridad ${r.priority}`);
    setEmForm((f) => ({ ...f, description: "", address: "" }));
    refresh();
  };

  const assignEmergency = async () => {
    if (!assignEmId) return flash("Selecciona una emergencia para asignar");
    const r = await api("/api/assignments", "POST", { emergencyId: assignEmId });
    if (r.error) return flash(`Error: ${r.error}`);
    flash("Emergencia asignada al operador disponible");
    setAssignEmId("");
    refresh();
  };

  const resolveAssignment = async (assignmentId: string) => {
    const r = await api(`/api/assignments/${assignmentId}`, "PATCH", { notes: "Resuelto desde panel de prueba" });
    if (r.error) return flash(`Error: ${r.error}`);
    flash("Caso resuelto");
    refresh();
  };

  const pendingEmergencies = emergencies.filter((e) => e.status === "PENDING");
  const assignedEmergencies = emergencies.filter((e) => ["ASSIGNED", "IN_PROGRESS"].includes(e.status));

  return (
    <main className="max-w-6xl mx-auto p-6 flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Centurion — Panel de prueba</h1>
          <p className="text-sm text-gray-500">Solo para verificar que la API funciona</p>
        </div>
        <button onClick={refresh} className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm font-medium">
          Refrescar todo
        </button>
      </div>

      {msg && (
        <div className="bg-blue-50 border border-blue-200 text-blue-800 px-4 py-2 rounded-lg text-sm font-medium">
          {msg}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

        {/* ── OPERADORES ── */}
        <Section title={`Operadores (${operators.length})`}>
          <div className="flex flex-col gap-2">
            <input className="border rounded px-3 py-1.5 text-sm" placeholder="Nombre" value={opForm.name} onChange={(e) => setOpForm({ ...opForm, name: e.target.value })} />
            <input className="border rounded px-3 py-1.5 text-sm" placeholder="Email" value={opForm.email} onChange={(e) => setOpForm({ ...opForm, email: e.target.value })} />
            <input className="border rounded px-3 py-1.5 text-sm" placeholder="Número de placa ej. OP-001" value={opForm.badgeNumber} onChange={(e) => setOpForm({ ...opForm, badgeNumber: e.target.value })} />
            <button onClick={createOperator} className="bg-black text-white rounded px-3 py-1.5 text-sm font-medium hover:bg-gray-800">
              Crear operador
            </button>
          </div>
          <div className="flex flex-col gap-1 max-h-48 overflow-y-auto">
            {operators.length === 0 && <p className="text-xs text-gray-400">Sin operadores</p>}
            {operators.map((op) => (
              <div key={op.id} className="flex items-center justify-between text-sm border rounded px-3 py-2">
                <div>
                  <span className="font-medium">{op.name}</span>
                  <span className="text-gray-400 text-xs ml-2">{op.badgeNumber}</span>
                </div>
                <Badge label={op.status} />
              </div>
            ))}
          </div>
        </Section>

        {/* ── LLAMADAS ── */}
        <Section title={`Llamadas (${calls.length})`}>
          <div className="flex gap-2">
            <input className="border rounded px-3 py-1.5 text-sm flex-1" placeholder="+52 55 0000 0000" value={callPhone} onChange={(e) => setCallPhone(e.target.value)} />
            <button onClick={createCall} className="bg-black text-white rounded px-3 py-1.5 text-sm font-medium hover:bg-gray-800 whitespace-nowrap">
              Registrar llamada
            </button>
          </div>
          <div className="flex flex-col gap-1 max-h-48 overflow-y-auto">
            {calls.length === 0 && <p className="text-xs text-gray-400">Sin llamadas</p>}
            {calls.map((c) => (
              <div key={c.id} className="flex items-center justify-between text-sm border rounded px-3 py-2">
                <div>
                  <span className="font-medium">{c.phoneNumber}</span>
                  <span className="text-gray-400 text-xs ml-2 font-mono">{c.id.slice(-6)}</span>
                </div>
                <div className="flex items-center gap-1">
                  {c.emergency && <PriorityBadge priority={c.emergency.priority} />}
                  <Badge label={c.status} />
                </div>
              </div>
            ))}
          </div>
        </Section>

        {/* ── CREAR EMERGENCIA ── */}
        <Section title="Clasificar emergencia (simula la IA)">
          <div className="flex flex-col gap-2">
            <select className="border rounded px-3 py-1.5 text-sm" value={emForm.callId} onChange={(e) => setEmForm({ ...emForm, callId: e.target.value })}>
              <option value="">Selecciona una llamada</option>
              {calls.filter((c) => !c.emergency).map((c) => (
                <option key={c.id} value={c.id}>{c.phoneNumber} — {c.id.slice(-6)}</option>
              ))}
            </select>
            <div className="flex gap-2">
              <select className="border rounded px-3 py-1.5 text-sm flex-1" value={emForm.type} onChange={(e) => setEmForm({ ...emForm, type: e.target.value })}>
                {["MEDICAL", "FIRE", "CRIME", "ACCIDENT", "NATURAL_DISASTER", "OTHER"].map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
              <select className="border rounded px-3 py-1.5 text-sm flex-1" value={emForm.priority} onChange={(e) => setEmForm({ ...emForm, priority: e.target.value })}>
                {["CRITICAL", "HIGH", "MEDIUM", "LOW"].map((p) => (
                  <option key={p}>{p}</option>
                ))}
              </select>
            </div>
            <input className="border rounded px-3 py-1.5 text-sm" placeholder="Dirección (opcional)" value={emForm.address} onChange={(e) => setEmForm({ ...emForm, address: e.target.value })} />
            <textarea className="border rounded px-3 py-1.5 text-sm resize-none" rows={2} placeholder="Descripción de la emergencia" value={emForm.description} onChange={(e) => setEmForm({ ...emForm, description: e.target.value })} />
            <button onClick={createEmergency} className="bg-red-600 text-white rounded px-3 py-1.5 text-sm font-medium hover:bg-red-700">
              Crear emergencia
            </button>
          </div>
        </Section>

        {/* ── ASIGNAR ── */}
        <Section title="Asignar emergencia a operador">
          <div className="flex gap-2">
            <select className="border rounded px-3 py-1.5 text-sm flex-1" value={assignEmId} onChange={(e) => setAssignEmId(e.target.value)}>
              <option value="">Selecciona emergencia pendiente</option>
              {pendingEmergencies.map((e) => (
                <option key={e.id} value={e.id}>[{e.priority}] {e.type} — {e.call.phoneNumber}</option>
              ))}
            </select>
            <button onClick={assignEmergency} className="bg-blue-600 text-white rounded px-3 py-1.5 text-sm font-medium hover:bg-blue-700 whitespace-nowrap">
              Asignar
            </button>
          </div>
          <p className="text-xs text-gray-400">
            Operadores disponibles: {operators.filter((o) => o.status === "AVAILABLE").length} / {operators.length}
          </p>
        </Section>
      </div>

      {/* ── TABLA DE EMERGENCIAS ── */}
      <Section title={`Cola de emergencias (${emergencies.length})`}>
        {emergencies.length === 0 && <p className="text-sm text-gray-400">Sin emergencias registradas</p>}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 text-xs border-b">
                <th className="pb-2 pr-4">Prioridad</th>
                <th className="pb-2 pr-4">Tipo</th>
                <th className="pb-2 pr-4">Descripción</th>
                <th className="pb-2 pr-4">Teléfono</th>
                <th className="pb-2 pr-4">Estado</th>
                <th className="pb-2 pr-4">Operador</th>
                <th className="pb-2">Acción</th>
              </tr>
            </thead>
            <tbody>
              {emergencies.map((e) => (
                <tr key={e.id} className="border-b last:border-0">
                  <td className="py-2 pr-4"><PriorityBadge priority={e.priority} /></td>
                  <td className="py-2 pr-4 font-medium">{e.type}</td>
                  <td className="py-2 pr-4 text-gray-600 max-w-xs truncate">{e.description}</td>
                  <td className="py-2 pr-4 font-mono text-xs">{e.call.phoneNumber}</td>
                  <td className="py-2 pr-4"><Badge label={e.status} /></td>
                  <td className="py-2 pr-4 text-gray-600">{e.assignment?.operator?.name ?? "—"}</td>
                  <td className="py-2">
                    {e.assignment && !e.assignment.resolvedAt && (
                      <button
                        onClick={() => resolveAssignment(e.assignment!.id)}
                        className="text-xs bg-green-100 hover:bg-green-200 text-green-800 px-2 py-1 rounded font-medium"
                      >
                        Resolver
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
    </main>
  );
}
