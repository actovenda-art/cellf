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

test('as rotas de produção entregam manifesto e PNGs antes do fallback HTML', () => {
  const { routes } = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
  for (const path of ['/manifest.webmanifest', '/favicon-32.png', '/apple-touch-icon.png', ...manifest.icons.map(icon => icon.src)]) {
    const route = routes.find(item => new RegExp(`^${item.src}$`).test(path));
    const destination = path.replace(new RegExp(`^${route.src}$`), route.dest);
    assert.equal(destination, `/public${path}`, `${path} não pode cair no HTML da aplicação`);
    const bytes = readFileSync(new URL(`..${destination}`, import.meta.url));
    if (path.endsWith('.png')) {
      assert.equal(route.headers['Content-Type'], 'image/png');
      assert.equal(bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
    } else {
      assert.match(route.headers['Content-Type'], /^application\/manifest\+json/u);
      assert.equal(JSON.parse(bytes).short_name, 'CELLF');
    }
  }
});
