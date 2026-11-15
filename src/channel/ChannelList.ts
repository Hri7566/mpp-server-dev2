import type Channel from "./Channel";
import type { Socket } from "~/ws/Socket";

export class ChannelList {
    private static list = new Array<Channel>();
    public static subscribers = new Set<Socket>();

    /**
     * Add a channel to the list
     * @param channel Channel to add
     */
    public static add(channel: Channel) {
        this.list.push(channel);
    }

    /**
     * Remove a channel from the list
     * @param channel Channel to remove
     */
    public static remove(channel: Channel) {
        this.list.splice(this.list.indexOf(channel), 1);
    }

    /**
     * Get the channel list as an array
     * @returns List of channels
     */
    public static getList() {
        return this.list;
    }

    /**
     * Get a channel in the list by its ID
     * @param _id Channel ID
     * @returns Channel
     */
    public static getChannel(_id: string) {
        return this.list.find(ch => ch.getID() === _id);
    }

    /**
     * Find a channel by a fuzzy string
     * @param text Fuzzy string to match against
     * @returns Channel (if found)
     */
    public static findChannelFuzzy(text: string) {
        return this.list.find(
            ch => ch.getID().toLowerCase() == text.toLowerCase()
        );
    }

    /**
     * Get a list of public channels
     * @returns List of channels not including private ones
     */
    public static getPublicList() {
        return this.list.filter(ch => ch.getSetting("visible") == true);
    }

    /**
     * Add a socket to the list of subscribers to send channel list events to
     * @param socket Socket to subscribe
     */
    public static subscribe(socket: Socket) {
        this.subscribers.add(socket);
    }

    /**
     * Remove a socket from the list of subscribers, preventing it from receiving channel list events
     * @param socket Socket to unsubscribe
     */
    public static unsubscribe(socket: Socket) {
        this.subscribers.delete(socket);
    }

    /**
     * Send a channel's updated info to everyone subscribed to the channel list
     * @param channel Channel that changed
     */
    public static broadcastUpdate(channel: Channel) {
        if (channel.getSetting("visible") !== true) return;

        for (const socket of this.subscribers) {
            if (socket.isDestroyed()) {
                this.subscribers.delete(socket);
                continue;
            }

            socket.sendChannelList([channel.getInfo(socket.getUserID())], false);
        }
    }
}
