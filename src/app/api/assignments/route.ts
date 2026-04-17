import { NextRequest } from "next/server";
import { assignEmergency } from "@/lib/assignments";
import { getAvailableOperator } from "@/lib/operators";

// POST /api/assignments — asigna una emergencia a un operador
// Body: { emergencyId, operatorId? }
// Si no se manda operatorId, toma el primer operador disponible automáticamente
export async function POST(request: NextRequest) {
  const body = await request.json();

  if (!body.emergencyId) {
    return Response.json({ error: "emergencyId is required" }, { status: 400 });
  }

  let operatorId = body.operatorId;

  if (!operatorId) {
    const operator = await getAvailableOperator();
    if (!operator) {
      return Response.json(
        { error: "No available operators at this time" },
        { status: 503 }
      );
    }
    operatorId = operator.id;
  }

  const assignment = await assignEmergency(body.emergencyId, operatorId);
  return Response.json(assignment, { status: 201 });
}
