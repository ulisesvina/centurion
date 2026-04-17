import { NextRequest } from "next/server";
import { getCallById } from "@/lib/calls";
import { createEmergency } from "@/lib/emergencies";
import { classifyTranscript } from "@/lib/ai";

// POST /api/calls/:id/classify
//
// Dispara la clasificación de una llamada con IA.
// Lo llama el bot cuando termina de grabar el transcript completo.
//
// Flujo:
//   1. Lee la llamada de la DB
//   2. Manda el transcript a la IA  ← TODO: implementar en src/lib/ai.ts
//   3. Crea la Emergency con el resultado
//   4. Devuelve la emergencia creada (con su prioridad asignada)
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  // 1. Obtener la llamada
  const call = await getCallById(id);

  if (!call) {
    return Response.json({ error: "Call not found" }, { status: 404 });
  }

  if (call.emergency) {
    return Response.json({ error: "This call was already classified" }, { status: 409 });
  }

  if (!call.transcript) {
    return Response.json(
      { error: "Call has no transcript yet. Save the transcript before classifying." },
      { status: 422 }
    );
  }

  // 2. Clasificar con IA
  // TODO: esta función está vacía — conectar el modelo en src/lib/ai.ts → classifyTranscript()
  const classification = await classifyTranscript(call.transcript);

  // 3. Crear la emergencia con el resultado de la IA
  const emergency = await createEmergency({
    callId: call.id,
    type: classification.type,
    priority: classification.priority,
    description: classification.description,
    address: classification.address,
    aiMetadata: classification.aiMetadata,
  });

  // 4. Devolver la emergencia lista para que el sistema la asigne
  return Response.json(emergency, { status: 201 });
}
