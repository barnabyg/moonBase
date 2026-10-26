import type { GameEvent } from "../simulation";
import { formatEvent, formatMoment } from "./format";

/** How many of the latest notifications stay on screen. */
const MAX_NOTIFICATIONS = 6;

export interface NotificationList {
  /** Adds the events to the end of the list, dropping the oldest beyond the latest few. */
  add(events: readonly GameEvent[]): void;
}

/**
 * The notification list: what has happened lately, newest last. It only ever
 * shows events, and never pauses the game or waits for the player.
 */
export function createNotificationList(
  container: HTMLElement,
): NotificationList {
  const list = document.createElement("div");
  list.className = "notifications";
  list.setAttribute("role", "log");
  list.setAttribute("aria-label", "Notifications");
  list.hidden = true;
  container.append(list);

  return {
    add(events) {
      for (const event of events) {
        const item = document.createElement("p");
        item.className = "notifications__item";
        if (
          event.kind === "life-support-warning" ||
          event.kind === "mission-director-died"
        ) {
          item.classList.add("notifications__item--warning");
        }
        const time = document.createElement("span");
        time.className = "notifications__time";
        time.textContent = formatMoment(event.atMinute);
        item.append(time, ` ${formatEvent(event)}`);
        list.append(item);
      }
      while (list.childElementCount > MAX_NOTIFICATIONS) {
        list.firstElementChild?.remove();
      }
      list.hidden = list.childElementCount === 0;
    },
  };
}
