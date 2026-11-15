import { EventGroup, eventGroups } from "../";
import { getAdminHandlers } from "./macro";

export async function setupAdminEventGroup() {
    const EVENT_GROUP_ADMIN = new EventGroup("admin");
    EVENT_GROUP_ADMIN.addMany(...(await getAdminHandlers()));
    eventGroups.push(EVENT_GROUP_ADMIN);
}
