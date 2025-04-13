import { readFileSync } from "fs";
import { Gateway } from "~/ws/Gateway";
import { config } from "~/ws/usersConfig";
import { Logger } from "./Logger";
import jwt from "jsonwebtoken";
import crypto from "node:crypto";
import { prisma } from "~/data/prisma";

const logger = new Logger("Tokens");

let key: string;

if (config.tokenAuth == "jwt") {
    // TODO: find a better path for this file
    key = readFileSync("./mppkey").toString();
}

/**
 * Generate and save a new token for a user
 * @param userId ID of user
 * @param gateway Socket gateway context
 * @returns Token
 **/
export async function createToken(
    userId: string,
    gateway: Gateway,
    method = config.tokenAuth
) {
    try {
        let token = "";

        // Generate token based on method
        if (method === "uuid") {
            token = userId + "." + crypto.randomUUID();
        } else if (method === "jwt") {
            token = generateJWT(userId, gateway);
        }

        // Save token
        await prisma.token.create({
            data: {
                userId,
                token
            }
        });

        return token;
    } catch (err) {
        logger.warn(`Unable to create token for user ${userId}:`, err);
    }
}

/**
 * Generate a JWT token for a user
 * @param userId User ID
 * @param gateway User gateway instance
 * @returns Signed JWT
 */
export function generateJWT(userId: string, gateway: Gateway) {
    const payload = {
        userId: userId,
        gateway
    };

    return jwt.sign(payload, key, {
        algorithm: "RS256"
    });
}

/**
 * Get a user's tokens
 * @param userId ID of user
 * @returns Token
 **/
export async function getTokens(userId: string) {
    try {
        const tokens = await prisma.token.findMany({
            where: { userId }
        });

        return tokens;
    } catch (err) {
        logger.warn(`Unable to get token for user ${userId}:`, err);
    }
}

/**
 * Delete a user's specific token
 * @param userId User ID
 * @param token Token to remove
 */
export async function deleteToken(userId: string, token: string) {
    try {
        await prisma.token.delete({
            where: {
                userId,
                token
            }
        });
    } catch (err) {
        logger.warn(`Unable to delete token for user ${userId}:`, err);
    }
}

/**
 * Delete all of a user's tokens
 * @param userId User ID
 */
export async function deleteAllTokens(userId: string) {
    try {
        await prisma.token.deleteMany({
            where: {
                userId
            }
        });
    } catch (err) {
        logger.warn(`Unable to delete all tokens for user ${userId}:`, err);
    }
}

/**
 * Get a user's ID from one of their tokens
 * @param token User's token
 * @returns User ID
 */
export async function getUserIDFromToken(token: string) {
    const data = await prisma.token.findUnique({
        where: { token }
    });

    if (data) return data.userId;
}
