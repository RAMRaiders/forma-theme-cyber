/** The box art of a game with none: loaded like any picture, so the box turns as usual. */
export const DEFAULT_FRONT = './default/box-front.svg';
export const DEFAULT_BACK = './default/box-back.svg';

/** A colour of its own for a game with no picture, from its name. */
export function hue(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return h % 360;
}
