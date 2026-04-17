import { NextRequest } from "next/server";
import { createCall, listCalls } from "@/lib/calls";

// GET /api/calls — lista todas las llamadas
export async function GET() {
  const calls = await listCalls();
  return Response.json(calls);
}

// POST /api/calls — registra una nueva llamada entrante
// Body: { phoneNumber: string }
export async function POST(request: NextRequest) {
  const body = await request.json();

  if (!body.phoneNumber) {
    return Response.json({ error: "phoneNumber is required" }, { status: 400 });
  }

  const call = await createCall(body.phoneNumber);
  return Response.json(call, { status: 201 });
}
