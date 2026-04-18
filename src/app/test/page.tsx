"use client";

import { useEffect, useState, useCallback } from "react";

// ─── tipos ────────────────────────────────────────────────────────────────────
type Operator = { id: string; name: string; badgeNumber: string; status: string };

type Emergency = {
  id: string;
  type: string;
  priority: string;
  description: string;
  status: string;
  aiMetadata: unknown;
  latitude?: number;
  longitude?: number;
  createdAt: string;
  call: { phoneNumber: string; transcript: string | null; createdAt: string };
  address?: {
    street: string; extNumber: string; neighborhood: string;
    city: string; state: string; postalCode: string;
  } | null;
  assignment?: { id: string; operator: { name: string }; assignedAt: string; resolvedAt: string | null } | null;
};

// ─── colores ──────────────────────────────────────────────────────────────────
const PRIORITY_STYLE: Record<string, string> = {
  CRITICAL: "bg-red-600 text-white",
  HIGH:     "bg-orange-500 text-white",
  MEDIUM:   "bg-yellow-400 text-black",
  LOW:      "bg-green-500 text-white",
  IRRELEVANT: "bg-gray-300 text-gray-600",
};

const STATUS_STYLE: Record<string, string> = {
  PENDING:     "bg-gray-100 text-gray-700",
  ASSIGNED:    "bg-blue-100 text-blue-800",
  IN_PROGRESS: "bg-yellow-100 text-yellow-800",
  RESOLVED:    "bg-green-100 text-green-800",
  AVAILABLE:   "bg-green-100 text-green-800",
  BUSY:        "bg-red-100 text-red-700",
  OFFLINE:     "bg-gray-100 text-gray-500",
};

const PRIORITY_BORDER: Record<string, string> = {
  CRITICAL: "border-l-4 border-red-600",
  HIGH:     "border-l-4 border-orange-500",
  MEDIUM:   "border-l-4 border-yellow-400",
  LOW:      "border-l-4 border-green-500",
  IRRELEVANT: "border-l-4 border-gray-300",
};

function Badge({ label, style }: { label: string; style?: string }) {
  const cls = style ?? STATUS_STYLE[label] ?? "bg-gray-100 text-gray-600";
  return <span className={`px-2 py-0.5 rounded text-xs font-semibold ${cls}`}>{label}</span>;
}

