import { Ban } from "@prisma/client";
import { createBan, readSocketBans, readUserBans } from "~/data/ban";
import { bus } from "~/event/bus";
import { Logger } from "~/util/Logger";

const logger = new Logger("Ban Manager");

export class BanManager {
    /**
     * Check if a socket is banned (IP banned)
     * @param ip IP address
     * @returns Whether the socket is banned
     */
    public static async isSocketBanned(ip: string) {
        const bans = await readSocketBans(ip);
        if (!bans) return false;
        return await this.checkBanList(bans);
    }

    /**
     * Check if a user is banned (ID banned)
     * @param _id User ID
     * @returns Whether a user is banned
     */
    public static async isUserBanned(_id: string) {
        const bans = await readUserBans(_id);
        if (!bans) return false;
        return this.checkBanList(bans);
    }

    /**
     * Check if a ban in a list is expired
     * @param bans List of bans
     * @returns Whether any of the bans in this list are expired
     */
    private static async checkBanList(bans: Ban[]) {
        for (const ban of bans) {
            const isExpired = await this.isExpired(ban);
            if (!isExpired) return true;
        }

        return false;
    }

    /**
     * Get the ban in a list that expires the furthest time from now
     * @param bans List of bans
     * @returns The latest-expiring ban
     */
    private static getFurthestBan(bans: Ban[]) {
        let furthest = bans[0];

        for (const ban of bans) {
            if (ban.expires > furthest.expires) furthest = ban;
        }

        return furthest;
    }

    /**
     * Get a socket's ban list
     * @param ip IP address
     * @returns List of socket bans (IP bans)
     */
    public static async getSocketBans(ip: string) {
        return await readSocketBans(ip);
    }

    /**
     * Get a user's ban list
     * @param _id User ID
     * @returns List of user bans (ID bans)
     */
    public static async getUserBans(_id: string) {
        return await readUserBans(_id);
    }

    /**
     * Get a socket's ban duration
     * @param ip IP address
     * @returns Milliseconds remaining for furthest ban
     */
    public static async getSocketBanTimeRemaining(ip: string) {
        const bans = await readSocketBans(ip);
        if (!bans) return;

        const ban = this.getFurthestBan(bans);
        if (!ban) return;

        return +ban.expires - Date.now();
    }

    /**
     * Get a user's ban duration
     * @param _id User ID
     * @returns Milliseconds remanining for furthest ban
     */
    public static async getUserBanTimeRemaining(_id: string) {
        const bans = await readUserBans(_id);
        if (!bans) return;

        const ban = this.getFurthestBan(bans);
        if (!ban) return;

        return +ban.expires - Date.now();
    }

    /**
     * Check if a ban is expired
     * @param ban Ban instance
     * @returns Whether the ban has expired
     */
    public static async isExpired(ban: Ban) {
        const expired = new Date() > ban.expires;
        // logger.debug("expired:", expired);
        return expired;
    }

    /**
     * Ban a socket for a duration (IP ban)
     * @param ip IP address
     * @param duration Duration in milliseconds to ban
     * @param reason Reason for ban
     */
    public static async banSocket(
        ip: string,
        duration: number,
        reason?: string
    ) {
        const expires = new Date(Date.now() + duration);

        await createBan("socket", expires, reason, undefined, ip);

        bus.emit("ban", {
            banType: "socket",
            ip,
            duration,
            reason
        });
    }

    /**
     * Ban a user for a duration (ID ban)
     * @param _id User ID
     * @param duration Duration in milliseconds to ban
     * @param reason Reason for ban
     */
    public static async banUser(
        _id: string,
        duration: number,
        reason?: string
    ) {
        const expires = new Date(Date.now() + duration);

        await createBan("user", expires, reason, _id);

        bus.emit("ban", {
            banType: "user",
            _id,
            duration,
            reason
        });
    }

    /**
     * Get the reasons a socket is banned for
     * @param ip IP address
     * @returns List of reasons from active bans
     */
    public static async getSocketActiveBanReasons(ip: string) {
        const bans = await readSocketBans(ip);
        if (!bans) return "Not banned(?)";
        return bans
            .filter(b => b.reason !== undefined && !this.isExpired(b))
            .map(b => b.reason);
    }

    /**
     * Get the reasons a user is banned for
     * @param _id User ID
     * @returns List of reasons from actives bans
     */
    public static async getUserActiveBanReasons(_id: string) {
        const bans = await readSocketBans(_id);
        if (!bans) return "Not banned(?)";
        return bans
            .filter(b => b.reason !== undefined && !this.isExpired(b))
            .map(b => b.reason);
    }

    /**
     * Stringify a ban instance
     * @param ban Ban instance
     * @returns Formatted ban text
     */
    public static formatBanText(ban: Ban) {
        return `BID: ${ban.id} | Ban type: ${
            ban.banType
        } | Expires: ${ban.expires.toLocaleString()} | ${
            ban.banType === "socket" ? "IP: " + ban.ip : "_id: " + ban.userId
        } | Reason: ${ban.reason}`;
    }
}
