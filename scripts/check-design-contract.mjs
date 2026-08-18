import fs from 'node:fs';
import path from 'node:path';

const read = (...parts) => fs.readFileSync(path.join(process.cwd(), ...parts), 'utf8');
const layout = read('app', 'layout.tsx');
const css = read('app', 'design-saturation.css');
const orgCss = read('app', 'org', 'organizational-console.module.css');

const requireText = (source, value, label) => {
  if (!source.includes(value)) throw new Error(`Design contract missing ${label}: ${value}`);
};

requireText(layout, 'dir="rtl"', 'document RTL direction');
requireText(layout, "import './design-saturation.css'", 'design layer import');
requireText(css, 'text-align:right', 'right-aligned Hebrew content');
requireText(css, 'direction:rtl', 'explicit RTL option flow');
requireText(css, ':focus-visible', 'keyboard focus indicator');
requireText(css, 'prefers-reduced-motion:reduce', 'reduced-motion support');
requireText(css, 'min-height:44px', 'mobile touch-target floor');
requireText(css, 'var(--soft-action)', 'single action color role');
requireText(css, 'var(--soft-growth)', 'growth/progress color role');
requireText(css, 'var(--soft-attention)', 'attention color role');
requireText(orgCss, 'direction:rtl', 'organizational RTL isolation');
requireText(orgCss, 'text-align:right', 'organizational right alignment');
requireText(orgCss, ':focus-visible', 'organizational keyboard focus');

if (/text-align\s*:\s*justify/i.test(css) || /text-align\s*:\s*justify/i.test(orgCss)) {
  throw new Error('Fully justified Hebrew text is forbidden by the design contract.');
}

console.log('MATI design contract check passed.');
