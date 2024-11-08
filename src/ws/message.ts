import { Logger } from "~/util/Logger";
import type { Socket } from "./Socket";
import { hasOwn } from "~/util/helpers";

// const logger = new Logger("Message Handler");
// this one sounds cooler
const logger = new Logger("The Messenger");

export function handleMessage(socket: Socket, text: string) {
    try {
        const transmission = JSON.parse(text);

        if (!Array.isArray(transmission)) {
            logger.warn(
                "Received message that isn't an array! --",
                transmission,
                "-- from",
                socket.getUserID()
            );
        } else {
            for (const msg of transmission) {
                if (!hasOwn(msg, "m")) continue;
                if (socket.isDestroyed()) continue;
                socket.emit(msg.m, msg, socket);
            }
        }
    } catch (err) {
        logger.warn("Unable to decode message from", socket.getIP());
        logger.error(err);
    }
}
