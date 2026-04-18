import { NextRequest } from "next/server";
import { getSessionFromRequest, deleteSession } from "@/lib/auth";

// POST /api/auth/logout
// Header: Authorization: Bearer <token>
export async function POST(request: NextRequest) {
  const session = await getSessionFromRequest(request);

  if (!session) {
    return Response.json({ error: "No active session" }, { status: 401 });
  }

  await deleteSession(session.token);
  return Response.json({ message: "Logged out" });
}
