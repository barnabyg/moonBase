import { setText } from "./dom";

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
  };
}
