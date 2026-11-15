import { getUserPermissions } from "~/data/permissions";
import { hasRole } from "~/data/role";
import { checkChallenge, isBotClient } from "~/util/browserChallenge";
import { Logger } from "~/util/Logger";
import { getMOTD } from "~/util/motd";
import { createToken, getTokens, getUserIDFromToken } from "~/util/token";
import type { ServerEventListener, SocketEvents } from "~/util/types";
import { createUserIDFromIP } from "~/util/id";
import { config } from "~/participant/config";

const logger = new Logger("Hi handler");

export const hi: ServerEventListener<"hi"> = {
    id: "hi",
    callback: async (msg, socket) => {
        if (!socket.rateLimits.normal.hi.attempt()) return;

        let token: string | undefined;

        // Browser challenge check
        checkChallenge(socket, msg.code);

        if (config.tokenAuth !== "none" && !socket.participant) {
            const ipUserID = createUserIDFromIP(socket.ip);

            // Token validator
            if (typeof msg.token === "string") {
                // They sent us a token, get the user from that token
                const userID = await getUserIDFromToken(msg.token);

                if (!userID) {
                    socket.sendDisconnectNotification("Invalid token");
                    return void socket.destroy();
                }

                token = msg.token;
                socket.userID = userID;
            } else if (typeof msg.token === "undefined") {
                let tokens = await getTokens(ipUserID);
                if (!Array.isArray(tokens)) tokens = [];

                if (!tokens[0]) {
                    try {
                        token = await createToken(ipUserID, socket.gateway);
                    } catch (err) {
                        logger.error("Unable to generate token:", err);
                        socket.sendDisconnectNotification(
                            "Unable to generate token"
                        );
                        return void socket.destroy();
                    }
                } else {
                    token = tokens[0].token;
                }
            } else {
                socket.sendDisconnectNotification("Invalid token format");
                return void socket.destroy();
            }

            if (!token) {
                socket.sendDisconnectNotification("Unable to handle token");
                return void socket.destroy();
            }
        }

        const part = await socket.assignParticipant();
        if (socket.isDestroyed()) return;

        // Clients that said they're bots ("bot"/"broken") are let in with a
        // temporary BOT tag; anything else that failed needs the bot role
        if (
            config.browserChallenge !== "none" &&
            !socket.gateway.hasCompletedBrowserChallenge &&
            !isBotClient(socket) &&
            !(await hasRole(part.user._id, "bot"))
        ) {
            socket.sendDisconnectNotification(
                "Using bots outside of a browser without authorization"
            );
            return void socket.destroy();
        }

        socket.gateway.hasProcessedHi = true;

        const { _id, name, color, tag } = part.simple();

        socket.sendArray([
            {
                m: "hi",
                motd: getMOTD(),
                t: Date.now(),
                u: { _id, name, color, tag },
                permissions: await getUserPermissions(part.user._id),
                accountInfo: undefined,
                token
            } as SocketEvents["hi"]
        ]);
    }
};
