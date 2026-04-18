import { prisma } from "@/lib/prisma";
import type { CallStatus } from "@/generated/prisma/enums";

export async function createCall(phoneNumber: string) {
  return prisma.call.create({
    data: { phoneNumber },
  });
}

export async function getCallById(id: string) {
  return prisma.call.findUnique({
    where: { id },
    include: { emergency: true },
  });
}

export async function listCalls() {
  return prisma.call.findMany({
    orderBy: { createdAt: "desc" },
    include: { emergency: { select: { priority: true, type: true, status: true } } },
  });
}

export async function updateCall(
  id: string,
  data: { status?: CallStatus; transcript?: string }
) {
  return prisma.call.update({
    where: { id },
    data,
  });
}
