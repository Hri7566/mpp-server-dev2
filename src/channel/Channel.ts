import EventEmitter from "events";
import { Logger } from "../util/Logger";
import {
    ChannelSettingValue,
    IChannelSettings,
    ClientEvents,
    Participant,
    ServerEvents,
    IChannelInfo,
    Notification,
    UserFlags,
} from "../util/types";
import type { Socket } from "../ws/Socket";
import { validateChannelSettings } from "./settings";
import { findSocketByPartID, socketsBySocketID } from "../ws/Socket";
import Crown from "./Crown";
import { ChannelList } from "./ChannelList";
import { config } from "./config";
import { saveChatHistory, getChatHistory } from "../data/history";
import { mixin } from "../util/helpers";
import { User } from "@prisma/client";

interface CachedKickban {
    userId: string;
    startTime: number;
    endTime: number;
}

interface ExtraPartData {
    uuids: string[];
    flags: Partial<UserFlags>;
}

type ExtraPart = Participant & ExtraPartData;

export class Channel extends EventEmitter {
    private settings: Partial<IChannelSettings>;
    private ppl = new Array<ExtraPart>();

    public chatHistory = new Array<ClientEvents["a"]>();

    private async loadChatHistory() {
        this.chatHistory = await getChatHistory(this.getID());
    }

    public logger: Logger;
    public bans = new Array<CachedKickban>();
    public cursorCache = new Array<{ x: string | number; y: string | number; id: string }>();

    public crown?: Crown;

    private flags: Record<string, any> = {};

    constructor(
        private _id: string,
        set?: Partial<IChannelSettings>,
        creator?: Socket,
        owner_id?: string,
        public stays: boolean = false
    ) {
        super();

        this.logger = new Logger("Channel - " + _id);
        this.settings = {};

        // Copy default settings
        mixin(this.settings, config.defaultSettings);

        if (!this.isLobby()) {
            if (set) {
                // Validate settings in set
                const validatedSet = validateChannelSettings(set);

                // Set the verified settings
                for (const key of Object.keys(validatedSet)) {
                    this.logger.debug(`${key}: ${(validatedSet as any)[key]}`);
                    if ((validatedSet as any)[key] === false) continue;
                    (this.settings as any)[key] = (set as any)[key];
                }
            }

            this.crown = new Crown();

            if (creator) {
                // if (this.crown.canBeSetBy(creator)) {
                const part = creator.getParticipant();
                if (part) this.giveCrown(part);
                // }
            }
        } else {
            this.settings = config.lobbySettings;
        }

        this.bindEventListeners();

        ChannelList.add(this);
        // TODO implement owner_id
        this.settings.owner_id = owner_id;

        this.logger.info("Created");
    }

    private alreadyBound = false;

