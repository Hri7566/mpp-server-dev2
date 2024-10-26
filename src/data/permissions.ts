import { ConfigManager } from "~/util/config";
import { prisma } from "./prisma";
import { getRoles } from "./role";
import { Logger } from "~/util/Logger";

export const config = ConfigManager.loadConfig<Record<string, string[]>>(
    "config/permissions.yml",
    {
        admin: [
            "clearChat",
            "vanish",
            "chsetAnywhere",
            "chownAnywhere",
            "usersetOthers",
            "siteBan",
            "siteBanAnyReason",
            "siteBanAnyDuration",
            "event.admin.*"
        ]
    }
);

const logger = new Logger("Permission Handler");

export async function getRolePermissions(roleId: string) {
    const permissions = await prisma.rolePermission.findMany({
        where: { roleId }
    });

    return permissions;
}

export async function hasPermission(roleId: string, permission: string) {
    const permissions = await getRolePermissions(roleId);

    if (permissions.find(p => p.permission === permission)) return true;
    return false;
}

export async function addRolePermission(roleId: string, permission: string) {
    return await prisma.rolePermission.create({
        data: {
            roleId,
            permission
        }
    });
}

export async function removeRolePermission(roleId: string, permission: string) {
    return await prisma.rolePermission.deleteMany({
        where: {
            roleId,
            permission
        }
    });
}

export async function removeAllRolePermissions(roleId?: string) {
    return await prisma.rolePermission.deleteMany({
        where: {
            roleId
        }
    });
}

export async function getUserPermissions(userId: string) {
    const roles = await getRoles(userId);
    let collectivePerms: string[] = [];

    for (const role of roles) {
        const perms = await getRolePermissions(role.roleId);
        collectivePerms.push(...perms.map(p => p.permission));
    }

    return collectivePerms;
}

export function validatePermission(permission1: string, permission2: string) {
    let perm1 = permission1.split(".");
    let perm2 = permission2.split(".");

    let length = Math.max(perm1.length, perm2.length);

    for (let i = 0; i < length; i++) {
        let p1 = perm1[i];
        let p2 = perm2[i];

        if (p1 === "*" || p2 === "*") break;
        if (p1 !== p2) return false;

        if (i === length - 1) {
            return true;
        } else if (p1 === p2) {
            continue;
        }
    }

    return true;
}

export async function loadDefaultPermissions() {
    logger.info("Loading default permissions...");

    for (const roleId of Object.keys(config)) {
        // logger.debug("Adding roles for", roleId);
        const permissions = config[roleId];

        for (const permission of permissions) {
            if (await hasPermission(roleId, permission)) {
                // logger.debug("Permission already exists:", roleId, permission);
                continue;
            }
            // logger.debug("Adding permission:", roleId, permission);
            await addRolePermission(roleId, permission);
        }
    }

    logger.info("Loaded default permissions");
}
