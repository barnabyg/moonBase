import type { ScreenPoint } from "../render/renderer";

/** A pointer that moves less than this between press and release has clicked rather than dragged. */
const CLICK_TOLERANCE_PX = 6;

/** Where a pointer is on the screen, and which button it pressed or released. */
export interface PointerPoint extends ScreenPoint {
  readonly button: number;
}

/** A press of a pointer, and whether it has strayed far enough since to be a drag. */
export interface Press extends PointerPoint {
  readonly dragged?: boolean;
}

function strayed(press: Press, point: ScreenPoint): boolean {
  return Math.hypot(point.x - press.x, point.y - press.y) > CLICK_TOLERANCE_PX;
}

/**
 * The press, marked as a drag once the pointer, held down, has strayed to
 * a point too far from where it was pressed to be a click.
 */
export function markDraggedIfStrayed(press: Press, point: ScreenPoint): Press {
  return press.dragged === true || !strayed(press, point)
    ? press
    : { ...press, dragged: true };
}

/**
 * Whether a press and release of a pointer on the 3D view is a click,
 * rather than a drag that moves the camera: the same button, released
 * close to where it was pressed, without straying further meanwhile.
 */
export function isClick(
  press: Press | undefined,
  release: PointerPoint,
): boolean {
  return (
    press !== undefined &&
    press.dragged !== true &&
    press.button === release.button &&
    !strayed(press, release)
  );
}

/**
 * Calls back for each click on an element, leaving out drags. With a
 * check given, it hears only clicks that started while the check held
 * as the pointer was pressed.
 */
export function onClick(
  element: HTMLElement,
  click: (event: PointerEvent) => void,
  pressedWhile: () => boolean = () => true,
): void {
  let pressed: Press | undefined;
  element.addEventListener("pointerdown", (event) => {
    pressed = pressedWhile()
      ? { x: event.clientX, y: event.clientY, button: event.button }
      : undefined;
  });
  element.addEventListener("pointermove", (event) => {
    if (pressed !== undefined) {
      pressed = markDraggedIfStrayed(pressed, {
        x: event.clientX,
        y: event.clientY,
      });
    }
  });
  element.addEventListener("pointerup", (event) => {
    const press = pressed;
    pressed = undefined;
    if (
      isClick(press, {
        x: event.clientX,
        y: event.clientY,
        button: event.button,
      })
    ) {
      click(event);
    }
  });
}