    private bindEventListeners() {
        if (this.alreadyBound) return;
        this.alreadyBound = true;
        this.loadChatHistory();
        this.logger.info("Loaded chat history");

        this.on("update", () => {
            //this.logger.debug("-------- UPDATE START --------");
            // Send updated info
            for (const socket of socketsBySocketID.values()) {
                for (const p of this.ppl) {
                    //if (socket.getParticipantID() == p.id) {
                    if (p.uuids.includes(socket.getUUID())) {
                        //this.logger.debug("sending to", socket.getUUID())
                        socket.sendChannelUpdate(
                            this.getInfo(),
                            this.getParticipantList()
                        );

                        // Set their rate limits to match channel status
                        socket.resetRateLimits();
                    }
                }
            }

            if (this.ppl.length == 0 && !this.stays) {
                this.destroy();
            }
        });

        this.on("message", async (msg: ServerEvents["a"], socket: Socket) => {
            if (!msg.message) return;

            const userFlags = socket.getUserFlags();

            if (userFlags) {
                if (userFlags.cant_chat) return;
            }

            if (msg.message.length > 512) return;

            // Sanitize
            msg.message = msg.message
                .replace(/\p{C}+/gu, "")
                .replace(/(\p{Mc}{5})\p{Mc}+/gu, "$1")
                .trim();

            let outgoing: ClientEvents["a"] = {
                m: "a",
                a: msg.message,
                t: Date.now(),
                p: socket.getParticipant() as Participant
            };

            this.sendArray([outgoing]);
            this.chatHistory.push(outgoing);
            await saveChatHistory(this.getID(), this.chatHistory);

            try {
                if (msg.message.startsWith("/")) {
                    this.emit("command", msg, socket);
                }
            } catch (err) {
                this.logger.error(err);
            }
        });

        this.on("command", (msg, socket) => {
            // TODO commands
        });

        this.on("user data update", (user: User) => {
            try {
                if (typeof user.name !== "string") return;
                if (typeof user.color !== "string") return;
                if (typeof user.id !== "string") return;
                if (typeof user.tag !== "undefined" && typeof user.tag !== "string") return;
                if (typeof user.flags !== "undefined" && typeof user.flags !== "string") return;

                let tag;
                let flags;

                try {
                    tag = JSON.parse(user.tag);
                } catch (err) { }

                try {
                    flags = JSON.parse(user.flags);
                } catch (err) { }

                for (const p of this.ppl) {
                    if (p._id !== user.id) continue;

                    p._id = user.id;
                    p.name = user.name;
                    p.color = user.color;
                    p.tag = tag;
                    p.flags = flags;

                    let found;

                    for (const cursor of this.cursorCache) {
                        if (cursor.id == p.id) {
                            found = cursor
                        }
                    }

                    let x: string | number = "0.00";
                    let y: string | number = "-10.00";

                    if (found) {
                        x = found.x;
                        y = found.y;
                    }

                    this.sendArray(
                        [
                            {
                                m: "p",
                                _id: p._id,
                                name: p.name,
                                color: p.color,
                                id: p.id,
                                x: x,
                                y: y
                            }
                        ]
                    );
                }

                this.emit("update", this);
            } catch (err) {
                this.logger.error(err);
                this.logger.warn("Unable to update user");
            }
        });

        this.on("cursor", (pos: { x: string | number; y: string | number; id: string }) => {
            let found;

            for (const cursor of this.cursorCache) {
                if (cursor.id == pos.id) {
                    found = cursor;
                }
            }

            if (!found) {
                // Cache the cursor pos
                this.cursorCache.push(pos);
            } else {
                // Edit the cache
                found.x = pos.x;
                found.y = pos.y;
            }

            this.sendArray([
                {
                    m: "m",
                    id: pos.id,
                    // not type safe
                    x: pos.x as string,
                    y: pos.y as string
                }
            ]);
        });
    }

    /**
     * Get this channel's ID (channel name)
     * @returns Channel ID
     */
    public getID() {
        return this._id;
    }

    /**
     * Determine whether this channel is a lobby (uses regex from config)
     * @returns Boolean
     */
    public isLobby() {
        for (const reg of config.lobbyRegexes) {
            let exp = new RegExp(reg, "g");

            if (this.getID().match(exp)) {
                return true;
            }
        }

        return false;
    }

    /**
     * Determine whether this channel is a lobby with the name "lobby" in it
     */
    public isTrueLobby() {
        if (this.getID().match("^lobby[0-9][0-9]$") && this.getID().match("^lobby[0-9]$") && this.getID().match("^lobby$"), "^lobbyNaN$") return true;

        return false;
    }

