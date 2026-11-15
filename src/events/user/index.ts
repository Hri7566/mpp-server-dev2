import { EventGroup, eventGroups } from "../";
import { getUserHandlers } from "./macro";

export async function setupUserEventGroup() {
    const EVENTGROUP_USER = new EventGroup("user");
    EVENTGROUP_USER.addMany(...(await getUserHandlers()));
    eventGroups.push(EVENTGROUP_USER);
}
