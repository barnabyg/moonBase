import { setText } from "./dom";

/** How long a refusal stays on screen, in real milliseconds. */
const REFUSAL_SHOWN_MS = 8000;

/** The result of a player's choice the Campaign may refuse, with the reason in words. */
export type ChoiceResult =
  { readonly ok: true } | { readonly ok: false; readonly message: string };

/**
 * Says why the player's latest choice from the panels was refused, near
 * the top of the screen, for a few seconds, so that it doesn't linger once
 * things have changed. Returns the function the panels pass each result to.
 */
export function createRefusal(
  container: HTMLElement,
): (result: ChoiceResult) => void {
  const refusal = document.createElement("p");
  refusal.className = "refusal";
  refusal.setAttribute("role", "alert");
  refusal.hidden = true;
  container.append(refusal);
  let timer: ReturnType<typeof setTimeout> | undefined;
  return (result) => {
    clearTimeout(timer);
    refusal.hidden = result.ok;
    setText(refusal, result.ok ? "" : result.message);
    if (!result.ok) {
      timer = setTimeout(() => {
        refusal.hidden = true;
      }, REFUSAL_SHOWN_MS);
    }
  };
}