    /**
     * Change this channel's settings
     * @param set Channel settings
     * @param admin Whether a user is changing the settings (set to true to force the changes)
     * @returns undefined
     */
    public changeSettings(
        set: Partial<IChannelSettings>,
        admin: boolean = false
    ) {
        if (this.isDestroyed()) return;
        if (!admin) {
            if (set.lobby) set.lobby = undefined;
            if (set.owner_id) set.owner_id = undefined;
        }

        /*
        this.logger.debug(
            "Dreaded color2 conditions:",
            typeof set.color == "string",
            "and",
            typeof set.color2 == "undefined"
        );
        */

        if (
            typeof set.color == "string" &&
            (typeof set.color2 == "undefined" ||
                set.color2 === this.settings.color2)
        ) {
            const r = Math.max(
                0,
                parseInt(set.color.substring(1, 3), 16) - 0x40
            );
            const g = Math.max(
                0,
                parseInt(set.color.substring(3, 5), 16) - 0x40
            );
            const b = Math.max(
                0,
                parseInt(set.color.substring(5, 7), 16) - 0x40
            );

            set.color2 = `#${r.toString(16).padStart(2, "0")}${g
                .toString(16)
                .padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
        }

        if (this.isLobby() && !admin) return;

        // Verify settings
        const validSettings = validateChannelSettings(set);

        for (const key of Object.keys(validSettings)) {
            // Setting is valid?
            if ((validSettings as Record<string, boolean>)[key]) {
                // Change setting
                (this.settings as Record<string, ChannelSettingValue>)[key] = (
                    set as Record<string, ChannelSettingValue>
                )[key];
            }
        }

        this.emit("update", this);
    }

    /**
     * Get a channel setting's value
     * @param setting Channel setting to get
     * @returns Value of setting
     */
    public getSetting(setting: keyof IChannelSettings) {
        return this.settings[setting];
    }

    /**
     * Make a socket join this channel
     * @param socket Socket that is joining
     * @returns undefined
     */
    public join(socket: Socket, force: boolean = false): void {
        if (this.isDestroyed()) return;
        const part = socket.getParticipant() as Participant;

        let hasChangedChannel = false;

        if (!force) {
            // Is user banned?
            if (this.isBanned(part._id)) {
                // Send user to ban channel instead
                // TODO Send notification for ban
                const chs = ChannelList.getList();
                for (const ch of chs) {
                    const chid = ch.getID();
                    if (chid == config.fullChannel) {
                        const banTime = this.getBanTime(socket.getUserID());
                        this.logger.debug("Ban time:", banTime);
                        if (banTime) {
                            const minutes = Math.floor((banTime.endTime - banTime.startTime) / 1000 / 60);

                            socket.sendNotification({
                                class: "short",
                                duration: 7000,
                                target: "#room",
                                text: `Currently banned from "${this.getID()}" for ${minutes} minutes.`
                            });
                        }
                        return socket.setChannel(chid)
                    }
                }
            }

            // Is the channel full?
            if (this.isFull()) {
                // Is this a genuine lobby (not a test/ room)?
                if (this.isTrueLobby()) {
                    const nextID = this.getNextIncrementationFromID();
                    this.logger.debug("New ID:", nextID);
                    return socket.setChannel(nextID, undefined, true)
                }
            }
        }

        // Is user in this channel?
        if (this.hasUser(part._id)) {
            // Already in channel, don't add to list, but tell them they're here
            hasChangedChannel = true;

            for (const p of this.ppl) {
                if (p.id !== part.id) continue;
                p.uuids.push(socket.getUUID())
            }

            socket.sendChannelUpdate(this.getInfo(), this.getParticipantList());
        } else {
            // Are we full?
            if (!this.isFull()) {
                // Add to channel
                hasChangedChannel = true;
                this.ppl.push({
                    _id: part._id,
                    name: part.name,
                    color: part.color,
                    id: part.id,
                    tag: part.tag,
                    uuids: [socket.getUUID()],
                    flags: socket.getUserFlags() || {}
                });
            } else {
                if (socket.currentChannelID !== config.fullChannel) {
                    // Put them in full channel
                    const chs = ChannelList.getList();
                    for (const ch of chs) {
                        const chid = ch.getID();
                        if (chid == config.fullChannel) {
                            return socket.setChannel(chid)
                        }
                    }
                }
            }
        }

        // Was the move complete?
        if (hasChangedChannel) {
            // Were they in a channel before?
            if (socket.currentChannelID) {
                // Find the other channel they were in
                const ch = ChannelList.getList().find(
                    ch => ch._id == socket.currentChannelID
                );

                // Tell the channel they left
                if (ch) ch.leave(socket);
            }

            // You belong here now
            socket.currentChannelID = this.getID();
        }

        // Send our state data back
        socket.sendArray([
            // {
            //     m: "ch",
            //     ch: this.getInfo(),
            //     p: part.id,
            //     ppl: this.getParticipantList()
            // },
            {
                m: "c",
                c: this.chatHistory.slice(-50)
            }
        ]);

        // Get our friend's cursor position
        const cursorPos: {
            x: string | number | undefined;
            y: string | number | undefined;
        } = socket.getCursorPos();

        // Broadcast a participant update for them
        this.sendArray(
            [
                {
                    m: "p",
                    _id: part._id,
                    name: part.name,
                    color: part.color,
                    id: part.id,
                    x: cursorPos.x,
                    y: cursorPos.y
                }
            ],
            part.id
        );

        // Broadcast a channel update so everyone subscribed to the channel list can see us
        this.emit("update", this);

        //this.logger.debug("Settings:", this.settings);
    }

    /**
     * Make a socket leave this channel
     * @param socket Socket that is leaving
     */
    public leave(socket: Socket) {
        // this.logger.debug("Leave called");
        const part = socket.getParticipant() as Participant;

        let dupeCount = 0;
        for (const s of socketsBySocketID.values()) {
            if (s.getParticipantID() == part.id) {
                if (s.currentChannelID == this.getID()) {
                    dupeCount++;
                }
            }
        }

        // this.logger.debug("Dupes:", dupeCount);

        if (dupeCount == 1) {
            const p = this.ppl.find(p => p.id == socket.getParticipantID());

            if (p) {
                this.ppl.splice(this.ppl.indexOf(p), 1);

                if (this.crown) {
                    if (this.crown.participantId == p.id) {
                        // Channel owner left, reset crown timeout
                        this.chown();
                    }
                }
            }

            // Broadcast bye
            this.sendArray([
                {
                    m: "bye",
                    p: part.id
                }
            ]);

            this.emit("update", this);
        } else {
            for (const p of this.ppl) {
                if (!p.uuids.includes(socket.getUUID())) continue;
                p.uuids.splice(p.uuids.indexOf(socket.getUUID()), 1);
            }
        }
    }

    /**
     * Determine whether this channel has too many users
     * @returns Boolean
     */
    public isFull() {
        // TODO Use limit setting

        if (this.isTrueLobby() && this.ppl.length >= 20) {
            return true;
        }

        return false;
    }

    /**
     * Get this channel's information
     * @returns Channel info object (includes ID, number of users, settings, and the crown)
     */
    public getInfo(_id?: string) {
        return {
            _id: this.getID(),
            id: this.getID(),
            banned: _id ? this.isBanned(_id) : false,
            count: this.ppl.length,
            settings: this.settings,
            crown: this.crown
                ? JSON.parse(JSON.stringify(this.crown))
                : undefined
        } as IChannelInfo;
    }

    /**
     * Get the people in this channel
     * @returns List of people
     */
    public getParticipantList() {
        const ppl = [];

        for (const p of this.ppl) {
            if (p.flags.vanish) continue;
            ppl.push({
                _id: p._id,
                name: p.name,
                color: p.color,
                id: p.id,
                tag: config.sendTags ? p.tag : undefined
            });
        }

        return ppl;
    }

    public getParticipantListUnsanitized() {
        return this.ppl;
    }

    /**
     * Determine whether a user is in this channel (by user ID)
     * @param _id User ID
     * @returns Boolean
     */
    public hasUser(_id: string) {
        const foundPart = this.ppl.find(p => p._id == _id);
        return !!foundPart;
    }

    /**
     * Determine whether a user is in this channel (by participant ID)
     * @param id Participant ID
     * @returns Boolean
     */
    public hasParticipant(id: string) {
        const foundPart = this.ppl.find(p => p.id == id);
        return !!foundPart;
    }

    /**
     * Send messages to everyone in this channel
     * @param arr List of events to send to clients
     */
    public sendArray<EventID extends keyof ClientEvents>(
        arr: ClientEvents[EventID][],
        blockPartID?: string
    ) {
        let sentSocketIDs = new Array<string>();

        for (const p of this.ppl) {
            if (blockPartID) {
                if (p.id == blockPartID) continue;
            }

            socketLoop: for (const socket of socketsBySocketID.values()) {
                if (socket.isDestroyed()) continue socketLoop;
                if (socket.getParticipantID() != p.id) continue socketLoop;
                if (sentSocketIDs.includes(socket.socketID))
                    continue socketLoop;
                socket.sendArray(arr);
                sentSocketIDs.push(socket.socketID);
            }
        }
    }

    /**
     * Play notes (usually from a socket)
     * @param msg Note message
     * @param socket Socket that is sending notes
     * @returns undefined
     */
    public playNotes(msg: ServerEvents["n"], socket: Socket) {
        if (this.isDestroyed()) return;
        const part = socket.getParticipant();
        if (!part) return;

        let clientMsg: ClientEvents["n"] = {
            m: "n",
            n: msg.n,
            t: msg.t,
            p: part.id
        };

        let sentSocketIDs = new Array<string>();

        for (const p of this.ppl) {
            socketLoop: for (const socket of socketsBySocketID.values()) {
                if (socket.isDestroyed()) continue socketLoop;
                if (socket.getParticipantID() != p.id) continue socketLoop;
                if (socket.getParticipantID() == part.id) continue socketLoop;
                if (sentSocketIDs.includes(socket.socketID))
                    continue socketLoop;
                socket.sendArray([clientMsg]);
                sentSocketIDs.push(socket.socketID);
            }
        }
    }

    private destroyed = false;

    /**
     * Set this channel to the destroyed state
     * @returns undefined
     */
    public destroy() {
        if (this.destroyed) return;
        this.destroyed = true;

        if (this.ppl.length > 0) {
            for (const socket of socketsBySocketID.values()) {
                if (socket.currentChannelID !== this.getID()) continue;
                socket.setChannel(config.fullChannel);
            }
        }

        ChannelList.remove(this);
        this.logger.info("Destroyed");
    }

    /**
     * Determine whether the channel is in a destroyed state
     * @returns Boolean
     */
    public isDestroyed() {
        return this.destroyed == true;
    }

    /**
     * Change ownership (don't forget to use crown.canBeSetBy if you're letting a user call this)
     * @param part Participant to give crown to (or undefined to drop crown)
     */
    public chown(part?: Participant) {
        if (this.crown) {
            if (part) {
                this.giveCrown(part);
            } else {
                this.dropCrown();
            }
        }
    }

    /**
     * Give the crown to a user (no matter what)
     * @param part Participant to give crown to
     * @param force Whether or not to force-create a crown (useful for lobbies)
     */
    public giveCrown(part: Participant, force?: boolean) {
        if (force) {
            if (!this.crown) this.crown = new Crown();
        }

        if (this.crown) {
            this.crown.userId = part._id;
            this.crown.participantId = part.id;
            this.crown.time = Date.now();
            this.emit("update", this);
        }
    }

    /**
     * Drop the crown (reset timer, and, if applicable, remove from user's head)
     */
    public dropCrown() {
        if (this.crown) {
            this.crown.time = Date.now();

            let socket;
            if (this.crown.participantId)
                socket = findSocketByPartID(this.crown.participantId);

            let x = Math.random() * 100;
            let y1 = Math.random() * 100;
            let y2 = y1 + Math.random() * (100 - y1);

            if (socket) {
                const cursorPos = socket.getCursorPos();

                let cursorX = cursorPos.x;
                if (typeof cursorPos.x == "string")
                    cursorX = parseInt(cursorPos.x);

                let cursorY = cursorPos.y;
                if (typeof cursorPos.y == "string")
                    cursorY = parseInt(cursorPos.y);
            }

            // Screen positions
            this.crown.startPos = { x, y: y1 };
            this.crown.endPos = { x, y: y2 };

            delete this.crown.participantId;

            this.emit("update", this);
        }
    }

    /**
     * Kickban a participant for t milliseconds.
     * @param _id User ID to ban
     * @param t Time in millseconds to ban for
     **/
    public async kickban(_id: string, t: number = 1000 * 60 * 30, banner?: string) {
        const now = Date.now();
        if (t < 0 || t > 300 * 60 * 1000) return;

        let shouldUpdate = false;

        const banChannel = ChannelList.getList().find(
            ch => ch.getID() == config.fullChannel
        );

        if (!banChannel) return;

        // Check if they are on the server at all
        let bannedPart: Participant | undefined;
        const bannedUUIDs: string[] = [];
        for (const sock of socketsBySocketID.values()) {
            if (sock.getUserID() == _id) {
                bannedUUIDs.push(sock.getUUID());
                const part = sock.getParticipant();

                if (part) bannedPart = part;
            }
        }

        if (!bannedPart) return;

        let isBanned = this.bans.map(b => b.userId).includes(_id);
        let overwrite = false;

        if (isBanned) {
            overwrite = true;
        }

        let uuidsToKick: string[] = [];

        if (!overwrite) {
            this.bans.push({
                userId: _id,
                startTime: now,
                endTime: now + t
            });

            shouldUpdate = true;
        } else {

            for (const ban of this.bans) {
                if (ban.userId !== _id) continue;
                ban.startTime = now;
                ban.endTime = now + t;
            }


            shouldUpdate = true;
        }

        uuidsToKick = [...uuidsToKick, ...bannedUUIDs];

        for (const socket of socketsBySocketID.values()) {
            if (uuidsToKick.indexOf(socket.getUUID()) !== -1) {
                socket.sendNotification({
                    title: "Notice",
                    text: `Banned from "${this.getID()}" for ${Math.floor(t / 1000 / 60)} minutes.`,
                    duration: 7000,
                    target: "#room",
                    class: "short"
                });

                // If they are here, move them to the ban channel
                const ch = socket.getCurrentChannel();
                if (ch) {
                    if (ch.getID() == this.getID())
                        socket.setChannel(banChannel.getID());
                }
            }
        }

        if (shouldUpdate) {
            this.emit("update", this);

            if (typeof banner !== "undefined") {
                const p = this.getParticipantListUnsanitized().find(p => p._id == banner);
                const minutes = Math.floor(t / 1000 / 60);

                if (p && bannedPart) {
                    await this.sendChat({
                        m: "a",
                        message: `Banned ${bannedPart.name} from the channel for ${minutes} minutes.`
                    }, p);
                    this.sendNotification({
                        title: "Notice",
                        text: `${p.name} banned ${bannedPart.name} from the channel for ${minutes} minutes.`,
                        duration: 7000,
                        target: "#room",
                        class: "short"
                    });

                    if (banner == _id) {
                        this.sendNotification({
                            title: "Certificate of Award",
                            text: `Let it be known that ${p.name} kickbanned him/her self.`,
                            duration: 7000,
                            target: "#room"
                        });
                    }
                }
            }
        }
    }

    /**
     * Check if a user is banned here right now
     * @param _id User ID
     * @returns True if the user is banned, otherwise false
     **/
    public isBanned(_id: string) {
        const now = Date.now();

        for (const ban of this.bans) {
            if (ban.endTime <= now) {
                // Remove old ban and skip
                this.bans.splice(this.bans.indexOf(ban), 1);
                continue;
            }

            // Check if they are banned
            if (ban.userId == _id) {
                return true;
            }
        }

        return false;
    }

    /**
     * Clear the chat and chat history
     **/
    public async clearChat() {
        this.chatHistory = [];
        await saveChatHistory(this.getID(), this.chatHistory);

        this.sendArray([{
            m: "c",
            c: this.chatHistory
        }]);
    }

    /**
    * Send a notification to this channel
    * @param notif Notification to send
    **/
    public sendNotification(notif: Notification) {
        this.sendArray([{
            m: "notification",
            id: notif.id,
            target: notif.target,
            duration: notif.duration,
            class: notif.class,
            title: notif.title,
            text: notif.text,
            html: notif.html
        }]);
    }

    /**
    * Send a message in chat
    * @param msg Chat message event to send
    * @param p Participant who is "sending the message"
    **/
    public async sendChat(msg: ServerEvents["a"], p: Participant) {
        if (!msg.message) return;

        if (msg.message.length > 512) return;

        // Sanitize
        msg.message = msg.message
            .replace(/\p{C}+/gu, "")
            .replace(/(\p{Mc}{5})\p{Mc}+/gu, "$1")
            .trim();

        let outgoing: ClientEvents["a"] = {
            m: "a",
            a: msg.message,
            t: Date.now(),
            p: p
        };

        this.sendArray([outgoing]);
        this.chatHistory.push(outgoing);
        await saveChatHistory(this.getID(), this.chatHistory);
    }

    /**
     * Set a flag on this channel
     * @param key Flag ID
     * @param val Value of which the flag will be set to
     **/
    public setFlag(key: string, val: any) {
        this.flags[key] = val;
    }

    /**
     * Get a flag on this channel
     * @param key Flag ID
     * @returns Value of flag
     */
    public getFlag(key: string) {
        return this.flags[key];
    }


    /**
     * Get the name of this channel where the number at the end is one higher than this one, given it ends with a number
     **/
    public getNextIncrementationFromID() {
        try {
            const id = this.getID();
            const num = parseInt((id.match(/\d+$/) as string[])[0]);
            return `${id.substring(0, id.length - num.toString().length)}${num + 1}`;
        } catch (err) {
            return config.fullChannel;
        }
    }

    /**
     * Get the amount of time someone is banned in this channel for.
     * @param userId User ID
     * @returns Object containing endTime and startTime of the ban
     **/
    public getBanTime(userId: string) {
        for (const ban of this.bans) {
            if (userId == ban.userId) {
                return { endTime: ban.endTime, startTime: ban.startTime };
            }
        }
    }
}

export default Channel;
