import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth";

export async function createUser(data: {
  name: string;
  email: string;
  phoneNumber: string;
  password: string;
}) {
  const passwordHash = await hashPassword(data.password);
  return prisma.user.create({
    data: {
      name: data.name,
      email: data.email,
      phoneNumber: data.phoneNumber,
      passwordHash,
    },
    omit: { passwordHash: true },
  });
}

export async function getUserByEmail(email: string) {
  return prisma.user.findUnique({ where: { email } });
}

export async function getUserById(id: string) {
  return prisma.user.findUnique({
    where: { id },
    omit: { passwordHash: true },
    include: { addresses: true },
  });
}
