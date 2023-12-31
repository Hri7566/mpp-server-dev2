import { EventGroup, eventGroups } from "../../events";

export const EVENTGROUP_USER = new EventGroup("user");

import { hi } from "./handlers/hi";
import { devices } from "./handlers/devices";
import { ch } from "./handlers/ch";
import { m } from "./handlers/m";
import { a } from "./handlers/a";
import { userset } from "./handlers/userset";
import { n } from "./handlers/n";

EVENTGROUP_USER.add(hi);
EVENTGROUP_USER.add(devices);
EVENTGROUP_USER.add(ch);
EVENTGROUP_USER.add(m);
EVENTGROUP_USER.add(a);
EVENTGROUP_USER.add(userset);
EVENTGROUP_USER.add(n);

eventGroups.push(EVENTGROUP_USER);
