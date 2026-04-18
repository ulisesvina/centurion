import { NextRequest } from "next/server";
import { getOperatorSessionFromRequest, deleteOperatorSession } from "@/lib/auth";

// POST /api/auth/operator/logout
// Header: Authorization: Bearer <token>
export async function POST(request: NextRequest) {
  const session = await getOperatorSessionFromRequest(request);

  if (!session) {
    return Response.json({ error: "No active session" }, { status: 401 });
  }

  await deleteOperatorSession(session.token);
  return Response.json({ message: "Logged out" });
}
