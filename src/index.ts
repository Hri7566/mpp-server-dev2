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

// If you don't load the server first, bun will literally segfault
import "./ws/server";
import { loadForcedStartupChannels } from "./channel/forceLoad";
import { Logger } from "./util/Logger";
// docker hates this next one
import { startReadline } from "./util/readline";
import { loadDefaultPermissions } from "./data/permissions";

// wrapper for some reason
export function startServer() {
    // Let's construct an entire object just for one thing to be printed
    // and then keep it in memory for the entirety of runtime
    const logger = new Logger("Main");
    logger.info("Forceloading startup channels...");
    loadForcedStartupChannels();

    loadDefaultPermissions();

    // Break the console
    startReadline();

    // Nevermind, two things are printed
    logger.info("Ready");
}

startServer();
