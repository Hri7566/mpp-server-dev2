import { getUserPermissions } from "~/data/permissions";
import { checkChallenge } from "~/util/browserChallenge";
import { Logger } from "~/util/Logger";
import { getMOTD } from "~/util/motd";
import { createToken, getToken, validateToken } from "~/util/token";
import type { ServerEventListener } from "~/util/types";
import { BanManager } from "~/ws/BanManager";
import { config } from "~/ws/usersConfig";

const logger = new Logger("Hi handler");

export const hi: ServerEventListener<"hi"> = {
    id: "hi",
    callback: async (msg, socket) => {
        // Handshake message

        // Check "hi" rate limit
        if (!socket.rateLimits?.normal.hi.attempt()) return;

        // Is the browser challenge enabled and has the user completed it?
        switch (config.browserChallenge) {
            case "basic":
                if (typeof msg.code !== "string") return;
                break;
            case "obf":
                throw new Error("Obfuscated browser challenge not implemented");
                break;
        }

        // Token auth

        let part = socket.getParticipant();

        if (!part) {
            part = {
                _id: socket.getUserID(),
                name: "Anonymous",
                color: "#777",
                id: "",
                tag: undefined
            };
        }

        const permissions: Record<string, boolean> = {};
        (await getUserPermissions(socket.getUserID())).map(perm => {
            permissions[perm] = true;
        });

        socket.sendArray([
            {
                m: "hi",
                accountInfo: undefined,
                permissions,
                t: Date.now(),
                u: {
                    _id: part._id,
                    color: part.color,
                    name: part.name,
                    tag: config.enableTags ? part.tag : undefined
                },
                motd: getMOTD(),
                token
            }
        ]);

        socket.gateway.hasProcessedHi = true;
    }
};
