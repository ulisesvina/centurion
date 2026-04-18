import { NextRequest } from "next/server";
import { getCallById, updateCall } from "@/lib/calls";

// GET /api/calls/[id] — detalle de una llamada con su emergencia
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const call = await getCallById(id);

  if (!call) {
    return Response.json({ error: "Call not found" }, { status: 404 });
  }

  return Response.json(call);
}

// PATCH /api/calls/[id] — actualiza estado o transcripción
// Body: { status?: CallStatus, transcript?: string }
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();

  const updated = await updateCall(id, body);
  return Response.json(updated);
}
