import { NextRequest } from "next/server";
import { getEmergencyById, updateEmergencyStatus } from "@/lib/emergencies";
import type { EmergencyStatus } from "@/generated/prisma/enums";

// GET /api/emergencies/[id] — detalle completo con llamada y operador asignado
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const emergency = await getEmergencyById(id);

  if (!emergency) {
    return Response.json({ error: "Emergency not found" }, { status: 404 });
  }

  return Response.json(emergency);
}

// PATCH /api/emergencies/[id] — actualiza el estado
// Body: { status: EmergencyStatus }
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { status }: { status: EmergencyStatus } = await request.json();

  if (!status) {
    return Response.json({ error: "status is required" }, { status: 400 });
  }

  const updated = await updateEmergencyStatus(id, status);
  return Response.json(updated);
}
