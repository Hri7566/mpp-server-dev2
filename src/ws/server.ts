import { Logger } from "~/util/Logger";
import { createSocketID, createUserIDFromIP } from "../util/id";
import fs from "node:fs";
import path from "node:path";
import { handleMessage } from "./message";
import { Socket, socketsByUUID } from "./Socket";
import env from "~/util/env";
import { getMOTD } from "~/util/motd";
import nunjucks from "nunjucks";
import type { Server, ServerWebSocket } from "bun";
import { ConfigManager } from "~/util/config";
import { usersConfigPath } from "./usersConfig";
import { ChannelList } from "~/channel/ChannelList";

const logger = new Logger("WebSocket Server");

// ip -> timestamp
// for checking if they visited the site and are also connected to the websocket
export const httpIpCache = new Map<string, number>();

interface IFrontendConfig {
    topButtons: "original" | "mppnet" | "git-links" | "none";
    disableChat: boolean;
    winter: boolean;
    enableSlide: boolean;
    createdRoomSocialLinks: boolean;
    playingAloneSocialLinks: boolean;
    motd: string;
    hideChatOnDisconnect: boolean;
}

export const frontendConfigPath = "config/frontend.yml";

export const frontendConfig = ConfigManager.loadConfig<IFrontendConfig>(
    frontendConfigPath,
    {
        topButtons: "git-links",
        disableChat: false,
        winter: false,
        enableSlide: false,
        createdRoomSocialLinks: false,
        playingAloneSocialLinks: false,
        motd: "This site makes a lot of sound! You may want to adjust the volume before continuing.",
        hideChatOnDisconnect: false
    }
);

/**
 * Get a rendered version of the index file
 * @returns Response with html in it
 */
async function getIndex(path?: string, userID?: string) {
    // This tiny function took like an hour to write because
    // nobody realistically uses templates in 2024 and documents
    // it well enough to say what library they used

    // I totally forget if this even works

    const index = Bun.file("./public/index.html");

    const configs: Record<string, unknown> = {
        motd: getMOTD(),
        config: ConfigManager.getOriginalConfigObject(frontendConfigPath),
        usersConfig: ConfigManager.getOriginalConfigObject(usersConfigPath)
    };

    try {
        if (typeof path === "string") {
            const ch = ChannelList.getChannel(
                path == "/" ? "lobby" : decodeURIComponent(path.substring(1))
            );

            if (typeof ch !== "undefined") {
                configs.urlChannel = ch.getInfo(userID);
            }
        }
    } catch (err) {}

    const base64config = btoa(JSON.stringify(configs));
    configs.base64config = base64config;

    // logger.debug(configs);

    const rendered = nunjucks.renderString(await index.text(), configs);

    const response = new Response(rendered);
    response.headers.set("Content-Type", "text/html");

    return response;
}

type ServerWebSocketMPP = ServerWebSocket<{ ip: string; socket: Socket }>;

export let app: Server;

export function startHTTPServer() {
    app = Bun.serve<{ ip: string }>({
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

            let _id;

            try {
                _id = createUserIDFromIP(ip);
            } catch (err) {}

            // Time for unreadable blocks of confusion
            try {
                // Is it a file?
                if (fs.lstatSync(file).isFile()) {
                    // Read the file
                    const data = Bun.file(file);

                    // Return the file
                    if (data) {
                        return new Response(data);
                    }

                    return getIndex(url, _id);
                }

                // Return the index file, since it's a channel name or something
                return getIndex(url, _id);
            } catch (err) {
                // Return the index file as a coverup of our extreme failure
                return getIndex(url, _id);
            }
        },
        websocket: {
            open: (ws: ServerWebSocketMPP) => {
                // swimming in the pool
                const socket = new Socket(ws, createSocketID());

                ws.data.socket = socket;
                // logger.debug("Connection at " + socket.getIP());

                if (socket.socketID === undefined) {
                    socket.socketID = createSocketID();
                }

                socketsByUUID.set(socket.getUUID(), socket);

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

            message: (ws: ServerWebSocketMPP, message: string) => {
                // Fucking string
                const msg = message.toString();

                // Let's find out wtf they even sent
                handleMessage(ws.data.socket, msg);
            },

            close: (ws: ServerWebSocketMPP, code, message) => {
                // This usually gets called when someone leaves,
                // but it's also used internally just in case
                // some dickhead can't close their tab like a
                // normal person.

                const socket = ws.data.socket as Socket;
                if (socket) {
                    socket.destroy();

                    for (const sockID of socketsByUUID.keys()) {
                        const sock = socketsByUUID.get(sockID);

                        if (sock === socket) {
                            socketsByUUID.delete(sockID);
                        }
                    }
                }
            }
        }
    });

    logger.info("Listening on port", env.PORT);
}
