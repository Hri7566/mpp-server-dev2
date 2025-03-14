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
import { loadBehaviors } from "./event/behaviors";
import { startHTTPServer } from "./ws/server";

// wrapper for some reason
export function startServer() {
    const logger = new Logger("Main");
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
