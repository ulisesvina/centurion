import { NextRequest } from "next/server";
import { resolveAssignment } from "@/lib/assignments";

// PATCH /api/assignments/[id] — el operador cierra el caso
// Body: { notes?: string }
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json().catch(() => ({}));

  const resolved = await resolveAssignment(id, body.notes);
  return Response.json(resolved);
}
