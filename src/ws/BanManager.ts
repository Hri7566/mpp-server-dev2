import { Ban } from "@prisma/client";
import { createBan, readSocketBans, readUserBans } from "~/data/ban";
import { bus } from "~/event/bus";
import { Logger } from "~/util/Logger";

const logger = new Logger("Ban Manager");

export class BanManager {
    public static async isSocketBanned(ip: string) {
        const bans = await readSocketBans(ip);
        if (!bans) return false;
        return await this.checkBanList(bans);
    }

    public static async isUserBanned(_id: string) {
        const bans = await readUserBans(_id);
        if (!bans) return false;
        return this.checkBanList(bans);
    }

    private static async checkBanList(bans: Ban[]) {
        for (const ban of bans) {
            const isExpired = await this.isExpired(ban);
            // logger.debug("ban:", ban);
            // logger.debug("isExpired:", isExpired);
            if (!isExpired) return true;
        }

        return false;
    }

    private static getFurthestBan(bans: Ban[]) {
        let furthest = bans[0];

        for (const ban of bans) {
            if (ban.expires > furthest.expires) furthest = ban;
        }

        return furthest;
    }

    public static async getSocketBans(ip: string) {
        return await readSocketBans(ip);
    }

    public static async getUserBans(_id: string) {
        return await readUserBans(_id);
    }

    public static async getSocketBanTimeRemaining(ip: string) {
        const bans = await readSocketBans(ip);
        if (!bans) return;

        const ban = this.getFurthestBan(bans);
        if (!ban) return;

        return +ban.expires - Date.now();
    }

    public static async getUserBanTimeRemaining(_id: string) {
        const bans = await readUserBans(_id);
        if (!bans) return;

        const ban = this.getFurthestBan(bans);
        if (!ban) return;

        return +ban.expires - Date.now();
    }

    public static async isExpired(ban: Ban) {
        const expired = new Date() > ban.expires;
        // logger.debug("expired:", expired);
        return expired;
    }

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

    public static async getSocketBanReasons(ip: string) {
        const bans = await readSocketBans(ip);
        if (!bans) return "Not banned(?)";
        return bans.filter(b => b.reason !== undefined).map(b => b.reason);
    }

    public static async getUserBanReasons(_id: string) {
        const bans = await readSocketBans(_id);
        if (!bans) return "Not banned(?)";
        return bans.filter(b => b.reason !== undefined).map(b => b.reason);
    }

    public static formatBanText(ban: Ban) {
        return `BID: ${ban.id} | Ban type: ${
            ban.banType
        } | Expires: ${ban.expires.toLocaleString()} | ${
            ban.banType === "socket" ? "IP: " + ban.ip : "_id: " + ban.userId
        } | Reason: ${ban.reason}`;
    }
}
