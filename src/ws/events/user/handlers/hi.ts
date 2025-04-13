import { getUserPermissions } from "~/data/permissions";
import { checkChallenge } from "~/util/browserChallenge";
import { Logger } from "~/util/Logger";
import { createToken, getTokens, getUserIDFromToken } from "~/util/token";
import type {
    OutgoingSocketEvents,
    ServerEventListener,
    User
} from "~/util/types";
import { config } from "~/ws/usersConfig";

const logger = new Logger("Hi handler");

export const hi: ServerEventListener<"hi"> = {
    id: "hi",
    callback: async (msg, socket) => {
        let token: string | undefined;

        // Browser challenge check
        checkChallenge(socket, msg.code);

        if (config.tokenAuth !== "none") {
            // Token validator
            if (typeof msg.token === "string") {
                // They sent us a token, get the user from that token
                const userID = await getUserIDFromToken(msg.token);

                if (!userID) {
                    socket.sendDisconnectNotification("Invalid token");
                    return void socket.destroy();
                } else {
                    token = msg.token;
                    socket.setUserID(userID);
                }
            } else if (typeof msg.token === "undefined") {
                let tokens = await getTokens(socket.getUserID());

                if (!Array.isArray(tokens)) tokens = [];

                if (!tokens[0]) {
                    try {
                        token = await createToken(
                            socket.getUserID(),
                            socket.gateway
                        );
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

        await socket.loadUser();

        let part = socket.getParticipant() as User;
        if (!part) {
            part = {
                _id: socket.getUserID(),
                name: config.defaultName,
                color: "#777"
            };
        }

        const permissions = getUserPermissions(socket.getUserID());

        socket.sendArray([
            {
                m: "hi",
                accountInfo: undefined,
                permissions,
                t: Date.now(),
                u: {
                    _id: part._id,
                    name: part.name,
                    color: part.color,
                    tag: config.enableTags ? part.tag : undefined
                },
                token
            } as OutgoingSocketEvents["hi"]
        ]);
    }
};
