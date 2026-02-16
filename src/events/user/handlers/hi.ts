import { Logger } from "~/util/Logger";
import { getMOTD } from "~/util/motd";
import type { ServerEventListener, SocketEvents } from "~/util/types";

const logger = new Logger("Hi handler");

export const hi: ServerEventListener<"hi"> = {
    id: "hi",
    callback: async (msg, socket) => {
        logger.debug("Socket connecting");
        socket.assignParticipant();

        if (!socket.participant) {
            throw new Error(
                "Something went horrible! Contact your idiot today!!!!! ooops"
            );
        }

        let user = socket.participant.user;

        socket.sendArray([
            {
                m: "hi",
                motd: getMOTD(),
                t: Date.now(),
                u: user
            } as SocketEvents["hi"]
        ]);
    }
};
