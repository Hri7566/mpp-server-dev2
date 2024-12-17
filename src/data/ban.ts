import { Ban } from "@prisma/client";
import { prisma } from "./prisma";

export async function createBan(
    banType: string,
    expires: Date,
    reason?: string,
    userId?: string,
    ip?: string
) {
    await prisma.ban.create({
        data: {
            banType,
            reason,
            expires,
            userId,
            ip
        }
    });
}

export async function readUserBans(userId: string) {
    return await prisma.ban.findMany({
        where: {
            banType: "user",
            userId
        }
    });
}

export async function readSocketBans(ip: string) {
    return await prisma.ban.findMany({
        where: {
            banType: "socket",
            ip
        }
    });
}

export async function clearUserBans(userId: string) {
    return await prisma.ban.deleteMany({
        where: {
            banType: "user",
            userId
        }
    });
}

export async function clearSocketBans(ip: string) {
    return await prisma.ban.deleteMany({
        where: {
            banType: "socket",
            ip
        }
    });
}

export async function clearBan(ban: Ban) {
    return await prisma.ban.delete({
        where: {
            id: ban.id
        }
    });
}
