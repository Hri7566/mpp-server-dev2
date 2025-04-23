import { EventGroup, eventGroups } from "../../events";

export const EVENT_GROUP_ADMIN = new EventGroup("admin");

import { color } from "./handlers/color";
import { eval_msg } from "./handlers/eval";
import { forceload } from "./handlers/forceload";
import { move } from "./handlers/move";
import { name } from "./handlers/name";
import { notification } from "./handlers/notification";
import { remove_tag } from "./handlers/remove_tag";
import { rename_channel } from "./handlers/rename_channel";
import { restart } from "./handlers/restart";
import { setcolor } from "./handlers/setcolor";
import { setname } from "./handlers/setname";
import { tag } from "./handlers/tag";
import { unforceload } from "./handlers/unforceload";
import { user_flag } from "./handlers/user_flag";
import { admin_chat } from "./handlers/admin_chat";
import { ch_flag } from "./handlers/ch_flag";
import { clear_chat } from "./handlers/clear_chat";

EVENT_GROUP_ADMIN.addMany(
    color,
    name,
    user_flag,
    clear_chat,
    notification,
    restart,
    move,
    rename_channel,
    admin_chat,
    eval_msg,
    tag,
    ch_flag,
    forceload,
    unforceload,
    setcolor,
    setname,
    remove_tag
);

eventGroups.push(EVENT_GROUP_ADMIN);
