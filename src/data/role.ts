import { IRole } from "~/util/types";
import { prisma } from "./prisma";

export async function getRoles(userId: string) {
    const roles = await prisma.role.findMany({
        where: { userId }
    });

    return roles as IRole[];
}

export async function hasRole(userId: string, roleId: string) {
    const roles = await getRoles(userId);

    for (const role of roles) {
        if (role.roleId === roleId) return true;
    }

    return false;
}

export async function giveRole(userId: string, roleId: string) {
    return (await prisma.role.create({
        data: {
            userId,
            roleId
        }
    })) as IRole;
}

export async function removeRole(userId: string, roleId: string) {
    return await prisma.role.deleteMany({
        where: {
            userId,
            roleId
        }
    });
}
