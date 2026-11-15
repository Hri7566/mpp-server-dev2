import EventEmitter from "events";
import { Logger } from "~/util/Logger";
import type {
    IChannelSettings,
    SocketMessages,
    SocketEvents,
    IParticipant,
    IChannelInfo,
    Notification,
    TChannelFlags
} from "~/util/types";
import { validateChannelSettings } from "./settings";
import type { Socket } from "~/ws/Socket";
import Crown from "./Crown";
import { ChannelList } from "./ChannelList";
import { config } from "./config";
import { config as partConfig } from "~/participant/config";
import {
    saveChatHistory,
    getChatHistory,
    deleteChatHistory
} from "~/data/history";
import { mixin, darken, hsl2hex } from "~/util/helpers";
import { heapStats } from "bun:jsc";
import {
    deleteSavedChannel,
    getSavedChannel,
    saveChannel
} from "../data/channel";
import { forceloadChannel } from "./forceload";
import { getRoles } from "~/data/role";
import type { Participant } from "~/participant";

interface CachedKickban {
    userId: string;
    startTime: number;
    endTime: number;
}

interface CachedCursor {
    x: string | number;
    y: string | number;
    id: string;
}

/**
 * A channel that hold participants.
 *
 * Any channel can have a crown, a list of banned users, chat history, and has flags.
 */
export class Channel extends EventEmitter {
    private settings: Partial<IChannelSettings>;
    private participants = new Map<Participant["id"], Participant>();

    // TODO: dms?
    public chatHistory = new Array<SocketEvents["a"]>();

    private async loadChatHistory() {
        try {
            this.chatHistory = await getChatHistory(this.getID());

            this.sendArray([
                {
                    m: "c",
                    c: this.chatHistory
                }
            ]);
        } catch (err) {}
    }

    private async deleteChatHistory() {
        try {
            await deleteChatHistory(this.getID());
        } catch (err) {}
    }

    private async deleteData() {
        try {
            await deleteSavedChannel(this.getID());
        } catch (err) {}
    }

    private async save() {
        //this.logger.debug("Saving channel data");
        try {
            const info = this.getInfo();

            const data = {
                id: info._id,
                settings: JSON.stringify(info.settings),
                flags: JSON.stringify(this.flags),
                forceload: this.stays
            };

            //this.logger.debug("Channel data to save:", data);

            await saveChannel(this.getID(), data);
        } catch (err) {
            this.logger.warn("Error saving channel data:", err);
        }
    }

    private async load() {
        //this.logger.debug("Loading saved data");
        try {
            const data = await getSavedChannel(this.getID());
            if (data) {
                try {
                    if (!this.isLobby())
                        this.changeSettings(JSON.parse(data.settings), true);
                    this.setFlags(JSON.parse(data.flags));
                    this.loadChatHistory();

                    if (data.forceload) {
                        forceloadChannel(this.getID());
                    }

                    //this.logger.debug("Loaded channel data:", data);

                    this.update();
                } catch (err) {
                    this.logger.error("Error loading channel data:", err);
                }
            }
        } catch (err) {}
    }

    public logger: Logger;
    public bans = new Array<CachedKickban>();
    public cursorCache = new Array<CachedCursor>();

    public crown?: Crown;

    private flags: TChannelFlags = {};

    constructor(
        private _id: string,
        set?: Partial<IChannelSettings>,
        owner_id?: string,
        public stays = false
    ) {
        super();

        this.logger = new Logger(`Channel - ${_id}`, "logs/channel");
        this.settings = {};

        // Copy default settings
        mixin(this.settings, config.defaultSettings);

        if (owner_id) this.setFlag("owner_id", owner_id);

        if (!this.isLobby()) {
            if (set) {
                // Copied from changeSettings below
                if (
                    typeof set.color === "string" &&
                    (typeof set.color2 === "undefined" ||
                        set.color2 === this.settings.color2)
                ) {
                    //this.logger.debug("color 2 darken triggered");
                    set.color2 = darken(set.color);
                }

                // Validate settings in set
                const validatedSet = validateChannelSettings(set);

                // Set the verified settings
                for (const key of Object.keys(validatedSet)) {
                    //this.logger.debug(`${key}: ${(validatedSet as any)[key]}`);
                    if (validatedSet[key] === false) continue;
                    this.settings[key] = set[key];
                }
            }

            if (!config.disableCrown) {
                // We are not a lobby, so we probably have a crown
                // this.getFlag("no_crown");
                this.crown = new Crown();
            }
        } else {
            this.settings = { ...config.lobbySettings };
        }

        this.bindEventListeners();

        ChannelList.add(this);
        if (this.flags.owner_id) {
            this.settings.owner_id = this.flags.owner_id;
        }

        this.logger.info("Created");

        if (this.getID() === "test/mem") {
            this.memInterval = setInterval(() => {
                this.printMemoryInChat();
            }, 1000);
        }

        if (this.getID() === "rainbowfest") {
            this.setFlag("rainbow", true);
        }
    }

