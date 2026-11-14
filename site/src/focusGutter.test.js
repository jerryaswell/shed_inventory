import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';

// jsdom lays nothing out, so the outline's reach and the scroll containers'
// gutter are compared in the stylesheets themselves.
const css = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const styles = css('./styles.css');
const sheet = css('./kiosk/SearchSheet.css');
const rule = (source, selector) => {
  const match = source.match(new RegExp(`(?:^|\\n)${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{([^}]*)\\}`));
  if (!match) throw new Error(`no rule for ${selector}`);
  return match[1];
};
const px = (block, property) => {
  const match = block.match(new RegExp(`(?:^|[;\\s])${property}:\\s*([^;]+);`));
  if (!match) throw new Error(`no ${property}`);
  return match[1].trim();
};

test('the focus gutter covers the whole reach of the focus outline', () => {
  const focus = rule(styles, 'button:focus-visible, input:focus-visible, [tabindex]:focus-visible');
  const width = parseFloat(px(focus, 'outline').match(/(\d+(?:\.\d+)?)px/)[1]);
  const offset = parseFloat(px(focus, 'outline-offset'));
  const gutter = parseFloat(px(rule(styles, ':root'), '--focus-gutter'));
  expect(gutter).toBeGreaterThanOrEqual(width + offset);
});

test.each([
  ['.kiosk-content', styles],
  ['.sheet-content', sheet]
])('%s pads and scroll-pads by the focus gutter', (selector, source) => {
  const block = rule(source, selector);
  expect(px(block, 'padding')).toMatch(/var\(--focus-gutter\)/);
  expect(px(block, 'scroll-padding')).toBe('var(--focus-gutter)');
});
