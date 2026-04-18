import { NextRequest } from "next/server";
import { getOperatorSessionFromRequest } from "@/lib/auth";

// GET /api/auth/operator/me
// Header: Authorization: Bearer <token>
export async function GET(request: NextRequest) {
  const session = await getOperatorSessionFromRequest(request);

  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  return Response.json({ operator: session.operator, expiresAt: session.expiresAt });
}