    private destroyTimeout: Timer | undefined;
    private memInterval: Timer | undefined;

    private bindEventListeners() {
        // Load saved data before saving, otherwise defaults overwrite it
        this.load().then(() => this.save());

        this.on("update", () => this.update());

        this.on("command", (msg: SocketMessages["a"], part: Participant) =>
            this.runCommand(msg, part).catch(err =>
                this.logger.warn("Error running command:", err)
            )
        );

        this.on("cursor", (pos: CachedCursor) => {
            let found: CachedCursor | undefined;

            for (const cursor of this.cursorCache) {
                if (cursor.id === pos.id) {
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
                    x: pos.x,
                    y: pos.y
                }
            ]);
        });

        this.on("set owner id", id => {
            this.setFlag("owner_id", id);
        });
    }

    /**
     * Send everyone in this channel (and the channel list) the latest channel info
     */
    public update() {
        if (this.isDestroyed()) return;

        const info = this.getInfo();
        const ppl = this.getParticipantList();

        for (const part of this.participants.values()) {
            for (const socket of part.sockets) {
                socket.sendChannelUpdate(info, ppl);

                // Set their rate limits to match channel status
                socket.resetRateLimits();
            }
        }

        ChannelList.broadcastUpdate(this);
    }

    /**
     * Get this channel's ID (channel name)
     * @returns Channel ID
     */
    public getID() {
        return this._id;
    }

    /**
     * Set this channel's ID (channel name)
     **/
    public setID(_id: string) {
        // probably causes jank, but people can just reload their page or whatever
        // not sure what to do about the URL situation
        this._id = _id;
        //this.logger.debug("Update from setID");
        this.emit("update", this);
    }

    /**
     * Determine whether this channel is a lobby (uses regex from config)
     * @returns Boolean
     */
    public isLobby() {
        for (const reg of config.lobbyRegexes) {
            const exp = new RegExp(reg, "g");

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
        return /^lobby([0-9]{1,2})?$/.test(this.getID());
    }

    /**
     * Change this channel's settings
     * @param set Channel settings
     * @param admin Whether a user is changing the settings (set to true to force the changes)
     * @returns undefined
     */
    public changeSettings(
        set: Partial<IChannelSettings>,
        admin = false,
        persist = true
    ) {
        if (this.isDestroyed()) return;
        if (!admin) {
            if (set.lobby) set.lobby = undefined;
            if (set.owner_id) set.owner_id = undefined;
        }

        if (
            typeof set.color === "string" &&
            (typeof set.color2 === "undefined" ||
                set.color2 === this.settings.color2)
        ) {
            set.color2 = darken(set.color);
        }

        if (this.isLobby() && !admin) return;

        // Validate settings in set
        const validatedSet = validateChannelSettings(set, admin);

        // Set the verified settings
        for (const key of Object.keys(validatedSet)) {
            //this.logger.debug(`${key}: ${(validatedSet as any)[key]}`);
            if (validatedSet[key] === false) continue;
            this.settings[key] = set[key];
        }

        /*
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
        */

        //this.logger.debug("Update from changeSettings");
        if (persist) this.save();
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
     * Get this channel's settings
     * @returns This channel's settings
     */
    public getSettings() {
        return this.settings;
    }

    /**
     * Determine whether this channel has too many users
     * @returns Boolean
     */
    public isFull() {
        if (this.isTrueLobby() && this.participants.size >= 20) {
            return true;
        }

        // Check user-defined participant limit
        if (
            typeof this.settings.limit === "number" &&
            this.participants.size >= this.settings.limit
        ) {
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
            count: this.participants.size,
            settings: this.settings,
            crown: this.crown
                ? JSON.parse(JSON.stringify(this.crown))
                : undefined
        } as IChannelInfo;
    }

    /**
     * Send messages to everyone in this channel
     * @param arr List of events to send to clients
     */
    public sendArray<EventID extends keyof SocketEvents>(
        arr: SocketEvents[EventID][],
        blockPartID?: string
    ) {
        for (const part of this.participants.values()) {
            if (part.id === blockPartID) continue;
            part.sendArray(arr);
        }
    }

    /**
     * Play notes (usually from a socket)
     * @param msg Note message
     * @param socket Socket that is sending notes
     * @returns undefined
     */
    public playNotes(msg: SocketMessages["n"], socket?: Socket) {
        if (this.isDestroyed()) return;
        let pianoPartID = partConfig.adminParticipant.id;

        if (socket) {
            const part = socket.participant;
            if (!part || part.channel !== this) return;
            pianoPartID = part.id;

            const flags = part.user.flags ?? {};

            // Is crownsolo on?
            if (
                this.settings.crownsolo &&
                this.crown &&
                !(flags.admin || flags.mod) &&
                part.id !== this.crown.participantId
            )
                return;

            if (this.flags.player_colors) {
                if (this.getSetting("color") !== part.user.color) {
                    this.changeSettings({ color: part.user.color }, true);
                }
            }
        }

        const clientMsg: SocketEvents["n"] = {
            m: "n",
            n: msg.n,
            t: msg.t,
            p: pianoPartID
        };

        for (const part of this.participants.values()) {
            part.sendArray([clientMsg], socket?.uuid);
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

        clearTimeout(this.destroyTimeout);
        clearInterval(this.memInterval);
        this.stopRainbow();

        // Kick everyone out (copied, since moving them mutates these)
        for (const p of [...this.participants.values()]) {
            for (const s of [...p.sockets]) s.setChannel(config.fullChannel);
        }

        ChannelList.remove(this);
        this.deleteChatHistory();
        this.deleteData();
        this.logger.info("Destroyed");
    }

    /**
     * Determine whether the channel is in a destroyed state
     * @returns Boolean
     */
    public isDestroyed() {
        return this.destroyed === true;
    }

    /**
     * Schedule this channel to be destroyed
     * @param ms Milliseconds from now
     */
    public scheduleDestroy(ms = config.channelDestroyTimeout) {
        if (ms <= 0) return this.destroy();

        clearTimeout(this.destroyTimeout);
        this.destroyTimeout = setTimeout(() => {
            this.destroy();
        }, ms);
    }

    /**
     * Change ownership (don't forget to use crown.canBeSetBy if you're letting a user call this)
     * @param part Participant to give crown to (or undefined to drop crown)
     */
    public chown(part?: IParticipant, admin = false) {
        // this.logger.debug("chown called");
        if (part) {
            this.giveCrown(part, admin);
        } else {
            this.dropCrown();
        }
    }

    public createCrown() {
        this.crown = new Crown();
    }

    /**
     * Give the crown to a user (no matter what)
     * @param part Participant to give crown to
     * @param force Whether or not to force-create a crown (useful for lobbies)
     */
    public giveCrown(part: IParticipant, force = false, update = true) {
        if (force) {
            if (!this.crown) this.createCrown();
        }

        if (this.crown) {
            this.crown.userId = part._id;
            this.crown.participantId = part.id;
            this.crown.time = Date.now();

            if (update) {
                // this.logger.debug("Update from giveCrown");
                this.emit("update", this);
            }
        }
    }

    /**
     * Drop the crown (reset timer, and, if applicable, remove from participant's head)
     */
    public dropCrown() {
        if (!this.crown) return;

        this.crown.time = Date.now();

        const x = Math.random() * 100;
        const y1 = Math.random() * 100;
        const y2 = y1 + Math.random() * (100 - y1);

        // Screen positions
        this.crown.startPos = { x, y: y1 };
        this.crown.endPos = { x, y: y2 };

        this.crown.participantId = undefined;

        this.update();
    }

    public removeCrown() {
        delete this.crown;
    }

    /**
     * Kickban a participant for t milliseconds.
     * @param _id User ID to ban
     * @param t Time in millseconds to ban for
     **/
    public async kickban(
        _id: string,
        t: number = 1000 * 60 * 30,
        banner?: string
    ) {
        const now = Date.now();
        if (t < 0 || t > config.maxBanMinutes * 60 * 1000) return;

        // They have to be on the server
        const bannedParts = [...this.participants.values()].filter(
            p => p.user._id === _id
        );
        const bannedPart = bannedParts[0]?.simple();
        if (!bannedPart) return;

        const existing = this.bans.find(b => b.userId === _id);

        if (existing) {
            existing.startTime = now;
            existing.endTime = now + t;
        } else {
            this.bans.push({
                userId: _id,
                startTime: now,
                endTime: now + t
            });
        }

        const minutes = Math.floor(t / 1000 / 60);

        // Move them to the ban channel
        for (const part of bannedParts) {
            for (const socket of [...part.sockets]) {
                socket.sendNotification({
                    title: "Notice",
                    text: `Banned from "${this.getID()}" for ${minutes} minutes.`,
                    duration: 7000,
                    target: "#room",
                    class: "short"
                });

                socket.setChannel(config.fullChannel);
            }
        }

        this.update();

        if (typeof banner === "undefined") return;

        const p = this.getParticipantByUserID(banner)?.simple();
        if (!p) return;

        await this.sendChatEvent(
            {
                m: "a",
                message: `Banned ${bannedPart.name} from the channel for ${minutes} minutes.`
            },
            p
        );

        this.sendNotification({
            title: "Notice",
            text: `${p.name} banned ${bannedPart.name} from the channel for ${minutes} minutes.`,
            duration: 7000,
            target: "#room",
            class: "short"
        });

        if (banner === _id) {
            const certificate = {
                title: "Certificate of Award",
                text: `Let it be known that ${p.name} kickbanned him/her self.`,
                duration: 7000,
                target: "#room"
            };

            this.sendNotification(certificate);

            for (const part of bannedParts) {
                part.sendArray([{ m: "notification", ...certificate }]);
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

        // Drop expired bans (not while iterating, splicing skips entries)
        this.bans = this.bans.filter(ban => ban.endTime > now);

        return this.bans.some(ban => ban.userId === _id);
    }

    /**
     * Unban a user who was kickbanned from this channel
     * @param _id User ID of banned user
     **/
    public unban(_id: string) {
        const isBanned = this.isBanned(_id);

        if (!isBanned) return;

        this.bans = this.bans.filter(ban => ban.userId !== _id);
    }

    /**
     * Clear the chat and chat history
     **/
    public async clearChat() {
        this.chatHistory = [];
        await saveChatHistory(this.getID(), this.chatHistory);

        this.sendArray([
            {
                m: "c",
                c: this.chatHistory
            }
        ]);
    }

    /**
     * Send a notification to this channel
     * @param notif Notification to send
     **/
    public sendNotification(notif: Notification) {
        this.sendArray([
            {
                m: "notification",
                id: notif.id,
                target: notif.target,
                duration: notif.duration,
                class: notif.class,
                title: notif.title,
                text: notif.text,
                html: notif.html
            }
        ]);
    }

    /**
     * Broadcast a chat message event
     * @param msg Chat message event to send
     * @param p Participant who is "sending the message"
     **/
    public async sendChatEvent(msg: SocketMessages["a"], p: IParticipant) {
        if (typeof msg.message !== "string") return;
        if (msg.message.length > 512) return;

        // Sanitize chat message
        // Regex originally written by chacha for Brandon's server
        // Used with permission
        const message = msg.message
            .replace(/\p{C}+/gu, "")
            .replace(/(\p{Mc}{5})\p{Mc}+/gu, "$1")
            .trim();

        if (!message) return;

        const outgoing: SocketEvents["a"] = {
            m: "a",
            a: message,
            t: Date.now(),
            p
        };

        this.sendArray([outgoing]);
        this.chatHistory.push(outgoing);

        // Limit chat history to 512 messages
        if (this.chatHistory.length > 512) {
            this.chatHistory.splice(0, this.chatHistory.length - 512);
        }

        this.logger.info(`${p._id} ${p.name}: ${message}`);

        try {
            await saveChatHistory(this.getID(), this.chatHistory);
        } catch (err) {
            this.logger.warn("Unable to save chat history:", err);
        }
    }

    /**
     * Send a chat message from a participant in this channel (applies channel rules)
     * @param msg Chat message from client
     * @param p Participant who sent it
     */
    public async chat(msg: SocketMessages["a"], p: IParticipant) {
        if (!this.settings.chat) return;

        await this.sendChatEvent(msg, p);

        if (msg.message.startsWith("/")) {
            const part = this.getParticipant(p.id);
            if (part) this.emit("command", msg, part);
        }
    }

    public async sendChat(message: string) {
        this.sendChatAdmin(message);
    }

    /**
     * Send a chat message as an admin
     * @param message Message to send in chat
     **/
    public async sendChatAdmin(message: string) {
        this.sendChatEvent(
            {
                m: "a",
                message
            },
            partConfig.adminParticipant
        );
    }

    /**
     * Set a flag on this channel
     * @param key Flag ID
     * @param val Value of which the flag will be set to
     **/
    public setFlag<K extends keyof TChannelFlags>(
        key: K,
        val: TChannelFlags[K]
    ) {
        this.flags[key] = val;
        // this.logger.debug("Updating channel flag " + key + " to", val);
        this.emit("update", this);
    }

    /**
     * Get a flag on this channel
     * @param key Flag ID
     * @returns Value of flag
     **/
    public getFlag<K extends keyof TChannelFlags>(key: K) {
        return this.flags[key];
    }

    /**
     * Get the flags on this channel
     * @returns This channel's flags
     */
    public getFlags() {
        return this.flags;
    }

    /**
     * Set the flags on this channel
     * @param flags Flags to set
     **/
    public setFlags(flags: TChannelFlags) {
        this.flags = flags;
        this.save();
        this.updateFlags();
    }

    private updateFlags() {
        if (typeof this.flags.owner_id === "string") {
            this.settings.owner_id = this.flags.owner_id;
        } else {
            delete this.settings.owner_id;
        }

        if (this.flags.rainbow) {
            this.startRainbow();
        } else {
            this.stopRainbow();
        }

        if (this.flags.limit && config.sendLimit) {
            this.settings.limit = this.flags.limit;
        } else {
            delete this.settings.limit;
        }

        if (this.flags.no_crown) {
            delete this.crown;
        }

        this.update();
    }

    /**
     * Get the ID of the next lobby, useful if this channel is full and is also a lobby
     * @returns ID of the next lobby in numeric succession
     **/
    public getNextLobbyID() {
        try {
            const id = this.getID();
            if (id === "lobby") return "lobby2";
            const num = Number.parseInt(id.substring(5));
            return `lobby${num + 1}`;
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
            if (userId === ban.userId) {
                return { endTime: ban.endTime, startTime: ban.startTime };
            }
        }
    }

    /**
     * Print the amount of memory the server is using in chat
     **/
    public printMemoryInChat() {
        const mem = heapStats();
        this.sendChatAdmin(
            `Used: ${(mem.heapSize / 1000 / 1000).toFixed(2)}M / Allocated: ${(
                mem.heapCapacity /
                1000 /
                1000
            ).toFixed(2)}M`
        );
    }

    public setForceload(enable: boolean) {
        this.stays = enable;
        this.save();
    }

    private startedRainbow = false;
    private rainbowInterval: Timer | undefined;
    private rainbowHue = 0;

    public startRainbow() {
        if (this.startedRainbow) return;
        this.startedRainbow = true;
        this.rainbowInterval = setInterval(() => {
            this.rainbowHue++;
            while (this.rainbowHue > 360) this.rainbowHue -= 360;
            while (this.rainbowHue < 0) this.rainbowHue += 360;
            this.changeSettings(
                {
                    color: hsl2hex(this.rainbowHue, 100, 75),
                    color2: hsl2hex(this.rainbowHue, 100, 25)
                },
                true,
                false
            );
        }, 1000 / 5);
    }

    public stopRainbow() {
        if (!this.startedRainbow) return;
        this.startedRainbow = false;
        clearInterval(this.rainbowInterval);
    }

    /**
     * Get a sanitized list of participants in this channel
     * @param showVanished Whether to include vanished users
     * @returns List of sanitized participants
     */
    public getParticipantList(showVanished = false) {
        const ppl = new Array<ReturnType<Participant["simple"]>>();

        for (const p of this.participants.values()) {
            if (!showVanished && p.vanished) continue;
            ppl.push(p.simple());
        }

        return ppl;
    }

    public getParticipantListUnsanitized() {
        return [...this.participants.values()];
    }

    /**
     * Send the channel info and recent chat to a socket that just joined
     * @param part Participant the socket belongs to
     * @param socket Socket that joined
     */
    public sendJoinInfo(part: Participant, socket?: Socket) {
        const msgs: SocketEvents[keyof SocketEvents][] = [
            {
                m: "ch",
                ch: this.getInfo(part.user._id),
                p: part.id,
                ppl: this.getParticipantList()
            },
            {
                m: "c",
                c: this.chatHistory.slice(-50)
            }
        ];

        if (socket) socket.sendArray(msgs);
        else part.sendArray(msgs);
    }

    /**
     * Broadcast a participant's info (name, color, cursor, etc) to the channel
     * @param part Participant to broadcast
     * @param blockPartID Participant ID to skip
     */
    public sendParticipantUpdate(part: Participant, blockPartID?: string) {
        if (part.vanished) return;

        this.sendArray(
            [
                {
                    m: "p",
                    ...part.simple(),
                    x: part.cursorPos.x,
                    y: part.cursorPos.y
                }
            ],
            blockPartID
        );
    }

    /**
     * Add a participant to this channel
     * @param part Participant joining
     */
    public addParticipant(part: Participant) {
        if (this.isDestroyed()) return;

        clearTimeout(this.destroyTimeout);
        this.destroyTimeout = undefined;

        part.channel = this;
        this.participants.set(part.id, part);

        this.sendJoinInfo(part);
        this.sendParticipantUpdate(part, part.id);

        // Did they have the crown before? If so, give it back
        if (
            this.crown &&
            config.chownOnRejoin &&
            this.crown.userId === part.user._id &&
            !this.crown.participantId
        ) {
            this.giveCrown(part.simple(), true);
        } else if (this.settings.owner_id === part.user._id) {
            this.giveCrown(part.simple(), true);
        } else {
            ChannelList.broadcastUpdate(this);
        }
    }

    /**
     * Remove a participant from this channel
     * @param part Participant leaving
     */
    public removeParticipant(part: Participant) {
        if (!this.participants.has(part.id)) return;

        this.participants.delete(part.id);
        if (part.channel === this) part.channel = undefined;

        this.cursorCache = this.cursorCache.filter(c => c.id !== part.id);

        if (this.crown && this.crown.participantId === part.id) {
            // Channel owner left, drop the crown (sends an update)
            this.dropCrown();
        } else {
            this.sendArray([{ m: "bye", p: part.id }]);
            ChannelList.broadcastUpdate(this);
        }

        if (this.participants.size === 0 && !this.stays) {
            this.scheduleDestroy();
        }
    }

    /**
     * Get a participant in this channel by participant ID
     * @param id Participant ID
     */
    public getParticipant(id: string) {
        return this.participants.get(id);
    }

    /**
     * Determine whether a participant is in this channel
     * @param id Participant ID
     * @returns Boolean
     */
    public hasParticipant(id: string) {
        return this.participants.has(id);
    }

    public getParticipantByUserID(_id: string) {
        for (const p of this.participants.values()) {
            if (p.user._id === _id) return p;
        }
    }

    /**
     * Determine whether a user is in this channel (by user ID)
     * @param _id User ID
     * @returns Boolean
     */
    public hasUser(_id: string) {
        return !!this.getParticipantByUserID(_id);
    }

    public async runCommand(msg: SocketMessages["a"], part: Participant) {
        if (!config.enableChatCommands) return;

        const args = msg.message.split(" ");
        const cmd = args[0].substring(1);
        const roles = await getRoles(part.user._id);

        if (cmd === "mem") {
            this.printMemoryInChat();
        } else if (cmd === "roles") {
            this.sendChatAdmin(
                `Roles: ${roles.map(r => r.roleId).join(", ")}`
            );
        }
    }
}

export default Channel;
