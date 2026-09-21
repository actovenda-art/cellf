import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
const manifest = JSON.parse(readFileSync(new URL('../public/manifest.webmanifest', import.meta.url), 'utf8'));

test('a instalação na tela inicial utiliza a identidade oficial da CELLF', () => {
  assert.match(html, /rel="manifest" href="\/manifest\.webmanifest"/u);
  assert.match(html, /rel="apple-touch-icon" sizes="180x180" href="\/apple-touch-icon\.png"/u);
  assert.equal(manifest.short_name, 'CELLF');
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.theme_color, '#d9f15a');
  assert.deepEqual(manifest.icons.map(icon => icon.sizes), ['192x192', '512x512']);
  for (const icon of ['favicon-32.png', 'apple-touch-icon.png', 'icon-192.png', 'icon-512.png']) {
    assert.equal(existsSync(new URL(`../public/${icon}`, import.meta.url)), true, `${icon} deve existir`);
  }
});
