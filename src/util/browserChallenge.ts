import { Socket } from "~/ws/Socket";
import { config } from "~/ws/usersConfig";
import { Logger } from "./Logger";

const logger = new Logger("Browser Challenge Handler");

export function checkChallenge(socket: Socket, code?: string) {
    if (config.browserChallenge === "none") socket.gateway.hasCompletedBrowserChallenge = true;
    if (config.browserChallenge === "basic") checkBasicChallenge(socket, code);
    if (config.browserChallenge === "obf") checkObfChallenge(socket, code);
}

export function checkBasicChallenge(socket: Socket, code?: string) {
    try {
        if (typeof code !== "string") return;

        // Parse b64 as array
        const parsed = atob(code);
        const arr = JSON.parse(parsed);

        // Is the first element true?
        if (arr[0] === true) {
            // They have completed the challenge (dumb)
            socket.gateway.hasCompletedBrowserChallenge = true;

            if (typeof arr[1] === "string") {
                // If they have sent a user agent, the server will keep track of it
                socket.gateway.userAgent = arr[1];
            }
        }
    } catch (err) {
        logger.warn(
            "Unable to parse basic browser challenge code:",
            err
        );
    }
}

export function checkObfChallenge(socket: Socket, code?: string) {
    throw new Error("Method not implemented");
}
