import { getUserPermissions } from "~/data/permissions";
import { Logger } from "~/util/Logger";
import { getMOTD } from "~/util/motd";
import { createToken, getToken, validateToken } from "~/util/token";
import type { ServerEventListener, ServerEvents } from "~/util/types";
import type { Socket } from "~/ws/Socket";
import { config, usersConfigPath } from "~/ws/usersConfig";

const logger = new Logger("Hi handler");

export const hi: ServerEventListener<"hi"> = {
    id: "hi",
    callback: async (msg, socket) => {
        // Handshake message
        if (socket.rateLimits)
            if (!socket.rateLimits.normal.hi.attempt()) return;

        if (socket.gateway.hasProcessedHi) return;

        // Browser challenge
        if (config.browserChallenge === "basic") {
            try {
                if (typeof msg.code !== "string") return;
                const code = atob(msg.code);
                const arr = JSON.parse(code);

                if (arr[0] === true) {
                    socket.gateway.hasCompletedBrowserChallenge = true;

                    if (typeof arr[1] === "string") {
                        socket.gateway.userAgent = arr[1];
                    }
                }
            } catch (err) {
                logger.warn(
                    "Unable to parse basic browser challenge code:",
                    err
                );
            }
        } else if (config.browserChallenge === "obf") {
            // TODO
        }

        // Is the browser challenge enabled and has the user completed it?
        if (
            config.browserChallenge !== "none" &&
            !socket.gateway.hasCompletedBrowserChallenge
        )
            return socket.ban(60000, "Browser challenge not completed");

        let token: string | undefined;
        let generatedToken = false;

        if (config.tokenAuth !== "none") {
            if (typeof msg.token !== "string") {
                socket.gateway.hasSentToken = true;

                // Get a saved token
                token = await getToken(socket.getUserID());
                if (typeof token !== "string") {
                    // Generate a new one
                    token = await createToken(
                        socket.getUserID(),
                        socket.gateway
                    );
                    socket.gateway.isTokenValid = true;

                    if (typeof token !== "string") {
                        logger.warn(
                            `Unable to generate token for user ${socket.getUserID()}`
                        );
                    } else {
                        generatedToken = true;
                    }
                }
            } else {
                // Validate the token
                const valid = await validateToken(
                    socket.getUserID(),
                    msg.token
                );
                if (!valid) {
                    //socket.ban(60000, "Invalid token");
                    //return;
                } else {
                    token = msg.token;
                    socket.gateway.isTokenValid = true;
                }
            }
        }

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

        //logger.debug("Tag:", part.tag);

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
