import { prisma } from "@/lib/prisma";

export async function createUser(data: { name: string }) {
  return prisma.user.create({ data, include: { address: true } });
}

export async function getUserById(id: string) {
  return prisma.user.findUnique({
    where: { id },
    include: { address: true },
  });
}

export async function listUsers() {
  return prisma.user.findMany({ include: { address: true } });
}

export async function deleteUser(id: string) {
  return prisma.user.delete({ where: { id } });
}
