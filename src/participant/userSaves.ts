/**
 * Delayed saving of user name/color changes
 *
 * Users can spam-change their name. Changes apply in memory (and are
 * broadcast) right away, but are only written to the database when the
 * user's socket closes, on a periodic sweep, or on shutdown.
 */

import { updateUser } from "~/data/user";
import { Logger } from "~/util/Logger";

export type PendingUserChange = { name?: string; color?: string };

const logger = new Logger("User Saves");

/** user ID -> changes not saved to the database yet */
const pending = new Map<string, PendingUserChange>();

/** user ID -> save currently being written */
const inFlight = new Map<string, Promise<void>>();

/** How often unsaved changes are written, in milliseconds (30 minutes) */
export const USER_SAVE_INTERVAL = 30 * 60 * 1000;

/**
 * Queue a change to be saved later (merges with any unsaved change)
 * @param _id User ID
 * @param change Fields that changed
 */
export function queueUserChange(_id: string, change: PendingUserChange) {
    const merged = { ...pending.get(_id) };

    if (typeof change.name === "string") merged.name = change.name;
    if (typeof change.color === "string") merged.color = change.color;

    if (Object.keys(merged).length > 0) pending.set(_id, merged);
}

/**
 * Get a user's unsaved changes
 * @param _id User ID
 */
export function getPendingUserChange(_id: string) {
    return pending.get(_id);
}

/**
 * Layer a user's unsaved changes over data loaded from the database
 * @param _id User ID
 * @param user User data (modified in place)
 */
export function applyPendingUserChange<T extends PendingUserChange>(
    _id: string,
    user: T
) {
    const change = pending.get(_id);
    if (!change) return user;

    if (typeof change.name === "string") user.name = change.name;
    if (typeof change.color === "string") user.color = change.color;

    return user;
}

/**
 * Throw away unsaved changes (e.g. an admin set the name directly)
 * @param _id User ID
 * @param keys Fields to discard, or all of them
 */
export function discardPendingUserChange(
    _id: string,
    keys?: (keyof PendingUserChange)[]
) {
    const change = pending.get(_id);
    if (!change) return;

    if (!keys) {
        pending.delete(_id);
        return;
    }

    for (const key of keys) delete change[key];
    if (Object.keys(change).length === 0) pending.delete(_id);
}

/**
 * Write a user's unsaved changes to the database
 * @param _id User ID
 */
export async function flushUser(_id: string) {
    // Wait for any save already running for this user, so writes land in
    // order and callers (like shutdown) know the data is really saved
    const running = inFlight.get(_id);
    if (running) await running;

    const change = pending.get(_id);

    if (!change) {
        // Someone else may have just started saving it, wait for that too
        await inFlight.get(_id);
        return;
    }

    pending.delete(_id);

    const save = (async () => {
        try {
            await updateUser(_id, change);
        } catch (err) {
            logger.warn(`Unable to save user ${_id}:`, err);

            // Put it back, unless something newer was queued meanwhile
            if (!pending.has(_id)) pending.set(_id, change);
        }
    })();

    inFlight.set(_id, save);

    try {
        await save;
    } finally {
        if (inFlight.get(_id) === save) inFlight.delete(_id);
    }
}

/**
 * Write every unsaved change to the database
 * (also waits for saves that are already running)
 */
export async function flushAllUsers() {
    const ids = new Set([...pending.keys(), ...inFlight.keys()]);
    await Promise.all([...ids].map(_id => flushUser(_id)));
}

/**
 * Number of users with unsaved changes
 */
export function pendingUserCount() {
    return pending.size;
}

let saveTimer: Timer | undefined;

/**
 * Start the periodic save sweep
 * @param ms Interval in milliseconds
 */
export function startUserSaveTimer(ms = USER_SAVE_INTERVAL) {
    clearInterval(saveTimer);

    saveTimer = setInterval(() => {
        const count = pending.size;
        if (count === 0) return;

        logger.info(`Saving ${count} user(s) with unsaved changes`);
        flushAllUsers().catch(err =>
            logger.warn("Error saving users:", err)
        );
    }, ms);
}

export function stopUserSaveTimer() {
    clearInterval(saveTimer);
    saveTimer = undefined;
}
