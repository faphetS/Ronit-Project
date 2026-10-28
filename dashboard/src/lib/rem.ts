/** A design size in px, as rem, so sizes set in code follow the desktop UI scale like the CSS does (see theme.css). */
export function rem(px: number): string {
  return `${px / 16}rem`;
}
