import { setText } from "./dom";
import { createMeter } from "./stat";

/**
 * The frame of a screen that opens over the map, such as the Research Tasks
 * screen: a header that stays in place, with the title, an optional figure
 * beside it and a button that closes it; a body that scrolls on its own
 * beneath; and a footer with why the latest choice was refused, so that it
 * stays in sight whatever is scrolled. Esc closes it too, as it does any
 * dialog. The game runs on while it is open.
 */
export interface Screen {
  readonly dialog: HTMLDialogElement;
  /** What stays in place over the body, for anything else that should, such as tabs. */
  readonly header: HTMLElement;
  /** Beside the title, for a figure such as the Science to spend. */
  readonly figure: HTMLElement;
  /** Under the title, for a line saying what the screen is for. */
  readonly lead: HTMLElement;
  /** What scrolls. */
  readonly body: HTMLElement;
  open(): void;
  /** Shows why a choice was refused, or clears it with undefined. */
  refuse(message: string | undefined): void;
  /**
   * Splits the body into tabs, shown one at a time, with the tabs in the
   * header. The first is shown until the player picks another, which stays
   * picked between visits.
   */
  addTabs(
    label: string,
    tabs: readonly { readonly id: string; readonly label: string }[],
  ): readonly ScreenTab[];
}

/** A tab of a screen, and the panel it shows in the body. */
export interface ScreenTab {
  readonly id: string;
  readonly tab: HTMLButtonElement;
  readonly panel: HTMLElement;
}

/**
 * A figure such as the Payload Mass, in words a screen reader reads out as
 * it changes, over a bar showing how much of its limit it takes.
 */
export interface Gauge {
  readonly element: HTMLElement;
  show(text: string, fraction: number | undefined): void;
}

export function createGauge(name: string): Gauge {
  const element = document.createElement("div");
  element.className = "gauge";
  const text = document.createElement("p");
  text.className = "gauge__text";
  text.setAttribute("role", "status");
  text.setAttribute("aria-label", name);
  const meter = createMeter();
  element.append(text, meter.element);
  return {
    element,
    show(shown, fraction) {
      setText(text, shown);
      meter.fill(fraction);
      element.classList.toggle(
        "gauge--full",
        fraction !== undefined && fraction >= 0.95,
      );
    },
  };
}

export function createScreen(
  container: HTMLElement,
  options: { readonly className: string; readonly title: string },
): Screen {
  const { className } = options;
  const dialog = document.createElement("dialog");
  dialog.className = `screen ${className}`;
  dialog.setAttribute("aria-labelledby", `${className}-title`);

  const header = document.createElement("header");
  header.className = "screen__header";
  const title = document.createElement("h2");
  title.id = `${className}-title`;
  title.className = "screen__title";
  title.textContent = options.title;
  const figure = document.createElement("p");
  figure.className = "screen__figure";
  const close = document.createElement("button");
  close.type = "button";
  close.className = "screen__close";
  close.setAttribute("aria-label", "Close");
  close.title = "Close (Esc)";
  close.textContent = "×";
  close.addEventListener("click", () => {
    dialog.close();
  });
  const lead = document.createElement("p");
  lead.className = "screen__lead";
  header.append(title, figure, close, lead);

  const body = document.createElement("div");
  body.className = "screen__body";

  const refusal = document.createElement("p");
  refusal.className = "screen__refusal";
  refusal.setAttribute("role", "alert");
  refusal.hidden = true;

  dialog.append(header, body, refusal);
  dialog.addEventListener("close", () => {
    refusal.hidden = true;
  });
  container.append(dialog);

  return {
    dialog,
    header,
    figure,
    lead,
    body,
    open() {
      if (!dialog.open) dialog.showModal();
    },
    refuse(message) {
      refusal.hidden = message === undefined;
      setText(refusal, message ?? "");
    },
    addTabs(label, tabs) {
      const list = document.createElement("div");
      list.className = "screen__tabs";
      list.setAttribute("role", "tablist");
      list.setAttribute("aria-label", label);
      header.append(list);
      const entries = tabs.map(({ id, label: name }) => {
        const tab = document.createElement("button");
        tab.type = "button";
        tab.className = "screen__tab";
        tab.id = `${className}-tab-${id}`;
        tab.setAttribute("role", "tab");
        const text = document.createElement("span");
        text.textContent = name;
        tab.append(text);
        const panel = document.createElement("div");
        panel.id = `${className}-panel-${id}`;
        panel.setAttribute("role", "tabpanel");
        panel.setAttribute("aria-labelledby", tab.id);
        tab.setAttribute("aria-controls", panel.id);
        list.append(tab);
        body.append(panel);
        return { id, tab, panel };
      });
      const select = (index: number, focus: boolean): void => {
        for (const [each, { tab, panel }] of entries.entries()) {
          const selected = each === index;
          tab.setAttribute("aria-selected", String(selected));
          tab.tabIndex = selected ? 0 : -1;
          panel.hidden = !selected;
          if (selected && focus) tab.focus();
        }
        body.scrollTop = 0;
      };
      for (const [index, { tab }] of entries.entries()) {
        tab.addEventListener("click", () => {
          select(index, false);
        });
        // Arrow keys move between the tabs, as in any tab list.
        tab.addEventListener("keydown", (event) => {
          const step =
            event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
          if (step === 0) return;
          event.preventDefault();
          select((index + step + entries.length) % entries.length, true);
        });
      }
      select(0, false);
      return entries;
    },
  };
}
