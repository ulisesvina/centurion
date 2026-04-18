import { NextRequest } from "next/server";
import { getCallById, updateCall } from "@/lib/calls";
import { createEmergency } from "@/lib/emergencies";
import { classifyTranscript } from "@/lib/ai";
import { prisma } from "@/lib/prisma";

// POST /api/calls/:id/classify
//
// El bot llama este endpoint cuando termina la conversación con el ciudadano.
//
// Body (todo opcional salvo transcript si no fue guardado antes):
// {
//   user?: { name: string; address?: { street, extNumber, intNumber?, neighborhood, city, state, postalCode, references?, latitude?, longitude? } }
// }
//
// Flujo:
//   1. Lee la llamada
//   2. Si viene `user`, crea el User + Address y los vincula a la Call
//   3. Manda el transcript a la IA
//   4. Crea la Emergency con el resultado
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json().catch(() => ({}));

  const call = await getCallById(id);

  if (!call) {
    return Response.json({ error: "Call not found" }, { status: 404 });
  }

  if (call.emergency) {
    return Response.json({ error: "This call was already classified" }, { status: 409 });
  }

  if (!call.transcript) {
    return Response.json(
      { error: "Call has no transcript yet. Save the transcript before classifying." },
      { status: 422 }
    );
  }

  // Crear User + Address si la IA los recopiló durante la llamada
  let userId: string | undefined;
  if (body.user?.name) {
    const addressData = body.user.address;

    const user = await prisma.user.create({
      data: {
        name: body.user.name,
        ...(addressData && {
          address: { create: addressData },
        }),
      },
      include: { address: true },
    });

    userId = user.id;
    await updateCall(id, { userId });
  }

  // Clasificar con IA
  // TODO: conectar el modelo real en src/lib/ai.ts → classifyTranscript()
  const classification = await classifyTranscript(call.transcript);

  // Vincular la dirección del usuario a la emergencia si existe
  const userAddressId = userId
    ? (await prisma.user.findUnique({ where: { id: userId }, select: { address: { select: { id: true }, take: 1 } } }))
        ?.address[0]?.id
    : undefined;

  const emergency = await createEmergency({
    callId: call.id,
    type: classification.type,
    priority: classification.priority,
    description: classification.description,
    addressId: classification.addressId ?? userAddressId,
    aiMetadata: classification.aiMetadata,
  });

  return Response.json(emergency, { status: 201 });
}
