import { NextRequest } from "next/server";
import { createEmergency, listPendingEmergencies } from "@/lib/emergencies";

// GET /api/emergencies — lista emergencias activas ordenadas por prioridad (CRITICAL primero)
export async function GET() {
  const emergencies = await listPendingEmergencies();
  return Response.json(emergencies);
}

// POST /api/emergencies — la IA crea una emergencia clasificada a partir de una llamada
// Body: { callId, type, priority, description, address?, latitude?, longitude?, aiMetadata? }
export async function POST(request: NextRequest) {
  const body = await request.json();

  const required = ["callId", "type", "priority", "description"];
  for (const field of required) {
    if (!body[field]) {
      return Response.json({ error: `${field} is required` }, { status: 400 });
    }
  }

  const emergency = await createEmergency(body);
  return Response.json(emergency, { status: 201 });
}
