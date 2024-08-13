import { Logger } from "../util/Logger";
import { createSocketID, createUserID } from "../util/id";
import fs from "fs";
import path from "path";
import { handleMessage } from "./message";
import { Socket, socketsBySocketID } from "./Socket";
import env from "../util/env";
import { getMOTD } from "../util/motd";
import nunjucks from "nunjucks";
import { metrics } from "../util/metrics";

const logger = new Logger("WebSocket Server");

// ip -> timestamp
// for checking if they visited the site and are also connected to the websocket
const httpIpCache = new Map<string, number>();

/**
 * Get a rendered version of the index file
 * @returns Response with html in it
 */
async function getIndex() {
    // This tiny function took like an hour to write because
    // nobody realistically uses templates in 2024 and documents
    // it well enough to say what library they used

    // I totally forget if this even works

    const index = Bun.file("./public/index.html");

    const rendered = nunjucks.renderString(await index.text(), {
        motd: getMOTD()
    });

    const response = new Response(rendered);
    response.headers.set("Content-Type", "text/html");

    return response;
}

export const app = Bun.serve<{ ip: string }>({
    port: env.PORT,
    hostname: "0.0.0.0",
    fetch: (req, server) => {
        const reqip = server.requestIP(req);
        if (!reqip) return;

        const ip = req.headers.get("x-forwarded-for") || reqip.address;

        // Upgrade websocket connections
        if (server.upgrade(req, { data: { ip } })) {
            return;
        }

        httpIpCache.set(ip, Date.now());
        const url = new URL(req.url).pathname;

        // lol
        // const ip = decoder.decode(res.getRemoteAddressAsText());
        // logger.debug(`${req.getMethod()} ${url} ${ip}`);
        // res.writeStatus(`200 OK`).end("HI!");

        // I have no clue if this is even safe...
        // wtf do I do when the user types "/../.env" in the URL?
        // From my testing, nothing out of the ordinary happens...
        // but just in case, if you find something wrong with URLs,
        // this is the most likely culprit

        const file = path.join("./public/", url);

        // Time for unreadable blocks of confusion
        try {
            // Is it a file?
            if (fs.lstatSync(file).isFile()) {
                // Read the file
                const data = Bun.file(file);

                // Return the file
                if (data) {
                    return new Response(data);
                } else {
                    return getIndex();
                }
            } else {
                // Return the index file, since it's a channel name or something
                return getIndex();
            }
        } catch (err) {
            // Return the index file as a coverup of our extreme failure
            return getIndex();
        }
    },
    websocket: {
        open: ws => {
            // swimming in the pool
            const socket = new Socket(ws, createSocketID());

            (ws as unknown as any).socket = socket;
            // logger.debug("Connection at " + socket.getIP());

            if (socket.socketID == undefined) {
                socket.socketID = createSocketID();
            }

            socketsBySocketID.set(socket.socketID, socket);

            const ip = socket.getIP();

            if (httpIpCache.has(ip)) {
                const date = httpIpCache.get(ip);

                if (date) {
                    if (Date.now() - date < 1000 * 60) {
                        // They got the page and we were connected in under a minute
                        socket.gateway.hasConnectedToHTTPServer = true;
                    } else {
                        // They got the page and a long time has passed
                        httpIpCache.delete(ip);
                    }
                }
            }
        },

        message: (ws, message) => {
            // Fucking string
            const msg = message.toString();

            // Let's find out wtf they even sent
            handleMessage((ws as unknown as any).socket, msg);
        },

        close: (ws, code, message) => {
            // This usually gets called when someone leaves,
            // but it's also used internally just in case
            // some dickhead can't close their tab like a
            // normal person.

            const socket = (ws as unknown as any).socket as Socket;
            if (socket) {
                socket.destroy();

                for (const sockID of socketsBySocketID.keys()) {
                    const sock = socketsBySocketID.get(sockID);

                    if (sock == socket) {
                        socketsBySocketID.delete(sockID);
                    }
                }
            }
        }
    }
});

logger.info("Listening on port", env.PORT);
