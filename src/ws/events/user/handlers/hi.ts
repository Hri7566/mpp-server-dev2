import { ServerEventListener } from "../../../../util/types";
import { eventGroups } from "../../../events";

export const hi: ServerEventListener<"hi"> = {
    id: "hi",
    callback: (msg, socket) => {
        // TODO Hi message tokens
        let part = socket.getParticipant();

        if (!part) {
            part = {
                _id: socket.getUserID(),
                name: "Anonymous",
                color: "#777",
                id: socket.getParticipantID()
            };
        }

        socket.sendArray([
            {
                m: "hi",
                accountInfo: undefined,
                permissions: undefined,
                t: Date.now(),
                u: part
            }
        ]);
    }
};