import { bridgeName, type DesktopBridge } from "../../electron/desktop-bridge";

/**
 * The functions `names` of the desktop app's bridge, which its preload script
 * exposes on `scope` (the page's `window`), or undefined where it hasn't, as
 * in a browser, or where any of them is missing.
 */
export function bridgeFunctions<Name extends keyof DesktopBridge>(
  scope: object,
  names: readonly Name[],
): Pick<DesktopBridge, Name> | undefined {
  const bridge: unknown = Reflect.get(scope, bridgeName);
  if (typeof bridge !== "object" || bridge === null) return undefined;
  const complete = names.every(
    (name) => typeof Reflect.get(bridge, name) === "function",
  );
  return complete ? (bridge as Pick<DesktopBridge, Name>) : undefined;
}
