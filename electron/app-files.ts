import { isAbsolute, join, relative, resolve } from "node:path";

/** The scheme and host the production build is served from (app-protocol.ts). */
export const appScheme = "app";
export const appHost = "moonbase";
export const appUrl = `${appScheme}://${appHost}/`;

/**
 * The file under `root` that an app: URL asks for, or undefined if it asks for
 * one outside `root` or another host. A folder means its index.html, as a web
 * server would serve it.
 */
export function resolveAppFile(
  root: string,
  requestUrl: string,
): string | undefined {
  let pathname: string;
  try {
    const url = new URL(requestUrl);
    if (url.protocol !== `${appScheme}:` || url.host !== appHost) {
      return undefined;
    }
    pathname = decodeURIComponent(url.pathname);
  } catch {
    return undefined;
  }
  const base = resolve(root);
  const file = resolve(
    join(base, pathname.endsWith("/") ? `${pathname}index.html` : pathname),
  );
  const inside = relative(base, file);
  if (inside === "" || inside.startsWith("..") || isAbsolute(inside)) {
    return undefined;
  }
  return file;
}
