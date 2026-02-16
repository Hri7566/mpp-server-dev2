// Bun hoists import so we are kinda forced to use require here...
// Maybe bun should have a setting for that :/

import { setupAdminEventGroup } from "./admin";
import { setupUserEventGroup } from "./user";

// This feels really dirty and months have passed... guess who's fixing it?
// Nobody is. It's going to stay like this.

export function setupEvents() {
    setupUserEventGroup();
    setupAdminEventGroup();
}
