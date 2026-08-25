import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const stylesheet = readFileSync(new URL('../public/styles.css', import.meta.url), 'utf8');
const application = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
const css = stylesheet.replace(/\/\*[\s\S]*?\*\//gu, '');

function blocks(source = css) {
  const result = [];
  let cursor = 0;

  while (cursor < source.length) {
    const openingBrace = source.indexOf('{', cursor);

    if (openingBrace === -1) break;

    const selector = source.slice(cursor, openingBrace).trim();
    let depth = 1;
    let closingBrace = openingBrace + 1;

    while (closingBrace < source.length && depth > 0) {
      if (source[closingBrace] === '{') depth += 1;
      if (source[closingBrace] === '}') depth -= 1;
      closingBrace += 1;
    }

    assert.equal(depth, 0, 'Bloco CSS sem fechamento: ' + selector);

    result.push({
      selector,
      body: source.slice(openingBrace + 1, closingBrace - 1)
    });
    cursor = closingBrace;
  }

  return result;
}

function selectorsOf(rule) {
  const selectors = [];
  let selector = '';
  let depth = 0;
  let quote = '';

  for (let index = 0; index < rule.selector.length; index += 1) {
    const character = rule.selector[index];

    if (quote) {
      selector += character;
      if (character === quote && rule.selector[index - 1] !== '\\') quote = '';
      continue;
    }

    if (character === '"' || character === "'") {
      quote = character;
      selector += character;
      continue;
    }

    if (character === '(' || character === '[') depth += 1;
    if (character === ')' || character === ']') depth -= 1;

    if (character === ',' && depth === 0) {
      selectors.push(selector.trim());
      selector = '';
      continue;
    }

    selector += character;
  }

  if (selector.trim()) selectors.push(selector.trim());
  return selectors;
}

function rulesFor(selector, source = css) {
  return blocks(source).filter(rule => selectorsOf(rule).includes(selector));
}

function propertyValues(selector, property, source = css) {
  assert.match(property, /^[a-z-]+$/iu, 'O nome da propriedade CSS precisa ser válido.');
  const expression = new RegExp('(?:^|;)\\s*' + property + '\\s*:\\s*([^;]+)', 'giu');

  return rulesFor(selector, source)
    .flatMap(rule => Array.from(rule.body.matchAll(expression), match => match[1].trim()));
}

function assertProperty(selector, property, expected, source = css) {
  const values = propertyValues(selector, property, source);

  assert.ok(values.length > 0, 'A regra ' + selector + ' precisa definir ' + property + '.');
  assert.ok(
    values.some(value => expected.test(value)),
    'A propriedade ' + property + ' em ' + selector + ' precisa corresponder a ' +
      expected + '; valores encontrados: ' + values.join(', ')
  );
}

function mediaScopes(condition) {
  return blocks()
    .filter(rule => rule.selector.startsWith('@media') && condition.test(rule.selector))
    .map(rule => rule.body)
    .join('\n');
}

function widthScope(width) {
  return mediaScopes(new RegExp('max-width\\s*:\\s*' + width + 'px', 'iu'));
}

function containerScopes(condition) {
  return blocks()
    .filter(rule => rule.selector.startsWith('@container') && condition.test(rule.selector))
    .map(rule => rule.body)
    .join('\n');
}

function assertSomeProperty(selectors, property, expected, source = css) {
  const values = selectors.flatMap(selector => (
    propertyValues(selector, property, source).map(value => ({ selector, value }))
  ));

  assert.ok(
    values.some(entry => expected.test(entry.value)),
    'Uma das regras ' + selectors.join(', ') + ' precisa definir ' + property +
      ' compatível com ' + expected + '; valores encontrados: ' +
      values.map(entry => entry.selector + ' = ' + entry.value).join(', ')
  );
}

function functionMarkup(name) {
  const match = new RegExp(
    '(?:^|\\r?\\n)(?:async\\s+)?function\\s+' + name + '\\s*\\(',
    'u'
  ).exec(application);

  assert.ok(match, 'A função de interface ' + name + ' precisa existir.');

  const start = match.index + (
    application[match.index] === '\r'
      ? 2
      : application[match.index] === '\n'
        ? 1
        : 0
  );
  const remainder = application.slice(start);
  const next = /\r?\n(?:async\s+)?function\s+[A-Za-z_$][\w$]*\s*\(/u.exec(remainder);

  return next ? remainder.slice(0, next.index) : remainder;
}

test('a folha de estilos possui blocos completos e regras de aplicação', () => {
  const parsed = blocks();

  assert.ok(parsed.length >= 100, 'A aplicação precisa manter sua folha de estilos completa.');
  assert.ok(rulesFor(':root').length > 0, 'Os tokens visuais precisam estar centralizados.');
});

test('o indicador visual do Supabase foi removido integralmente da interface', () => {
  assert.doesNotMatch(application, /updateCloudIndicator|Supabase conectado|Dados protegidos na nuvem|\.storage-note/u);
  assert.doesNotMatch(stylesheet, /\.storage-note|\.pulse\b|(?:cloud|cellf)-pulse/u);
});

test('barras de rolagem são ocultadas sem desativar a navegação dos conteúdos', () => {
  assertProperty('*', 'scrollbar-width', /^none$/iu);
  assertProperty('*', '-ms-overflow-style', /^none$/iu);
  assertProperty('*::-webkit-scrollbar', 'display', /^none$/iu);
  assertProperty('.main-nav', 'overflow-y', /auto|scroll/iu);
  assertProperty('.main-nav', 'scrollbar-width', /^none$/iu);
  assertProperty('.table-card', 'overflow-x', /auto|scroll/iu);
  assertProperty('.table-card', 'scrollbar-width', /^none$/iu);
  assertProperty('.sale-history', 'overflow-x', /auto|scroll/iu);
  assertProperty('.sale-history', 'scrollbar-width', /^none$/iu);
  assert.doesNotMatch(stylesheet, /scrollbar-width\s*:\s*thin\b/iu);
});

test('a cor oficial Cellf permanece no token principal da marca', () => {
  assertProperty(':root', '--accent', /^#e0f967$/iu);
  assertProperty(':root', '--accent-deep', /^#[0-9a-f]{6}$/iu);
});

test('a logo do login permanece centralizada e contida sem expandir o banner', () => {
  assertProperty('.cloud-brand', 'grid-template-rows', /minmax\(\s*0\s*,\s*1fr\s*\)/iu);
  assertProperty('.cloud-brand', 'overflow', /^hidden$/iu);
  assertProperty('.cloud-brand img', 'width', /^100%$/iu);
  assertProperty('.cloud-brand img', 'height', /^100%$/iu);
  assertProperty('.cloud-brand img', 'min-height', /^0$/iu);
  assertProperty('.cloud-brand img', 'object-fit', /^contain$/iu);
  assertProperty('.cloud-brand img', 'object-position', /^center$/iu);
});

test('a confirmação de privacidade mantém contraste e controle de consentimento visível', () => {
  assertProperty('.cloud-access-screen', 'min-width', /^0$/iu);
  assertProperty('.cloud-login-form', 'grid-template-columns', /minmax\(\s*0\s*,\s*1fr\s*\)/iu);
  assertProperty('.cloud-privacy', 'display', /^grid$/iu);
  assertProperty('.cloud-privacy', 'min-width', /^0$/iu);
  assertProperty('.cloud-privacy', 'border-radius', /\d+px/iu);
  assertProperty('.cloud-privacy-details summary', 'display', /^flex$/iu);
  assertProperty('.cloud-privacy-consent', 'display', /^flex$/iu);
  assertProperty('.cloud-privacy-consent input', 'accent-color', /var\(--ink\)/iu);
  assertProperty('.cloud-privacy-consent input[aria-invalid="true"]', 'outline', /solid/iu);
});

test('menus suspensos possuem seta própria e opções personalizadas quando suportado', () => {
  assertProperty('select:not([multiple])', 'appearance', /^none$/iu);
  assertProperty('select:not([multiple])', 'background-image', /data:image\/svg\+xml/iu);
  assertProperty('select:not([multiple])', 'padding-right', /\d+px/iu);

  const enhanced = blocks().find(rule => rule.selector === '@supports (appearance: base-select)')?.body;

  assert.ok(enhanced, 'A personalização avançada precisa oferecer melhoria progressiva.');
  assertProperty('select:not([multiple])', 'appearance', /^base-select$/iu, enhanced);
  assertProperty('select:not([multiple])', 'align-items', /^center$/iu, enhanced);
  assertProperty('select:not([multiple])', 'justify-content', /^space-between$/iu, enhanced);
  assertProperty('::picker(select)', 'appearance', /^base-select$/iu, enhanced);
  assertProperty('::picker(select)', 'border-radius', /\d+px/iu, enhanced);
  assertProperty('::picker(select)', 'box-shadow', /rgba\(/iu, enhanced);
  assertProperty('select:not([multiple])::picker-icon', 'display', /^grid$/iu, enhanced);
  assertProperty('select:not([multiple])::picker-icon', 'width', /^16px$/iu, enhanced);
  assertProperty('select:not([multiple])::picker-icon', 'height', /^16px$/iu, enhanced);
  assertProperty('select:not([multiple])::picker-icon', 'align-self', /^center$/iu, enhanced);
  assertProperty('select:not([multiple])::picker-icon', 'place-items', /^center$/iu, enhanced);
  assertProperty('select:not([multiple]) option', 'min-height', /\d+px/iu, enhanced);
  assertProperty('select:not([multiple]) option:checked', 'background', /^#/iu, enhanced);
  assertProperty('select:not([multiple]) option::checkmark', 'color', /^#/iu, enhanced);
});

test('a interface preserva contraste entre barra lateral escura e conteúdo claro', () => {
  assertProperty(':root', '--ink', /^#[0-9a-f]{6}$/iu);
  assertProperty(':root', '--paper', /^#(?:fff|ffffff)$/iu);

  const backgrounds = propertyValues('.sidebar', 'background');
  const foregrounds = propertyValues('.sidebar', 'color');

  assert.ok(backgrounds.some(value => /var\(--ink\)|linear-gradient/iu.test(value)));
  assert.ok(foregrounds.some(value => /#(?:fff|ffffff)\b/iu.test(value)));
});

test('a identidade verde é aplicada aos estados ativos da navegação', () => {
  assertProperty('.nav-item.active', 'background', /var\(--accent\)/iu);
  assertProperty('.nav-item.active', 'color', /var\(--ink\)/iu);
  assertProperty('.secondary-button', 'background', /var\(--accent\)/iu);
});

test('o foco de teclado permanece visível e não depende somente da cor', () => {
  assertProperty(':focus-visible', 'outline', /(?:\d+(?:\.\d+)?px)\s+solid/iu);
  assertProperty(':focus-visible', 'outline-offset', /\d+(?:\.\d+)?px/iu);
});

test('o link de salto é oculto visualmente e aparece ao receber foco', () => {
  assertProperty('.skip-link', 'position', /fixed|absolute/iu);
  assertProperty('.skip-link', 'transform', /translateY\(\s*-\d/iu);
  assertProperty('.skip-link:focus', 'transform', /translateY\(\s*0/iu);
});

test('os rótulos exclusivos para leitores de tela permanecem acessíveis', () => {
  assertProperty('.sr-only', 'position', /^absolute$/iu);
  assertProperty('.sr-only', 'width', /^1px$/iu);
  assertProperty('.sr-only', 'height', /^1px$/iu);
  assertProperty('.sr-only', 'overflow', /^hidden$/iu);
});

test('a preferência por movimento reduzido limita animações e transições', () => {
  const reducedMotion = mediaScopes(/prefers-reduced-motion\s*:\s*reduce/iu);

  assert.ok(reducedMotion, 'É necessário respeitar prefers-reduced-motion.');
  assertProperty('*', 'animation-duration', /(?:0(?:\.0+)?|\.0\d+)m?s|none/iu, reducedMotion);
  assertProperty('*', 'transition-duration', /(?:0(?:\.0+)?|\.0\d+)m?s|none/iu, reducedMotion);
  assertProperty('*', 'scroll-behavior', /auto/iu, reducedMotion);
});

test('existem pontos de adaptação para desktop, tablet, celular e celular compacto', () => {
  const breakpoints = blocks()
    .filter(rule => rule.selector.startsWith('@media'))
    .map(rule => Number(rule.selector.match(/max-width\s*:\s*(\d+)px/iu)?.[1]))
    .filter(Number.isFinite);

  assert.ok(breakpoints.some(width => width >= 1200), 'Falta adaptação para desktop.');
  assert.ok(breakpoints.some(width => width >= 900 && width < 1200), 'Falta adaptação para tablet.');
  assert.ok(breakpoints.some(width => width >= 600 && width < 900), 'Falta adaptação para celulares.');
  assert.ok(breakpoints.some(width => width <= 560), 'Falta adaptação para telas compactas.');
});

test('a navegação lateral suporta rolagem própria sem cortar os módulos', () => {
  assertProperty('.main-nav', 'overflow-y', /auto|scroll/iu);
  assertProperty('.main-nav', 'flex', /1/iu);
  assertProperty('.main-nav', 'overscroll-behavior', /contain/iu);
  assertProperty('.sidebar', 'height', /100(?:d)?vh/iu);
});

test('no celular, a barra lateral sai da tela e pode retornar quando aberta', () => {
  const mobile = widthScope(780);

  assert.ok(mobile, 'O layout móvel precisa de um breakpoint operacional.');
  assertProperty('.sidebar', 'transform', /translateX\(\s*-\d/iu, mobile);
  assertProperty('.sidebar.open', 'transform', /translateX\(\s*0/iu, mobile);
  assertProperty('.menu-button', 'display', /grid|flex|block/iu, mobile);
  assertProperty('.sidebar-close', 'display', /grid|flex|block/iu, mobile);
});

test('o menu móvel utiliza camada de fundo que respeita o atributo hidden', () => {
  const mobile = widthScope(780);

  assertProperty('.sidebar-backdrop', 'position', /^fixed$/iu, mobile);
  assertProperty('.sidebar-backdrop', 'inset', /^0$/iu, mobile);
  assertProperty('.sidebar-backdrop', 'background', /rgba?\(|#/iu, mobile);
  assertProperty('.sidebar-backdrop[hidden]', 'display', /none/iu, mobile);
});

test('a camada lateral sobrepõe corretamente seu fundo no celular', () => {
  const mobile = widthScope(780);
  const sidebarLayers = propertyValues('.sidebar', 'z-index', mobile).map(Number);
  const backdropLayers = propertyValues('.sidebar-backdrop', 'z-index', mobile).map(Number);

  assert.ok(sidebarLayers.length > 0);
  assert.ok(backdropLayers.length > 0);
  assert.ok(Math.max(...sidebarLayers) > Math.max(...backdropLayers));
});

test('o ponto de venda e a agenda possuem duas colunas em telas amplas', () => {
  assertProperty('.pos-layout', 'display', /^grid$/iu);
  assertProperty('.pos-layout', 'grid-template-columns', /minmax.*minmax/iu);
  assertProperty('.calendar-layout', 'display', /^grid$/iu);
  assertProperty('.calendar-layout', 'grid-template-columns', /minmax.*minmax/iu);
});

test('ponto de venda, agenda e relatórios empilham em telas de tablet', () => {
  const tablet = widthScope(1080);

  for (const selector of ['.pos-layout', '.pos-grid', '.calendar-layout', '.agenda-layout']) {
    assertProperty(selector, 'grid-template-columns', /^1fr$/iu, tablet);
  }

  assertProperty('.pos-cart', 'position', /^static$/iu, tablet);
  assertProperty('.reports-grid', 'grid-template-columns', /^1fr$/iu, tablet);
});

test('as configurações empilham e mantêm suas abas acessíveis no celular', () => {
  const mobile = widthScope(780);

  assertProperty('.settings-layout', 'grid-template-columns', /^1fr$/iu, mobile);
  assertProperty('.settings-nav', 'position', /^static$/iu, mobile);
  assertProperty('.settings-nav', 'overflow-x', /auto|scroll/iu, mobile);
});

test('as tabelas ganham versão em cartões e preservam rolagem quando necessária', () => {
  const mobile = widthScope(780);

  assertProperty('.data-table', 'display', /none/iu, mobile);
  assertProperty('.mobile-cards', 'display', /grid|flex|block/iu, mobile);
  assertProperty('.table-wrap', 'overflow-x', /auto|scroll/iu);
  assertProperty('.table-wrap .data-table', 'display', /^table$/iu, mobile);
});

test('ordens recentes reservam trilhas intrínsecas independentes para status e preço', () => {
  const columns = propertyValues('.order-row', 'grid-template-columns');
  const effective = columns.at(-1);

  assert.ok(effective, 'A lista de ordens precisa definir suas colunas.');
  assert.ok(
    (effective.match(/\bmax-content\b/giu) || []).length >= 2,
    'Status e preço precisam de duas colunas com largura intrínseca: ' + effective
  );
  assert.match(effective, /minmax\(\s*0\s*,/iu);
  assert.doesNotMatch(effective, /\b(?:8\d|9\d)px\s+(?:8\d|9\d)px\b/iu);
  assertProperty('.order-row > *', 'min-width', /^0$/iu);
});

test('a linha de ordem mantém distância horizontal e protege os limites de cada célula', () => {
  const columnGaps = propertyValues('.order-row', 'column-gap')
    .map(value => Number.parseFloat(value))
    .filter(Number.isFinite);

  assert.ok(columnGaps.some(value => value >= 10), 'Status e preço precisam de pelo menos 10 px de separação.');
  assertSomeProperty(
    ['.order-row > .order-status', '.order-row > .status'],
    'max-width',
    /^100%$/iu
  );
  assertSomeProperty(
    ['.order-row > .order-status', '.order-row > .status'],
    'justify-self',
    /^start$/iu
  );
  assertSomeProperty(
    ['.order-row > .order-value', '.order-row > .money', '.money'],
    'white-space',
    /^nowrap$/iu
  );
});

test('o HTML identifica separadamente o status e o preço de cada ordem recente', () => {
  const markup = functionMarkup('orderRow');
  const mobile = functionMarkup('orderMobile');

  assert.match(markup, /<span\b[^>]*class="[^"]*\border-status\b[^"]*\bstatus\b|<span\b[^>]*class="[^"]*\bstatus\b[^"]*\border-status\b/u);
  assert.match(markup, /<strong\b[^>]*class="[^"]*\border-value\b[^"]*\bmoney\b|<strong\b[^>]*class="[^"]*\bmoney\b[^"]*\border-value\b/u);
  assert.match(markup, /<span\b(?=[^>]*class="[^"]*\border-status\b)(?=[^>]*\btitle=)[^>]*>/u);
  assert.match(mobile, /<span\b(?=[^>]*class="[^"]*\border-status\b)(?=[^>]*\btitle=)[^>]*>/u);
  assert.match(mobile, /<strong\b[^>]*class="[^"]*\bmoney\b[^"]*\border-value\b/u);
  assert.match(application, /ready:\s*\[\s*['"]Pronto para retirada['"]/u);
});

test('o preço das ordens nunca é ocultado nos breakpoints de tablet e celular', () => {
  const moneySelectors = [
    '.order-row > :nth-child(5)',
    '.order-row > .money',
    '.order-row > .order-value',
    '.order-row .money',
    '.order-row .order-value'
  ];

  for (const width of [1080, 780, 520, 380]) {
    const responsive = widthScope(width);

    for (const selector of moneySelectors) {
      const display = propertyValues(selector, 'display', responsive);
      assert.ok(
        !display.some(value => /^none(?:\s*!important)?$/iu.test(value)),
        'A regra ' + selector + ' não pode esconder o preço abaixo de ' + width + ' px.'
      );
    }
  }
});

test('a lista de ordens adapta seu conteúdo à largura real do cartão', () => {
  assertProperty('.dashboard-grid > .card:first-child', 'container-type', /inline-size/iu);
  assertProperty('.dashboard-grid > .card:first-child', 'container-name', /dashboard-orders/iu);

  for (const width of [560, 430, 340]) {
    const scope = containerScopes(
      new RegExp('dashboard-orders[\\s\\S]*max-width\\s*:\\s*' + width + 'px', 'iu')
    );
    assert.ok(scope, 'Falta reorganizar ordens em cartões com até ' + width + ' px.');

    for (const selector of ['.order-row > .order-status', '.order-row > .order-value', '.order-row > .money']) {
      const hidden = propertyValues(selector, 'display', scope)
        .some(value => /^none(?:\s*!important)?$/iu.test(value));
      assert.equal(hidden, false, 'Status e preço devem continuar visíveis no cartão de ' + width + ' px.');
    }
  }

  const narrow = containerScopes(/dashboard-orders[\s\S]*max-width\s*:\s*560px/iu);
  assertProperty('.order-row > .order-device', 'display', /^none$/iu, narrow);

  const compact = containerScopes(/dashboard-orders[\s\S]*max-width\s*:\s*430px/iu);
  assertProperty('.order-row > :is(.order-status, .status)', 'grid-row', /^2$/iu, compact);
  assertProperty('.order-row > :is(.order-value, .money)', 'grid-row', /^2$/iu, compact);
  assertProperty('.order-row > :is(.order-status, .status)', 'grid-column', /^2$/iu, compact);
  assertProperty('.order-row > :is(.order-value, .money)', 'grid-column', /^3$/iu, compact);

  const tiny = containerScopes(/dashboard-orders[\s\S]*max-width\s*:\s*340px/iu);
  assertProperty('.order-row > :is(.order-status, .status)', 'grid-row', /^2$/iu, tiny);
  assertProperty('.order-row > :is(.order-value, .money)', 'grid-row', /^3$/iu, tiny);
});

test('cartões móveis podem quebrar a linha sem sobrepor status e valor', () => {
  const mobile = widthScope(780);
  const gaps = propertyValues('.mobile-card-bottom', 'gap', mobile)
    .map(value => Number.parseFloat(value))
    .filter(Number.isFinite);

  assertProperty('.mobile-card-bottom', 'flex-wrap', /^wrap$/iu, mobile);
  assert.ok(gaps.some(value => value >= 10), 'Cartões móveis precisam separar status e preço.');
  assertSomeProperty(
    ['.mobile-card-bottom > .money', '.mobile-card-bottom .money'],
    'flex',
    /^0\s+0\s+auto$/iu,
    mobile
  );
  assertProperty('.money', 'white-space', /^nowrap$/iu);
});

test('todos os cartões operacionais sinalizam os valores monetários para tratamento responsivo', () => {
  for (const view of ['productMobile', 'serviceMobile', 'customerMobile', 'orderMobile', 'payableMobile']) {
    const markup = functionMarkup(view);
    assert.match(
      markup,
      /class="mobile-card-bottom"[\s\S]*?<strong\b[^>]*class="[^"]*\bmoney\b/u,
      'O cartão ' + view + ' precisa identificar o valor com a classe money.'
    );
  }

  assert.match(
    functionMarkup('renderSales'),
    /class="mobile-card-bottom"[\s\S]*?<strong\b[^>]*class="[^"]*\bmoney\b/u,
    'O histórico de vendas também precisa identificar o valor monetário.'
  );
});

test('tabelas extensas mantêm largura mínima e rolagem horizontal em vez de comprimir valores', () => {
  assertProperty('.table-card', 'overflow-x', /auto|scroll/iu);
  assertProperty('.table-wrap', 'overflow-x', /auto|scroll/iu);

  for (const type of ['orders', 'payables', 'products', 'services', 'customers']) {
    const selector = '.data-table[data-table="' + type + '"]';
    const minimums = propertyValues(selector, 'min-width')
      .map(value => Number.parseFloat(value))
      .filter(Number.isFinite);

    assert.ok(
      minimums.some(value => value >= (['orders', 'payables'].includes(type) ? 850 : 700)),
      'A tabela ' + type + ' precisa reservar largura suficiente para status, preços e ações.'
    );
  }
});

test('seletores longos de status preservam largura suficiente sem invadir colunas monetárias', () => {
  const widths = propertyValues('.data-table .inline-status', 'min-width')
    .map(value => Number.parseFloat(value))
    .filter(Number.isFinite);

  assert.ok(widths.some(value => value >= 150), 'O status completo precisa caber no seletor da tabela.');
  assertProperty('.data-table .inline-status', 'max-width', /^100%$/iu);
  assertProperty('.data-table th', 'white-space', /^nowrap$/iu);
  assertProperty('.money', 'white-space', /^nowrap$/iu);
});

test('o histórico de vendas protege valores e colunas com rolagem horizontal própria', () => {
  const widths = propertyValues('.sale-history > .data-table', 'min-width')
    .map(value => Number.parseFloat(value))
    .filter(Number.isFinite);

  assertProperty('.sale-history', 'overflow-x', /auto|scroll/iu);
  assertProperty('.sale-history', 'max-width', /^100%$/iu);
  assert.ok(widths.some(value => value >= 900), 'O histórico de vendas precisa preservar suas colunas completas.');
});

test('a organização principal utiliza grades responsivas em desktop e tablet', () => {
  const tablet = widthScope(1080);

  assertProperty('.stats-grid', 'grid-template-columns', /repeat\(\s*4/iu);
  assertProperty('.stats-grid', 'grid-template-columns', /repeat\(\s*2/iu, tablet);
  assertProperty('.dashboard-grid', 'grid-template-columns', /^1fr$/iu, tablet);
});

test('as áreas interativas mantêm alvos adequados para toque', () => {
  const navigationHeights = propertyValues('.nav-item', 'min-height').map(value => Number.parseInt(value, 10));
  const actionHeights = propertyValues('.primary-button', 'min-height').map(value => Number.parseInt(value, 10));
  const iconWidths = propertyValues('.icon-button', 'width').map(value => Number.parseInt(value, 10));

  assert.ok(navigationHeights.some(height => height >= 40));
  assert.ok(actionHeights.some(height => height >= 40));
  assert.ok(iconWidths.some(width => width >= 40));
});

test('as janelas modais se adaptam como painel inferior em telas compactas', () => {
  const compact = widthScope(520);

  assertProperty('.modal-backdrop', 'align-items', /end|flex-end/iu, compact);
  assertProperty('.modal', 'width', /100%|100vw/iu, compact);
  assertProperty('.modal', 'max-height', /\d+(?:d)?vh/iu, compact);
  assertProperty('.modal', 'border-radius', /\d+px\s+\d+px\s+0\s+0/iu, compact);
});

test('formulários, configurações e produtos permanecem legíveis em telas compactas', () => {
  const compact = widthScope(520);

  assertProperty('.form-grid', 'grid-template-columns', /^1fr$/iu, compact);
  assertProperty('.settings-grid', 'grid-template-columns', /^1fr$/iu, compact);
  assertProperty('.pos-products', 'grid-template-columns', /repeat\(\s*2/iu, compact);
  assertProperty('.calendar-day', 'min-height', /\d+px/iu, compact);
});

test('os estados de serviço e pagamento mantêm cores semânticas consistentes', () => {
  const expectedColors = [
    ['.status.analysis', 'orange'],
    ['.status.progress', 'blue'],
    ['.status.ready', 'green'],
    ['.status.overdue', 'red'],
    ['.status.paid', 'green']
  ];

  for (const [selector, color] of expectedColors) {
    assertProperty(selector, 'color', new RegExp('var\\(--' + color + '\\)', 'iu'));
    assertProperty(selector, 'background', new RegExp('var\\(--' + color + '-soft\\)', 'iu'));
  }
});

test('os tokens semânticos oferecem cores fortes e versões suaves', () => {
  for (const color of ['green', 'orange', 'red', 'blue']) {
    assertProperty(':root', '--' + color, /^#[0-9a-f]{6}$/iu);
    assertProperty(':root', '--' + color + '-soft', /^#[0-9a-f]{6}$/iu);
  }
});

test('a impressão remove navegação e restaura tabelas completas', () => {
  const print = mediaScopes(/\bprint\b/iu);

  assert.ok(print, 'Relatórios precisam de uma folha de impressão.');
  assertProperty('.sidebar', 'display', /none/iu, print);
  assertProperty('.topbar', 'display', /none/iu, print);
  assertProperty('.data-table', 'display', /table/iu, print);
  assertProperty('.mobile-cards', 'display', /none/iu, print);
  assertProperty('.card', 'break-inside', /avoid/iu, print);
});
