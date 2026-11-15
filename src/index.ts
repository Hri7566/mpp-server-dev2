/**
 * MPP Server 2
 * for https://www.multiplayerpiano.dev/
 * Written by Hri7566
 * This code is licensed under the GNU General Public License v3.0.
 * Please see `./LICENSE` for more information.
 */

/**
 * Main entry point for the server
 **/

// There are a lot of unhinged bs comments in this repo
// Pay no attention to the ones that cuss you out

import { loadForcedStartupChannels } from "./channel/forceload";
import { Logger } from "./util/Logger";
// docker hates this next one
import { startReadline } from "./util/readline";
import { loadDefaultPermissions } from "./data/permissions";
import { loadBehaviors } from "./events/behaviors";
import { startHTTPServer } from "./ws/server";

// wrapper for some reason
export function startServer() {
    const logger = new Logger("Main");

    // Last line of defense: Bun exits on these by default,
    // which lets a single bad message take the whole server down
    process.on("unhandledRejection", reason => {
        logger.error("Unhandled promise rejection:", reason);
    });

    process.on("uncaughtException", err => {
        logger.error("Uncaught exception:", err);
    });

    logger.info("Forceloading startup channels...");
    loadForcedStartupChannels();
    logger.info("Finished forceloading");

    logger.info("Loading behaviors...");
    loadBehaviors();
    logger.info("Finished loading behaviors");

    loadDefaultPermissions();

    // Break the console
    logger.info("Starting REPL");
    startReadline();

    startHTTPServer();
    logger.info("Ready");
}

// startServer();
