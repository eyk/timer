/** Read intrinsic CSS dimensions, rather than duplicating card heights in Rust and TypeScript. */
export function contentSize(root: HTMLElement): { width: number; height: number } {
  const workspace = root.querySelector<HTMLElement>('.workspace')!;
  const style = getComputedStyle(workspace);
  const gap = parseFloat(style.rowGap);
  const paddingY = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
  const paddingX = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
  const entry = root.querySelector<HTMLElement>('.entry, .alarm')!;
  const running = root.querySelector<HTMLElement>('.running');
  const error = root.querySelector<HTMLElement>('.error');
  const footer = root.querySelector<HTMLElement>('footer')!;
  const probe = root.querySelector<HTMLElement>('.digit-measure')!;
  const entryHeight = parseFloat(getComputedStyle(entry).minHeight);
  const height = paddingY + entryHeight + (running ? running.scrollHeight + gap : 0)
    + (error ? error.getBoundingClientRect().height + gap : 0) + footer.getBoundingClientRect().height;
  const footerStyle = getComputedStyle(footer);
  const footerWidth = Array.from(footer.children).reduce((sum, child) => sum + child.getBoundingClientRect().width, 0)
    + parseFloat(footerStyle.paddingLeft) + parseFloat(footerStyle.paddingRight) + parseFloat(footerStyle.columnGap);
  const width = Math.max(360, probe.getBoundingClientRect().width + paddingX + 16, footerWidth);
  return { width: Math.ceil(width), height: Math.ceil(height) };
}
