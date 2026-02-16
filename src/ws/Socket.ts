/**
 * Socket connection module
 *
 * Represents user connections
 */

import EventEmitter from "events";
import type { IChannelSettings, SocketEvents } from "~/util/types";
import { Gateway } from "./Gateway";
import type { ServerWebSocket } from "bun";
import { Logger } from "~/util/Logger";
import crypto from "crypto";
import { Participant } from "~/participant";
import { config } from "~/participant/config";
import { eventGroups } from "~/events";
import { ChannelList } from "~/channel/ChannelList";
import { Channel } from "~/channel";

const logger = new Logger("Sockets");

/**
 * Extended websocket thing
 * Most poeple call this "Client" but it's not on the client...
 * This is likely the source of my memory leaks
 **/
export class Socket extends EventEmitter {
    public static sockets = new Map<Socket["uuid"], Socket>();

    /**
     * Find a socket by their IP
     * probably not unique if they're on different tabs
     * @param ip IP to find
     * @returns Socket object
     **/
    public static findSocketByIP(ip: string) {
        for (const socket of Socket.sockets.values()) {
            if (socket.ip === ip) {
                return socket;
            }
        }
    }

    public uuid = crypto.randomUUID();
    public ip: string;
    public participant?: Participant;
    public gateway = new Gateway();

    constructor(private ws?: ServerWebSocket<{ ip: string }>) {
        super();

        // Assign a UUID
        this.uuid = crypto.randomUUID();
        Socket.sockets.set(this.uuid, this);

        // real user?
        if (ws) {
            // Real u
            this.ip = ws.data.ip;
        } else {
            // Fake user
            const parts = crypto.randomUUID().split("-");
            this.ip = `::ffff:${parseInt(parts[0], 16) % 255}.${parseInt(parts[1], 16) % 255}.${parseInt(parts[3], 16) % 255}.${parseInt(parts[4], 16) % 255}`;
        }

        // Bind a bunch of our event listeners so we do stuff when told to
        this.bindEventListeners();

        // Load stuff
        (async () => {
            // Send a challenge to the browser for MPP.net frontends
            if (config.browserChallenge === "basic") {
                // Basic function
                this.sendArray([
                    {
                        m: "b",
                        code: "~return btoa(JSON.stringify([true, navigator.userAgent]));"
                    }
                ]);
            } else if (config.browserChallenge === "obf") {
                // Obfuscated challenge building
                // TODO
            }
        })();

        // all done
        this.emit("ready");
    }

    public admin = new EventEmitter();

    /**
     * Bind the message handlers to this socket (internal)
     **/
    private bindEventListeners() {
        for (const group of eventGroups) {
            for (const event of group.eventList) {
                if (group.id == "admin") {
                    this.admin.on(event.id, event.callback);
                } else {
                    this.on(event.id, event.callback);
                }
            }
        }
    }

    /**
     * Send this socket an array of messages
     * @param arr Array of messages to send
     **/
    public sendArray<EventID extends keyof SocketEvents>(
        arr: SocketEvents[EventID][]
    ) {
        if (this.isDestroyed() || !this.ws) return;
        this.ws.send(JSON.stringify(arr));
    }

    private destroyed = false;

    /**
     * Forcefully close this socket's connection and remove them from the server
     **/
    public destroy() {
        // Socket was closed or should be closed, clear data

        if (this.participant) this.participant.removeSocket(this);

        // Simulate closure
        try {
            if (this.ws) this.ws.close();
        } catch (err) {
            logger.warn("Problem closing socket:", err);
        }

        this.destroyed = true;
    }

    /**
     * Test if this socket is destroyed
     * @returns Whether this socket is destroyed
     **/
    public isDestroyed() {
        return this.destroyed === true;
    }

    public async setChannel(_id: string, set?: Partial<IChannelSettings>) {
        // make sure participant is loaded
        if (!this.participant) this.assignParticipant();
        if (!this.participant?.loaded) {
            await this.participant?.loadUser();
        }

        if (typeof this.participant === "undefined")
            throw new Error("i have no idea how this happened");

        if (this.participant.channel) {
            if (this.participant.channel.getID() == _id) return;
            this.participant.channel.removeParticipant(this.participant);
        }

        let ch = ChannelList.getChannel(_id);
        if (!ch) {
            ch = new Channel(_id);
        } else {
            if (ch.hasUser(this.participant.user._id)) {
                this.participant = ch.getParticipantByUserID(
                    this.participant.user._id
                ) as Participant;
            }
        }

        ch.addParticipant(this.participant);
    }

    public assignParticipant(part?: Participant) {
        if (part && !part.sockets.has(this)) {
            this.participant = part;
            part.addSocket(this);
        } else {
            this.participant = new Participant(this);
        }

        return this.participant;
    }

    public override on(event: string, callback: (...args: any[]) => unknown) {
        super.on(event, callback);
        return this;
    }

    public override off(event: string, callback: (...args: any[]) => unknown) {
        super.off(event, callback);
        return this;
    }

    public override once(event: string, callback: (...args: any[]) => unknown) {
        super.once(event, callback);
        return this;
    }

    public override emit(event: string, ...args: any[]) {
        try {
            super.emit(event, ...args);
            return true;
        } catch (err) {
            return false;
        }
    }
}

export default Socket;

// biome-ignore lint/suspicious/noExplicitAny: global access for readline shell
(globalThis as any).Socket = Socket;