async function api(path: string, method = "GET", body?: object) {
  const res = await fetch(path, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.json();
}

// ─── componente principal ─────────────────────────────────────────────────────
export default function TestPage() {
  const [emergencies, setEmergencies] = useState<Emergency[]>([]);
  const [operators, setOperators] = useState<Operator[]>([]);
  const [selected, setSelected] = useState<Emergency | null>(null);
  const [toast, setToast] = useState("");

  // sim panel
  const [simPhone, setSimPhone] = useState("+52 55 1234 5678");
  const [simType, setSimType] = useState("MEDICAL");
  const [simPriority, setSimPriority] = useState("HIGH");
  const [simDesc, setSimDesc] = useState("");
  const [simTranscript, setSimTranscript] = useState("");

  const flash = (msg: string) => { setToast(msg); setTimeout(() => setToast(""), 3000); };

  const refresh = useCallback(async () => {
    const [ems, ops] = await Promise.all([api("/api/emergencies"), api("/api/operators")]);
    setEmergencies(Array.isArray(ems) ? ems : []);
    setOperators(Array.isArray(ops) ? ops : []);
    // refresca el detalle seleccionado si sigue abierto
    if (selected) {
      const updated = (Array.isArray(ems) ? ems : []).find((e: Emergency) => e.id === selected.id);
      setSelected(updated ?? null);
    }
  }, [selected]);

  useEffect(() => { refresh(); }, []);

  // ── simulación completa: call → classify → emergency ──────────────────────
  const simulate = async () => {
    if (!simDesc) return flash("Agrega una descripción para simular");

    // 1. crear llamada
    const call = await api("/api/calls", "POST", { phoneNumber: simPhone });
    if (call.error) return flash(`Error: ${call.error}`);

    // 2. guardar transcript (simula al bot)
    if (simTranscript) {
      await api(`/api/calls/${call.id}`, "PATCH", {
        transcript: simTranscript,
        status: "ACTIVE",
      });
    }

    // 3. crear emergencia directamente (simula a la IA)
    const em = await api("/api/emergencies", "POST", {
      callId: call.id,
      type: simType,
      priority: simPriority,
      description: simDesc,
    });
    if (em.error) return flash(`Error: ${em.error}`);

    flash(`Emergencia ${simPriority} creada — token: ${call.trackingToken}`);
    setSimDesc("");
    setSimTranscript("");
    refresh();
  };

  const assign = async (emergencyId: string) => {
    const r = await api("/api/assignments", "POST", { emergencyId });
    if (r.error) return flash(`Error: ${r.error}`);
    flash("Asignada al operador disponible");
    refresh();
  };

  const resolve = async (assignmentId: string) => {
    const r = await api(`/api/assignments/${assignmentId}`, "PATCH", { notes: "Resuelto" });
    if (r.error) return flash(`Error: ${r.error}`);
    flash("Caso resuelto");
    refresh();
  };

  const createOperator = async () => {
    const r = await api("/api/operators", "POST", {
      name: "Operador Demo",
      email: `op${Date.now()}@centurion.mx`,
      badgeNumber: `OP-${Date.now().toString().slice(-4)}`,
    });
    if (r.error) return flash(`Error: ${r.error}`);
    await api(`/api/operators/${r.id}`, "PATCH", { status: "AVAILABLE" });
    flash(`Operador "${r.name}" creado y disponible`);
    refresh();
  };

  const available = operators.filter(o => o.status === "AVAILABLE").length;

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 flex flex-col">

      {/* header */}
      <header className="bg-gray-900 border-b border-gray-800 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-red-500 font-black text-xl">⬡ CENTURION</span>
          <span className="text-gray-500 text-sm">Panel de emergencias — vista operador</span>
        </div>
        <div className="flex items-center gap-4 text-sm">
          <span className="text-gray-400">
            Operadores disponibles:
            <span className={`ml-1 font-bold ${available > 0 ? "text-green-400" : "text-red-400"}`}>
              {available}/{operators.length}
            </span>
          </span>
          <button onClick={refresh} className="px-3 py-1 bg-gray-800 hover:bg-gray-700 rounded text-xs">
            Refrescar
          </button>
        </div>
      </header>

      {toast && (
        <div className="bg-blue-900 border-b border-blue-700 text-blue-200 px-6 py-2 text-sm text-center">
          {toast}
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">

        {/* ── cola de emergencias ── */}
        <aside className="w-80 bg-gray-900 border-r border-gray-800 flex flex-col">
          <div className="px-4 py-3 border-b border-gray-800 flex items-center justify-between">
            <h2 className="font-semibold text-sm text-gray-300">
              Cola activa <span className="text-gray-500">({emergencies.length})</span>
            </h2>
          </div>
          <div className="flex-1 overflow-y-auto">
            {emergencies.length === 0 && (
              <p className="text-gray-600 text-sm text-center mt-10">Sin emergencias activas</p>
            )}
            {emergencies.map(em => (
              <button
                key={em.id}
                onClick={() => setSelected(em)}
                className={`w-full text-left px-4 py-3 border-b border-gray-800 hover:bg-gray-800 transition-colors ${PRIORITY_BORDER[em.priority]} ${selected?.id === em.id ? "bg-gray-800" : ""}`}
              >
                <div className="flex items-center justify-between mb-1">
                  <Badge label={em.priority} style={PRIORITY_STYLE[em.priority]} />
                  <Badge label={em.status} />
                </div>
                <p className="font-medium text-sm">{em.type}</p>
                <p className="text-gray-400 text-xs truncate">{em.description}</p>
                <p className="text-gray-600 text-xs mt-1">{em.call.phoneNumber}</p>
              </button>
            ))}
          </div>
        </aside>

        {/* ── detalle ── */}
        <main className="flex-1 overflow-y-auto p-6">
          {!selected ? (
            <div className="flex items-center justify-center h-full text-gray-600">
              Selecciona una emergencia de la cola
            </div>
          ) : (
            <div className="max-w-2xl flex flex-col gap-5">

              {/* cabecera */}
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <Badge label={selected.priority} style={PRIORITY_STYLE[selected.priority]} />
                  <h1 className="text-xl font-bold">{selected.type}</h1>
                  <Badge label={selected.status} />
                </div>
                <div className="flex gap-2">
                  {selected.status === "PENDING" && (
                    <button
                      onClick={() => assign(selected.id)}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded text-sm font-medium"
                    >
                      Asignar operador
                    </button>
                  )}
                  {selected.assignment && !selected.assignment.resolvedAt && (
                    <button
                      onClick={() => resolve(selected.assignment!.id)}
                      className="px-4 py-2 bg-green-600 hover:bg-green-700 rounded text-sm font-medium"
                    >
                      Resolver caso
                    </button>
                  )}
                </div>
              </div>

              {/* summary de la IA */}
              <section className="bg-gray-900 rounded-xl p-4 border border-gray-800">
                <h3 className="text-xs text-gray-500 uppercase tracking-wider mb-2">Resumen IA</h3>
                <p className="text-gray-100">{selected.description}</p>
              </section>

              {/* info de la llamada */}
              <section className="bg-gray-900 rounded-xl p-4 border border-gray-800">
                <h3 className="text-xs text-gray-500 uppercase tracking-wider mb-3">Llamada</h3>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <span className="text-gray-500">Número</span>
                    <p className="font-mono">{selected.call.phoneNumber}</p>
                  </div>
                  <div>
                    <span className="text-gray-500">Recibida</span>
                    <p>{new Date(selected.call.createdAt).toLocaleTimeString("es-MX")}</p>
                  </div>
                </div>
              </section>

              {/* transcript */}
              <section className="bg-gray-900 rounded-xl p-4 border border-gray-800">
                <h3 className="text-xs text-gray-500 uppercase tracking-wider mb-3">
                  Conversación con el bot
                </h3>
                {selected.call.transcript ? (
                  <pre className="text-sm text-gray-300 whitespace-pre-wrap font-sans leading-relaxed">
                    {selected.call.transcript}
                  </pre>
                ) : (
                  <p className="text-gray-600 text-sm italic">Sin transcript disponible</p>
                )}
              </section>

              {/* dirección */}
              {selected.address && (
                <section className="bg-gray-900 rounded-xl p-4 border border-gray-800">
                  <h3 className="text-xs text-gray-500 uppercase tracking-wider mb-2">Ubicación</h3>
                  <p className="text-sm">
                    {selected.address.street} {selected.address.extNumber},{" "}
                    {selected.address.neighborhood}, {selected.address.city},{" "}
                    {selected.address.state} CP {selected.address.postalCode}
                  </p>
                </section>
              )}

              {/* operador asignado */}
              {selected.assignment && (
                <section className="bg-gray-900 rounded-xl p-4 border border-gray-800">
                  <h3 className="text-xs text-gray-500 uppercase tracking-wider mb-2">Operador</h3>
                  <p className="text-sm font-medium">{selected.assignment.operator.name}</p>
                  <p className="text-gray-500 text-xs">
                    Asignado {new Date(selected.assignment.assignedAt).toLocaleTimeString("es-MX")}
                    {selected.assignment.resolvedAt && (
                      <> · Resuelto {new Date(selected.assignment.resolvedAt).toLocaleTimeString("es-MX")}</>
                    )}
                  </p>
                </section>
              )}
            </div>
          )}
        </main>

        {/* ── panel de simulación ── */}
        <aside className="w-72 bg-gray-900 border-l border-gray-800 flex flex-col">
          <div className="px-4 py-3 border-b border-gray-800">
            <h2 className="font-semibold text-sm text-gray-300">Simular llamada</h2>
            <p className="text-gray-600 text-xs">Reemplaza al bot + IA</p>
          </div>
          <div className="p-4 flex flex-col gap-3 overflow-y-auto">

            <div>
              <label className="text-xs text-gray-500 mb-1 block">Teléfono</label>
              <input
                className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm"
                value={simPhone}
                onChange={e => setSimPhone(e.target.value)}
              />
            </div>

            <div>
              <label className="text-xs text-gray-500 mb-1 block">Tipo</label>
              <select
                className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm"
                value={simType}
                onChange={e => setSimType(e.target.value)}
              >
                {["MEDICAL", "CRIME", "ACCIDENT", "OTHER"].map(t => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs text-gray-500 mb-1 block">Prioridad</label>
              <select
                className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm"
                value={simPriority}
                onChange={e => setSimPriority(e.target.value)}
              >
                {["CRITICAL", "HIGH", "MEDIUM", "LOW", "IRRELEVANT"].map(p => (
                  <option key={p}>{p}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs text-gray-500 mb-1 block">Resumen (IA)</label>
              <textarea
                className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm resize-none"
                rows={3}
                placeholder="Descripción de la emergencia..."
                value={simDesc}
                onChange={e => setSimDesc(e.target.value)}
              />
            </div>

            <div>
              <label className="text-xs text-gray-500 mb-1 block">Transcript del bot</label>
              <textarea
                className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm resize-none"
                rows={4}
                placeholder={"Bot: ¿Cuál es su emergencia?\nUsuario: Hay un incendio en..."}
                value={simTranscript}
                onChange={e => setSimTranscript(e.target.value)}
              />
            </div>

            <button
              onClick={simulate}
              className="w-full bg-red-600 hover:bg-red-700 rounded py-2 text-sm font-semibold"
            >
              Simular emergencia
            </button>

            <div className="border-t border-gray-800 pt-3">
              <p className="text-xs text-gray-500 mb-2">Setup</p>
              <button
                onClick={createOperator}
                className="w-full bg-gray-700 hover:bg-gray-600 rounded py-2 text-sm"
              >
                + Crear operador disponible
              </button>
            </div>

            <div className="border-t border-gray-800 pt-3">
              <p className="text-xs text-gray-500 mb-2">Operadores</p>
              {operators.length === 0 && <p className="text-gray-600 text-xs">Ninguno</p>}
              {operators.map(op => (
                <div key={op.id} className="flex items-center justify-between text-xs py-1">
                  <span className="text-gray-300">{op.name}</span>
                  <Badge label={op.status} />
                </div>
              ))}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
