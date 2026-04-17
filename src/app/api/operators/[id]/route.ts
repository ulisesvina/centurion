import { NextRequest } from "next/server";
import { updateOperatorStatus } from "@/lib/operators";
import type { OperatorStatus } from "@/generated/prisma/enums";

// PATCH /api/operators/[id] — cambia el estado del operador (AVAILABLE, BUSY, OFFLINE)
// Body: { status: OperatorStatus }
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { status }: { status: OperatorStatus } = await request.json();

  if (!status) {
    return Response.json({ error: "status is required" }, { status: 400 });
  }

  const updated = await updateOperatorStatus(id, status);
  return Response.json(updated);
}
