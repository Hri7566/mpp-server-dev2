import { EventGroup, eventGroups } from "../../events";

export const EVENTGROUP_USER = new EventGroup("user");

import { hi } from "./handlers/hi";
import { devices } from "./handlers/devices";
import { ch } from "./handlers/ch";
import { m } from "./handlers/m";
import { a } from "./handlers/a";
import { userset } from "./handlers/userset";
import { n } from "./handlers/n";
import { plus_ls } from "./handlers/+ls";
import { minus_ls } from "./handlers/-ls";
import { admin_message } from "./handlers/admin_message";
import { chset } from "./handlers/chset";
import { kickban } from "./handlers/kickban";
import { bye } from "./handlers/bye";
import { chown } from "./handlers/chown";
import { unban } from "./handlers/unban";
import { plus_custom } from "./handlers/+custom";
import { minus_custom } from "./handlers/-custom";
import { custom } from "./handlers/custom";

EVENTGROUP_USER.addMany(
    hi,
    devices,
    ch,
    m,
    a,
    userset,
    n,
    plus_ls,
    minus_ls,
    admin_message,
    chset,
    kickban,
    unban,
    bye,
    chown,
    plus_custom,
    minus_custom,
    custom
);

eventGroups.push(EVENTGROUP_USER);
