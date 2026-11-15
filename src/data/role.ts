import { IRole } from "~/util/types";
import { prisma } from "./prisma";
import { bus } from "~/events/bus";

/** Gives a much higher note quota (see NoteQuota.PARAMS_BLACK_MIDI) */
export const ROLE_BLACK_MIDI = "blackMidi";

/**
 * Role IDs of users that are currently loaded, so hot paths (like picking a
 * note quota) can check roles without a database query
 */
const roleCache = new Map<string, Set<string>>();

/**
 * Load a user's roles into the cache
 * @param userId User ID
 * @returns Set of role IDs
 */
export async function loadRoles(userId: string) {
    const roles = new Set((await getRoles(userId)).map(r => r.roleId));
    roleCache.set(userId, roles);
    return roles;
}

/**
 * Check a role using the cache (false if the user's roles aren't loaded)
 * @param userId User ID
 * @param roleId Role ID
 */
export function hasCachedRole(userId: string, roleId: string) {
    return roleCache.get(userId)?.has(roleId) ?? false;
}

/**
 * Forget a user's cached roles (when they're no longer connected)
 * @param userId User ID
 */
export function forgetRoles(userId: string) {
    roleCache.delete(userId);
}

/**
 * Refresh the cache after a change and let connected sockets know
 * @param userId User ID
 */
async function rolesChanged(userId: string) {
    if (roleCache.has(userId)) await loadRoles(userId);
    bus.emit("user roles update", userId);
}

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
    const role = (await prisma.role.create({
        data: {
            userId,
            roleId
        }
    })) as IRole;

    await rolesChanged(userId);
    return role;
}

export async function removeRole(userId: string, roleId: string) {
    const result = await prisma.role.deleteMany({
        where: {
            userId,
            roleId
        }
    });

    await rolesChanged(userId);
    return result;
}
