import { prisma } from "@/lib/prisma";
import type { CallStatus } from "@/generated/prisma/enums";

export async function createCall(phoneNumber: string) {
  return prisma.call.create({
    data: { phoneNumber },
    select: { id: true, phoneNumber: true, status: true, createdAt: true },
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
  data: { status?: CallStatus; transcript?: string; userId?: string }
) {
  return prisma.call.update({ where: { id }, data });
}
