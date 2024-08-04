import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";

/**
 * Get saved channel data from the database
 * @param channelId ID of channel to get
 * @returns Saved channel data
 */
export async function getSavedChannel(channelId: string) {
    try {
        return await prisma.channel.findUnique({
            where: {
                id: channelId
            }
        });
    } catch (e) {
        return null;
    }
}

/**
 * Save channel data to the database (update if already exists)
 * @param channelId ID of channel to save
 * @param channel Channel data to save
 */
export async function saveChannel(channelId: string, channel: Prisma.ChannelUpdateInput & Prisma.ChannelCreateInput) {
    try {
        return await prisma.channel.upsert({
            where: {
                id: channelId
            },
            update: channel,
            create: channel
        });
    } catch (e) {
        console.error(e);
    }
}

/**
 * Delete channel data from the database
 * @param channelId ID of channel to delete
 */
export async function deleteSavedChannel(channelId: string) {
    try {
        return await prisma.channel.delete({
            where: {
                id: channelId
            }
        });
    } catch (e) {
        console.error(e);
    }
}
