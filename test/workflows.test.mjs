import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { createContext, Script } from 'node:vm';

const application = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
const bootstrap = application.indexOf("\ndocument.addEventListener('click'");

assert.ok(bootstrap > 0, 'O bootstrap do navegador precisa estar separado da lógica de negócio.');

const exposedApplication = application.slice(0, bootstrap) + '\n' + [
  'state = loadState(globalThis.__cellfInitialState);',
  'setCloudStatus(globalThis.__cellfCloudStatus);',
  'globalThis.__cellf = {',
  '  get state() { return state; },',
  '  get cart() { return cart; },',
  '  setCart(value) { cart = value; },',
  '  setReportPeriod(value) { reportPeriod = value; },',
  '  setSalesQuery(value) { salesQuery = value; },',
  '  loadState, saveState, flushStateSave, loadRemoteState, apiRequest,',
  '  setCloudStatus, renderCloudAccess, authenticate, bootstrapApplication, logout,',
  '  esc, normalize, initials, sum,',
  '  formatPostalCode, normalizeAddress, normalizeCustomerAddresses, primaryAddress, formatAddress, validateAddress,',
  '  localDate, offsetDate, formatDate, formatDateTime,',
  '  formatCnpj, isValidCnpj, formatFileSize, validateCompanyDocument,',
  '  companyDocumentStorageAvailable,',
  '  saveCompanyDocument, readCompanyDocument, deleteCompanyDocument,',
  '  renderCompanyDocuments, handleCompanyDocumentUpload,',
  '  downloadCompanyDocument, removeCompanyDocument,',
  '  customerOrders, customerSales, customerDeliveries, createDeliveryRecord, syncRepairDeliveries, completeOrderDeliveries, recordActivity,',
  '  cartSubtotal, cartTotal, addCartProduct, completeSale,',
  '  agendaEvents, withinPeriod, reportData, renderSales, renderDeliveries, renderReports,',
  '  commandSearch, refreshBadges, syncShell, toggleMenu, closeMenu, navigate',
  '};'
].join('\n');

class FakeClassList {
  constructor() {
    this.classes = new Set();
  }

  add(...names) {
    names.forEach(name => this.classes.add(name));
  }

  remove(...names) {
    names.forEach(name => this.classes.delete(name));
  }

  contains(name) {
    return this.classes.has(name);
  }

  toggle(name, force) {
    const active = force === undefined ? !this.contains(name) : Boolean(force);

    if (active) this.add(name);
    else this.remove(name);

    return active;
  }
}

class FakeElement {
  constructor(id = '') {
    this.id = id;
    this.dataset = {};
    this.style = {};
    this.classList = new FakeClassList();
    this.attributes = new Map();
    this.listeners = new Map();
    this.children = [];
    this.innerHTML = '';
    this.textContent = '';
    this.hidden = false;
    this.value = '';
    this.checked = false;
    this.isConnected = true;
    this.focused = false;
  }

  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) ?? [];

    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }

  getAttribute(name) {
    return this.attributes.get(name) ?? null;
  }

  removeAttribute(name) {
    this.attributes.delete(name);
  }

  append(child) {
    this.children.push(child);
  }

  remove() {
    this.isConnected = false;
  }

  focus() {
    this.focused = true;
  }

  click() {
    this.clicked = true;
  }

  setSelectionRange() {}

  querySelector() {
    return null;
  }

  querySelectorAll() {
    return [];
  }
}

class FakeDocument {
  constructor() {
    this.elements = new Map();
    this.createdElements = [];
    this.body = new FakeElement('body');
    this.activeElement = this.body;
    this.views = [
      'dashboard', 'orders', 'deliveries', 'customers', 'products', 'services',
      'sales', 'payables', 'reports', 'settings', 'agenda'
    ].map(view => {
      const element = new FakeElement('nav-' + view);

      element.dataset.view = view;

      return element;
    });

    for (const id of [
      'app-content', 'toast-region', 'nav-orders-count', 'nav-deliveries-count', 'notification-dot',
      'profile-name', 'profile-role', 'brand-caption', 'topbar-date',
      'pos-search', 'command-results', 'sidebar', 'sidebar-backdrop',
      'menu-button', 'sidebar-close', 'current-view-label', 'topbar-context',
      'imei-form', 'open-reminders', 'settings-form', 'company-document-name',
      'company-document-file', 'company-document-form', 'company-cnpj',
      'company-document-count', 'company-document-list', 'company-document-status',
      'company-document-upload-button', 'company-document-dropzone',
      'cloud-login-form', 'cloud-password', 'cloud-login-submit', 'cloud-login-status',
      'cloud-privacy-accept'
    ]) {
      this.elements.set('#' + id, new FakeElement(id));
    }

    this.elements.set('.user-card .avatar', new FakeElement('profile-avatar'));
    this.elements.get('#sidebar-backdrop').hidden = true;
  }

  querySelector(selector) {
    return this.elements.get(selector) ?? null;
  }

  querySelectorAll(selector) {
    if (selector === '.nav-item' || selector.startsWith('.nav-item,')) return this.views;

    return [];
  }

  createElement(tagName = '') {
    const element = new FakeElement();
    element.tagName = String(tagName).toUpperCase();
    this.createdElements.push(element);
    return element;
  }
}

function dateOffset(days = 0) {
  const date = new Date();

  date.setDate(date.getDate() + days);

  return date.getFullYear() + '-' +
    String(date.getMonth() + 1).padStart(2, '0') + '-' +
    String(date.getDate()).padStart(2, '0');
}

function fixture(overrides = {}) {
  const settings = {
    companyName: 'Cellf Testes',
    legalName: 'Cellf Testes — Assistência',
    managerName: 'Equipe de Testes',
    managerRole: 'Responsável',
    openingTime: '08:00',
    closingTime: '17:45',
    lowStockAlert: true,
    dueDateAlert: true,
    appointmentAlert: true,
    ...overrides.settings
  };

  return {
    products: [
      { id: 'produto-capa', sku: 'CAPA-01', name: 'Capa de proteção', category: 'Capas', cost: 20, price: 60, stock: 3, minimum: 1 },
      { id: 'produto-cabo', sku: 'CABO-01', name: 'Cabo reforçado', category: 'Cabos', cost: 12, price: 35, stock: 2, minimum: 1 }
    ],
    services: [
      { id: 'servico-tela', name: 'Troca de tela', category: 'Tela', pricing: 'fixed', price: 250, duration: 90, active: true }
    ],
    orders: [],
    payables: [],
    customers: [
      { id: 'cliente-teste', name: 'Cliente de Teste', phone: '(11) 99999-0000', email: '', document: '', notes: '', createdAt: dateOffset(), active: true }
    ],
    sales: [],
    appointments: [],
    stockMovements: [],
    activity: [],
    companyDocuments: [],
    ...overrides,
    settings
  };
}

function createApplication(options = {}) {
  const document = new FakeDocument();
  const timers = [];
  const writes = [];
  const requests = [];
  const files = new Map();
  const current = options.stored === undefined ? fixture() : options.stored;
  const initialState = current === null
    ? options.legacy
    : typeof current === 'string'
      ? undefined
      : current;
  const remoteState = {
    value: initialState ? structuredClone(initialState) : null
  };

  function response(status, payload = {}) {
    return {
      ok: status >= 200 && status < 300,
      status,
      headers: { get: () => 'application/json' },
      json: async () => structuredClone(payload),
      text: async () => JSON.stringify(payload)
    };
  }

  async function fetch(url, request = {}) {
    const target = String(url);
    const method = String(request.method || 'GET').toUpperCase();
    const body = typeof request.body === 'string' ? JSON.parse(request.body) : request.body;
    const record = { url: target, method, headers: request.headers || {}, body };

    requests.push(record);

    if (options.fetch) return options.fetch(target, request, record, { response, files, remoteState });
    if (options.failNetwork) throw new Error('Rede indisponível.');

    if (target === '/api/state' && method === 'GET') {
      if (options.unauthorized) return response(401, { code: 'UNAUTHORIZED', message: 'Sessão necessária.' });
      return response(200, { state: remoteState.value, updatedAt: null, source: 'supabase' });
    }

    if (target === '/api/state' && method === 'PUT') {
      if (options.failWrites) {
        return response(503, { code: 'SUPABASE_UNAVAILABLE', message: 'Não foi possível salvar na nuvem.' });
      }

      const state = structuredClone(body.state);
      writes.push({ state, method, url: target });
      remoteState.value = state;
      return response(200, { updatedAt: new Date().toISOString(), source: 'supabase' });
    }

    if (target === '/api/session' && method === 'POST') {
      return body.password === 'senha-de-teste'
        ? response(200, { authenticated: true })
        : response(401, { code: 'INVALID_CREDENTIALS', message: 'Senha incorreta.' });
    }

    if (target === '/api/session' && method === 'DELETE') {
      return response(200, { authenticated: false });
    }

    if (target.startsWith('/api/documents?operation=upload-url') && method === 'POST') {
      return response(200, {
        signedUrl: 'https://storage.example.test/upload/' + encodeURIComponent(body.id) + '?token=teste',
        path: 'company/' + body.id + '/' + body.fileName
      });
    }

    if (target.startsWith('https://storage.example.test/upload/') && method === 'PUT') {
      const id = decodeURIComponent(new URL(target).pathname.split('/').at(-1));
      files.set(id, request.body);
      return response(200);
    }

    if (target.startsWith('/api/documents?operation=download-url') && method === 'GET') {
      const id = new URL(target, 'https://cellf.example.test').searchParams.get('id');
      return response(200, {
        signedUrl: 'https://storage.example.test/download/' + encodeURIComponent(id) + '?token=teste'
      });
    }

    if (target.startsWith('/api/documents?') && method === 'DELETE') {
      const id = new URL(target, 'https://cellf.example.test').searchParams.get('id');
      files.delete(id);
      return response(200, { removed: true, id });
    }

    throw new Error('Requisição inesperada no ambiente de testes: ' + method + ' ' + target);
  }

  const window = {
    scrollCalls: [],
    confirmations: [],
    scrollTo(value) {
      this.scrollCalls.push(value);
    },
    confirm(message) {
      this.confirmations.push(message);
      return options.confirmResult !== false;
    }
  };
  const sandbox = createContext({
    document,
    fetch,
    window,
    structuredClone,
    Intl,
    Element: FakeElement,
    URL,
    __cellfInitialState: initialState,
    __cellfCloudStatus: options.cloudStatus || 'connected',
    setTimeout(callback, duration) {
      timers.push({ callback, duration });

      return timers.length;
    },
    clearTimeout() {}
  });

  new Script(exposedApplication, { filename: 'public/app.js' }).runInContext(sandbox, {
    timeout: 3_000
  });

  return {
    api: sandbox.__cellf,
    document,
    remoteState,
    requests,
    files,
    writes,
    timers,
    window,
    messages: () => document.querySelector('#toast-region').children
  };
}

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

test('um projeto novo cria dados iniciais e associa clientes às ordens existentes', () => {
  const { api } = createApplication({ stored: null });

  assert.ok(api.state.orders.length > 0);
  assert.equal(api.state.customers.length, api.state.orders.length);

  for (const order of api.state.orders) {
    assert.ok(order.customerId, 'Toda ordem inicial precisa estar vinculada a um cliente.');
    assert.ok(api.state.customers.some(customer => customer.id === order.customerId));
  }
});

test('dados recebidos da nuvem são normalizados sem duplicar telefones equivalentes', () => {
  const legacy = {
    products: [],
    services: [],
    payables: [],
    orders: [
      { id: 'OS-100', customer: 'Pessoa de Teste', phone: '(11) 98888-0000', createdAt: dateOffset() },
      { id: 'OS-101', customer: 'Pessoa de Teste', phone: '11988880000', createdAt: dateOffset() },
      { id: 'OS-102', customer: 'Outro Teste', phone: '(11) 97777-0000', createdAt: dateOffset() }
    ],
    settings: { managerName: 'Responsável legado' }
  };
  const { api } = createApplication({ stored: null, legacy });

  assert.equal(api.state.customers.length, 2);
  assert.equal(api.state.orders[0].customerId, api.state.orders[1].customerId);
  assert.notEqual(api.state.orders[0].customerId, api.state.orders[2].customerId);
  assert.equal(api.state.settings.managerName, 'Responsável legado');
  assert.equal(api.state.settings.companyName, 'Cellf');

  for (const collection of ['sales', 'deliveries', 'appointments', 'stockMovements', 'activity']) {
    assert.ok(Array.isArray(api.state[collection]));
  }
});

test('cadastros antigos recebem modalidades padrão e endereços estruturados sem perder dados', () => {
  const legacy = fixture({
    customers: [{ id: 'cliente-legado', name: 'Pessoa Legada', phone: '11977770000', address: 'Rua das Flores', city: 'São Paulo', postalCode: '01310100' }],
    orders: [{ id: 'OS-LEGADA', customerId: 'cliente-legado', customer: 'Pessoa Legada', phone: '11977770000', createdAt: dateOffset() }],
    sales: [{ id: 'v-legada', customerId: 'cliente-legado', customer: 'Pessoa Legada', items: [], total: 0 }]
  });
  delete legacy.deliveries;

  const { api } = createApplication({ stored: legacy });
  const address = api.state.customers[0].addresses[0];

  assert.equal(api.state.orders[0].attendanceType, 'in_store_service');
  assert.equal(api.state.sales[0].attendanceType, 'counter_sale');
  assert.equal(address.street, 'Rua das Flores');
  assert.equal(address.postalCode, '01310-100');
  assert.equal(address.primary, true);
  assert.deepEqual(plain(api.state.deliveries), []);
});

test('endereços brasileiros são formatados, validados e identificam um endereço principal', () => {
  const { api } = createApplication();
  const address = api.normalizeAddress({ id: 'end-casa', label: 'Casa', postalCode: '01310100', street: 'Avenida Paulista', number: '1578', complement: 'Sala 4', neighborhood: 'Bela Vista', city: 'São Paulo', region: 'sp', reference: 'Ao lado do metrô', primary: true });

  assert.equal(api.formatPostalCode('01310-100'), '01310-100');
  assert.equal(address.region, 'SP');
  assert.equal(api.validateAddress(address), '');
  assert.match(api.formatAddress(address), /Avenida Paulista, 1578/u);
  assert.match(api.formatAddress(address), /Bela Vista · São Paulo \/ SP/u);
  assert.match(api.formatAddress(address), /CEP 01310-100/u);
  assert.equal(api.primaryAddress({ addresses: [address] }).id, 'end-casa');
  assert.match(api.validateAddress({ ...address, postalCode: '01310' }), /CEP válido/u);
  assert.match(api.validateAddress({ ...address, region: 'S' }), /UF/u);
});

test('clientes existentes são associados por telefone ou nome sem perder seus códigos', () => {
  const existing = fixture({
    customers: [
      { id: 'cliente-existente', name: 'NOME EXISTENTE', phone: '(11) 96666-0000', active: true }
    ],
    orders: [
      { id: 'OS-200', customer: 'Outro nome', phone: '11966660000', createdAt: dateOffset() },
      { id: 'OS-201', customer: 'nome existente', phone: '', createdAt: dateOffset() }
    ]
  });
  const { api } = createApplication({ stored: existing });

  assert.equal(api.state.customers.length, 1);
  assert.equal(api.state.orders[0].customerId, 'cliente-existente');
  assert.equal(api.state.orders[1].customerId, 'cliente-existente');
});

test('o estado remoto atual tem prioridade sobre uma estrutura anterior', () => {
  const current = fixture({ settings: { managerName: 'Responsável atual' } });
  const legacy = fixture({ settings: { managerName: 'Responsável antigo' } });
  const { api } = createApplication({ stored: current, legacy });

  assert.equal(api.state.settings.managerName, 'Responsável atual');
});

test('um estado remoto inválido não impede a recuperação segura dos dados iniciais', () => {
  const { api } = createApplication({ stored: '{json inválido' });

  assert.ok(api.state.products.length > 0);
  assert.ok(api.state.orders.length > 0);
  assert.equal(api.state.customers.length, api.state.orders.length);
  assert.equal(api.state.settings.companyName, 'Cellf');
});

test('a sanitização impede injeção de HTML e preserva caracteres comuns', () => {
  const { api } = createApplication();

  assert.equal(
    api.esc('<script data-x="1">Ana & José\'</script>'),
    '&lt;script data-x=&quot;1&quot;&gt;Ana &amp; José&#39;&lt;/script&gt;'
  );
  assert.equal(api.esc(), '');
  assert.equal(api.esc(42), '42');
});

test('a normalização torna buscas insensíveis a acentos e maiúsculas', () => {
  const { api } = createApplication();

  assert.equal(api.normalize('PELÍCULA São João'), 'pelicula sao joao');
  assert.equal(api.normalize('ÇÃÕ ÉÍÚ'), 'cao eiu');
  assert.equal(api.initials('cliente de teste'), 'CD');
  assert.equal(api.initials(''), 'C');
});

test('adicionar produtos reserva quantidades e registra preço e custo corretamente', () => {
  const { api, document } = createApplication();

  api.addCartProduct('produto-capa');
  api.addCartProduct('produto-capa');
  api.addCartProduct('produto-cabo');

  assert.equal(api.cart.items.length, 2);
  assert.equal(api.cart.items[0].quantity, 2);
  assert.equal(api.cart.items[0].unitPrice, 60);
  assert.equal(api.cart.items[0].cost, 20);
  assert.equal(api.cart.items[1].quantity, 1);
  assert.equal(api.cartSubtotal(), 155);
  assert.match(document.querySelector('#app-content').innerHTML, /Venda atual/u);
});

test('diminuir a quantidade remove o produto quando ela chega a zero', () => {
  const { api } = createApplication();

  api.addCartProduct('produto-capa');
  api.addCartProduct('produto-capa');
  api.addCartProduct('produto-capa', -1);

  assert.equal(api.cart.items[0].quantity, 1);

  api.addCartProduct('produto-capa', -1);

  assert.equal(api.cart.items.length, 0);
  assert.equal(api.cartSubtotal(), 0);
});

test('o carrinho impede quantidades acima do estoque disponível', () => {
  const { api, messages } = createApplication();

  api.addCartProduct('produto-cabo');
  api.addCartProduct('produto-cabo');
  api.addCartProduct('produto-cabo');

  assert.equal(api.cart.items[0].quantity, 2);
  assert.equal(messages().at(-1).getAttribute('role'), 'alert');
  assert.match(messages().at(-1).textContent, /2 unidades disponíveis/iu);
});

test('produtos inexistentes não são inseridos no carrinho', () => {
  const { api, messages } = createApplication();

  api.addCartProduct('produto-inexistente');

  assert.equal(api.cart.items.length, 0);
  assert.match(messages().at(-1).textContent, /não encontrado/iu);
});

test('uma venda completa calcula desconto, baixa o estoque e persiste os dados na nuvem', async () => {
  const { api, remoteState, writes, messages, document } = createApplication();

  api.addCartProduct('produto-capa');
  api.addCartProduct('produto-capa');
  api.addCartProduct('produto-cabo');
  api.cart.customerId = 'cliente-teste';
  api.cart.payment = 'credit';
  api.cart.discount = 15;
  api.completeSale();
  await api.flushStateSave();

  const sale = api.state.sales[0];
  const movements = api.state.stockMovements;
  const saved = remoteState.value;

  assert.equal(sale.customerId, 'cliente-teste');
  assert.equal(sale.customer, 'Cliente de Teste');
  assert.equal(sale.subtotal, 155);
  assert.equal(sale.discount, 15);
  assert.equal(sale.total, 140);
  assert.equal(sale.payment, 'credit');
  assert.equal(sale.status, 'paid');
  assert.ok(!Number.isNaN(Date.parse(sale.createdAt)));
  assert.equal(sale.items.length, 2);
  assert.equal(api.state.products.find(product => product.id === 'produto-capa').stock, 1);
  assert.equal(api.state.products.find(product => product.id === 'produto-cabo').stock, 1);
  assert.equal(movements.length, 2);
  assert.ok(movements.every(movement => movement.type === 'out'));
  assert.ok(movements.every(movement => movement.reason.includes(sale.id.toUpperCase())));
  assert.equal(api.state.activity[0].kind, 'sale');
  assert.equal(api.cart.items.length, 0);
  assert.equal(api.cart.payment, 'pix');
  assert.equal(api.cart.discount, 0);
  assert.equal(writes.length, 1);
  assert.equal(saved.sales[0].total, 140);
  assert.equal(saved.stockMovements.length, 2);
  assert.match(document.querySelector('#app-content').innerHTML, /Últimas vendas/u);
  assert.match(messages().at(-1).textContent, /Venda concluída/u);
});

test('o desconto nunca ultrapassa o subtotal nem produz valor negativo', () => {
  const { api } = createApplication();

  api.addCartProduct('produto-capa');
  api.cart.discount = 5_000;

  assert.equal(api.cartSubtotal(), 60);
  assert.equal(api.cartTotal(), 0);

  api.completeSale();

  assert.equal(api.state.sales[0].subtotal, 60);
  assert.equal(api.state.sales[0].discount, 60);
  assert.equal(api.state.sales[0].total, 0);
});

test('vendas sem cliente vinculado são registradas como atendimento de balcão', () => {
  const { api } = createApplication();

  api.addCartProduct('produto-capa');
  api.cart.payment = 'cash';
  api.completeSale();

  assert.equal(api.state.sales[0].customerId, '');
  assert.equal(api.state.sales[0].customer, 'Cliente de balcão');
  assert.equal(api.state.sales[0].payment, 'cash');
  assert.equal(api.state.sales[0].attendanceType, 'counter_sale');
  assert.equal(api.state.deliveries.length, 0);
});

test('venda para entrega exige endereço, cria a rota e salva cliente, compra e logística na nuvem', async () => {
  const address = { id: 'end-entrega', label: 'Casa', postalCode: '01310-100', street: 'Avenida Paulista', number: '1578', complement: 'Sala 4', neighborhood: 'Bela Vista', city: 'São Paulo', region: 'SP', reference: 'Portaria principal', primary: true };
  const stored = fixture({ customers: [{ ...fixture().customers[0], addresses: [address] }] });
  const { api, remoteState, document } = createApplication({ stored });

  api.addCartProduct('produto-capa');
  api.cart.attendanceType = 'delivery';
  api.cart.customerId = 'cliente-teste';
  api.cart.addressId = 'end-entrega';
  api.renderSales();

  assert.match(document.querySelector('#app-content').innerHTML, /ENDEREÇO DE ENTREGA/u);
  assert.match(document.querySelector('#app-content').innerHTML, /Avenida Paulista/u);

  api.completeSale();
  await api.flushStateSave();

  const sale = api.state.sales[0];
  const delivery = api.state.deliveries[0];

  assert.equal(sale.attendanceType, 'delivery');
  assert.equal(sale.deliveryAddress.id, 'end-entrega');
  assert.equal(delivery.kind, 'sale_delivery');
  assert.equal(delivery.sourceType, 'sale');
  assert.equal(delivery.sourceId, sale.id);
  assert.equal(delivery.customerId, 'cliente-teste');
  assert.equal(delivery.address.reference, 'Portaria principal');
  assert.equal(delivery.status, 'scheduled');
  assert.equal(remoteState.value.sales[0].attendanceType, 'delivery');
  assert.equal(remoteState.value.deliveries[0].address.postalCode, '01310-100');
  assert.equal(document.querySelector('#nav-deliveries-count').textContent, 1);
  assert.equal(api.cart.attendanceType, 'counter_sale');
});

test('entrega sem cliente ou sem endereço não baixa estoque nem cria vendas', () => {
  const { api, messages } = createApplication();

  api.addCartProduct('produto-capa');
  api.cart.attendanceType = 'delivery';
  api.completeSale();

  assert.equal(api.state.sales.length, 0);
  assert.equal(api.state.products[0].stock, 3);
  assert.match(messages().at(-1).textContent, /Selecione o cliente/u);

  api.cart.customerId = 'cliente-teste';
  api.completeSale();

  assert.equal(api.state.sales.length, 0);
  assert.equal(api.state.deliveries.length, 0);
  assert.match(messages().at(-1).textContent, /Cadastre um endereço/u);
});

test('busca e leva cria coleta e devolução sem duplicar movimentações ao editar a ordem', () => {
  const { api } = createApplication();
  const customer = api.state.customers[0];
  const address = api.normalizeAddress({ id: 'end-busca', label: 'Trabalho', postalCode: '04538132', street: 'Rua Funchal', number: '418', neighborhood: 'Vila Olímpia', city: 'São Paulo', region: 'SP', primary: true });
  const order = { id: 'OS-2001', attendanceType: 'pickup_return', status: 'analysis', createdAt: dateOffset(), dueAt: dateOffset(2) };

  api.syncRepairDeliveries(order, customer, address);

  assert.equal(api.state.deliveries.length, 2);
  assert.deepEqual(plain(api.state.deliveries.map(item => item.kind).sort()), ['repair_pickup', 'repair_return']);
  assert.ok(api.state.deliveries.every(item => item.sourceId === 'OS-2001' && item.customerId === customer.id));

  order.dueAt = dateOffset(4);
  api.syncRepairDeliveries(order, customer, address);

  assert.equal(api.state.deliveries.length, 2);
  assert.equal(api.state.deliveries.find(item => item.kind === 'repair_return').scheduledDate, dateOffset(4));

  api.completeOrderDeliveries(order);

  assert.ok(api.state.deliveries.every(item => item.status === 'completed' && item.completedAt));
});

test('alterar um busca e leva para serviço em loja cancela as movimentações pendentes', () => {
  const { api } = createApplication();
  const customer = api.state.customers[0];
  const address = api.normalizeAddress({ postalCode: '01310100', street: 'Rua A', number: '10', neighborhood: 'Centro', city: 'São Paulo', region: 'SP' });
  const order = { id: 'OS-2002', attendanceType: 'pickup_return', status: 'analysis', createdAt: dateOffset(), dueAt: dateOffset(2) };

  api.syncRepairDeliveries(order, customer, address);
  order.attendanceType = 'in_store_service';
  api.syncRepairDeliveries(order, customer, null);

  assert.equal(api.state.deliveries.length, 2);
  assert.ok(api.state.deliveries.every(item => item.status === 'cancelled'));
});

test('entregas registradas aparecem na agenda e na tela operacional com o endereço', () => {
  const address = { id: 'end-agenda', label: 'Casa', postalCode: '01310-100', street: 'Avenida Paulista', number: '1578', neighborhood: 'Bela Vista', city: 'São Paulo', region: 'SP', primary: true };
  const delivery = { id: 'ent-agenda', sourceType: 'sale', sourceId: 'v-agenda', kind: 'sale_delivery', customerId: 'cliente-teste', customer: 'Cliente de Teste', phone: '11999990000', address, scheduledDate: dateOffset(), status: 'scheduled' };
  const { api, document } = createApplication({ stored: fixture({ deliveries: [delivery] }) });

  assert.ok(api.agendaEvents(dateOffset()).some(event => event.deliveryId === 'ent-agenda' && event.subtitle.includes('Avenida Paulista')));

  api.renderDeliveries();

  const html = document.querySelector('#app-content').innerHTML;
  assert.match(html, /Entregas e busca e leva/u);
  assert.match(html, /Entrega de compra/u);
  assert.match(html, /Avenida Paulista/u);
  assert.match(html, /data-action="delivery-status"/u);
});

test('uma venda vazia não altera estoque, histórico nem armazenamento', () => {
  const { api, writes, messages } = createApplication();
  const stock = api.state.products[0].stock;

  api.completeSale();

  assert.equal(api.state.sales.length, 0);
  assert.equal(api.state.products[0].stock, stock);
  assert.equal(writes.length, 0);
  assert.match(messages().at(-1).textContent, /pelo menos um produto/iu);
});

test('a finalização verifica novamente o estoque e impede vendas inconsistentes', () => {
  const { api, writes, messages } = createApplication();

  api.addCartProduct('produto-capa');
  api.state.products.find(product => product.id === 'produto-capa').stock = 0;
  api.completeSale();

  assert.equal(api.state.sales.length, 0);
  assert.equal(api.state.stockMovements.length, 0);
  assert.equal(writes.length, 0);
  assert.match(messages().at(-1).textContent, /Estoque insuficiente/iu);
});

test('o histórico de movimentações permanece limitado após novas vendas', () => {
  const oldMovements = Array.from({ length: 200 }, (_, index) => ({
    id: 'antigo-' + index,
    productId: 'outro',
    type: 'out',
    quantity: 1
  }));
  const { api } = createApplication({
    stored: fixture({ stockMovements: oldMovements })
  });

  api.addCartProduct('produto-capa');
  api.completeSale();

  assert.equal(api.state.stockMovements.length, 200);
  assert.equal(api.state.stockMovements[0].productId, 'produto-capa');
  assert.equal(api.state.stockMovements.at(-1).id, 'antigo-198');
});

test('o registro de atividades guarda somente os oitenta eventos mais recentes', () => {
  const { api } = createApplication();

  for (let index = 0; index < 85; index += 1) {
    api.recordActivity('test', 'Evento ' + index);
  }

  assert.equal(api.state.activity.length, 80);
  assert.equal(api.state.activity[0].description, 'Evento 84');
  assert.equal(api.state.activity.at(-1).description, 'Evento 5');
});

test('falhas na persistência remota são comunicadas sem derrubar a aplicação', async () => {
  const { api, document } = createApplication({ failWrites: true });

  assert.equal(api.saveState(), true);
  await assert.rejects(api.flushStateSave(), {
    code: 'SUPABASE_UNAVAILABLE',
    status: 503
  });
  assert.equal(api.companyDocumentStorageAvailable(), false);
  assert.match(document.querySelector('#app-content').innerHTML, /(?:Supabase|Configuração necessária)/iu);
});

test('a agenda combina compromissos, entregas, lembretes e contas a pagar', () => {
  const today = dateOffset();
  const state = fixture({
    appointments: [
      { id: 'agenda-1', title: 'Avaliação de aparelho', customer: 'Cliente de Teste', date: today, time: '08:30', type: 'repair', status: 'scheduled', duration: 45 },
      { id: 'agenda-outro-dia', title: 'Outro dia', date: dateOffset(1), time: '08:00', type: 'meeting' }
    ],
    orders: [
      { id: 'OS-300', customer: 'Cliente de Teste', customerId: 'cliente-teste', phone: '(11) 99999-0000', device: 'Aparelho de teste', status: 'progress', createdAt: today, dueAt: today, reminder: 'Confirmar retirada', reminderAt: today + 'T09:15' },
      { id: 'OS-301', customer: 'Cliente de Teste', customerId: 'cliente-teste', device: 'Já entregue', status: 'delivered', createdAt: today, dueAt: today },
      { id: 'OS-302', customer: 'Cliente de Teste', customerId: 'cliente-teste', device: 'Cancelado', status: 'cancelled', createdAt: today, dueAt: today }
    ],
    payables: [
      { id: 'conta-aberta', description: 'Fornecedor de peças', supplier: 'Fornecedor Teste', amount: 80, dueAt: today, paid: false },
      { id: 'conta-paga', description: 'Conta paga', supplier: 'Fornecedor Teste', amount: 90, dueAt: today, paid: true }
    ]
  });
  const { api } = createApplication({ stored: state });
  const events = plain(api.agendaEvents(today));

  assert.equal(events.length, 4);
  assert.deepEqual(events.map(event => event.time), ['08:30', '09:15', '12:00', '17:45']);
  assert.deepEqual(events.map(event => event.type), ['repair', 'reminder', 'payment', 'delivery']);
  assert.equal(events[0].duration, 45);
  assert.equal(events[0].editable, true);
  assert.equal(events[1].orderId, 'OS-300');
  assert.equal(events[2].payableId, 'conta-aberta');
  assert.equal(events[3].orderId, 'OS-300');
});

test('compromissos utilizam horário e duração padrão quando não informados', () => {
  const today = dateOffset();
  const { api } = createApplication({
    stored: fixture({
      appointments: [{ id: 'agenda-sem-horario', title: 'Atendimento', date: today, type: 'consultation' }]
    })
  });
  const [appointment] = api.agendaEvents(today);

  assert.equal(appointment.time, '09:00');
  assert.equal(appointment.duration, 30);
  assert.equal(appointment.subtitle, 'Atendimento');
  assert.equal(appointment.status, 'scheduled');
});

test('o relatório calcula faturamento, custos, despesas e resultado líquido', () => {
  const today = dateOffset();
  const old = dateOffset(-60);
  const state = fixture({
    sales: [
      { id: 'venda-atual', customer: 'Cliente de Teste', customerId: 'cliente-teste', payment: 'pix', status: 'paid', total: 150, createdAt: today + 'T10:00:00', items: [{ productId: 'produto-capa', name: 'Capa', quantity: 2, unitPrice: 75, cost: 20 }] },
      { id: 'venda-cancelada', payment: 'pix', status: 'cancelled', total: 999, createdAt: today + 'T11:00:00', items: [] },
      { id: 'venda-antiga', payment: 'cash', status: 'paid', total: 70, createdAt: old + 'T11:00:00', items: [{ productId: 'produto-cabo', name: 'Cabo', quantity: 1, unitPrice: 70, cost: 12 }] }
    ],
    orders: [
      { id: 'OS-400', customer: 'Cliente de Teste', customerId: 'cliente-teste', device: 'Aparelho', serviceId: 'servico-tela', status: 'delivered', value: 250, createdAt: today, deliveredAt: today + 'T15:00:00', dueAt: today },
      { id: 'OS-401', customer: 'Cliente de Teste', customerId: 'cliente-teste', device: 'Outro aparelho', serviceId: 'servico-tela', status: 'progress', value: 75, createdAt: today, dueAt: dateOffset(1) },
      { id: 'OS-402', customer: 'Cliente de Teste', customerId: 'cliente-teste', device: 'Aparelho cancelado', serviceId: 'servico-tela', status: 'cancelled', value: 700, createdAt: today, dueAt: today }
    ],
    payables: [
      { id: 'despesa-paga', description: 'Despesa atual', supplier: 'Fornecedor', category: 'Peças', amount: 30, dueAt: today, paidAt: today, paid: true },
      { id: 'despesa-aberta', description: 'Despesa aberta', supplier: 'Fornecedor', category: 'Peças', amount: 500, dueAt: today, paid: false },
      { id: 'despesa-antiga', description: 'Despesa antiga', supplier: 'Fornecedor', category: 'Peças', amount: 100, dueAt: old, paidAt: old, paid: true }
    ]
  });
  const { api, document } = createApplication({ stored: state });
  const data = api.reportData();

  assert.equal(data.sales.length, 1);
  assert.equal(data.delivered.length, 1);
  assert.equal(data.paidPayables.length, 1);
  assert.equal(data.salesRevenue, 150);
  assert.equal(data.serviceRevenue, 250);
  assert.equal(data.costOfSales, 40);
  assert.equal(data.expenses, 30);
  assert.equal(data.revenue, 400);
  assert.equal(data.grossProfit, 330);

  api.renderReports();

  assert.match(document.querySelector('#app-content').innerHTML, /A RECEBER/u);
  assert.match(document.querySelector('#app-content').innerHTML, /75,00/u);
  assert.doesNotMatch(document.querySelector('#app-content').innerHTML, /EM BREVE/iu);
});

test('a seleção do período diferencia dados recentes de todo o histórico', () => {
  const today = dateOffset();
  const old = dateOffset(-60);
  const { api } = createApplication({
    stored: fixture({
      sales: [
        { id: 'recente', total: 40, status: 'paid', payment: 'pix', createdAt: today + 'T09:00:00', items: [] },
        { id: 'antiga', total: 90, status: 'paid', payment: 'cash', createdAt: old + 'T09:00:00', items: [] }
      ]
    })
  });

  api.setReportPeriod(7);

  assert.equal(api.reportData().salesRevenue, 40);
  assert.equal(api.withinPeriod(today), true);
  assert.equal(api.withinPeriod(old), false);

  api.setReportPeriod(0);

  assert.equal(api.reportData().salesRevenue, 130);
  assert.equal(api.withinPeriod(old), true);
});

test('a busca global encontra termos sem acento e sanitiza resultados', () => {
  const { api, document } = createApplication({
    stored: fixture({
      products: [
        { id: 'produto-pelicula', sku: 'PEL-01', name: 'Película <Especial>', category: 'Proteção', price: 25, cost: 8, stock: 3, minimum: 1 }
      ]
    })
  });

  api.commandSearch('pelicula');

  const results = document.querySelector('#command-results').innerHTML;

  assert.match(results, /Película &lt;Especial&gt;/u);
  assert.doesNotMatch(results, /<Especial>/u);
  assert.match(results, /data-command-view="products"/u);
});

test('o menu móvel sincroniza estado aberto, camada de fundo e acessibilidade', () => {
  const { api, document } = createApplication();
  const sidebar = document.querySelector('#sidebar');
  const backdrop = document.querySelector('#sidebar-backdrop');
  const trigger = document.querySelector('#menu-button');
  const closeButton = document.querySelector('#sidebar-close');

  api.toggleMenu();

  assert.equal(sidebar.classList.contains('open'), true);
  assert.equal(backdrop.hidden, false);
  assert.equal(trigger.getAttribute('aria-expanded'), 'true');
  assert.equal(document.body.classList.contains('menu-open'), true);
  assert.equal(closeButton.focused, true);

  api.closeMenu();

  assert.equal(sidebar.classList.contains('open'), false);
  assert.equal(backdrop.hidden, true);
  assert.equal(trigger.getAttribute('aria-expanded'), 'false');
  assert.equal(document.body.classList.contains('menu-open'), false);
});

test('os onze módulos renderizam e atualizam a navegação sem depender de navegador real', () => {
  const { api, document, window } = createApplication();
  const views = [
    'dashboard', 'orders', 'deliveries', 'customers', 'products', 'services',
    'sales', 'payables', 'reports', 'settings', 'agenda'
  ];

  for (const view of views) {
    api.navigate(view);

    const active = document.views.filter(item => item.classList.contains('active'));

    assert.equal(active.length, 1, 'Somente um módulo deve ficar ativo: ' + view);
    assert.equal(active[0].dataset.view, view);
    assert.equal(active[0].getAttribute('aria-current'), 'page');
    assert.ok(document.querySelector('#app-content').innerHTML.length > 0);
    assert.ok(document.querySelector('#current-view-label').textContent.length > 0);
  }

  assert.equal(window.scrollCalls.length, views.length);
});

test('o perfil e os avisos são sincronizados após persistir alterações', () => {
  const today = dateOffset();
  const { api, document } = createApplication({
    stored: fixture({
      appointments: [{ id: 'agenda-alerta', title: 'Aviso', date: today, status: 'scheduled' }],
      settings: {
        managerName: 'Pessoa Responsável',
        managerRole: 'Gestora',
        legalName: 'Cellf Laboratório',
        slogan: 'Assistência com confiança'
      }
    })
  });

  assert.equal(api.saveState(), true);
  assert.equal(document.querySelector('#profile-name').textContent, 'Pessoa Responsável');
  assert.equal(document.querySelector('#profile-role').textContent, 'Gestora');
  assert.equal(document.querySelector('#brand-caption').textContent, 'Assistência com confiança');
  assert.equal(document.querySelector('.user-card .avatar').textContent, 'PR');
  assert.equal(document.querySelector('#notification-dot').style.display, 'block');
});

test('dados empresariais antigos recebem slogan e lista de documentos sem perder informações', () => {
  const { api } = createApplication({
    stored: fixture({
      companyDocuments: undefined,
      settings: { companyName: 'Assistência Original', document: '04.252.011/0001-10' }
    })
  });

  assert.equal(api.state.settings.companyName, 'Assistência Original');
  assert.equal(api.state.settings.document, '04.252.011/0001-10');
  assert.equal(api.state.settings.slogan, 'Reparo e Comércio');
  assert.deepEqual(plain(api.state.companyDocuments), []);
});

test('documentos empresariais existentes e slogan personalizado permanecem após a migração', () => {
  const documentRecord = {
    id: 'documento-contrato',
    name: 'Contrato social',
    filename: 'contrato-social.pdf',
    size: 2048,
    uploadedAt: '2026-08-24T15:00:00.000Z'
  };
  const { api } = createApplication({
    stored: fixture({ companyDocuments: [documentRecord], settings: { slogan: 'Tecnologia com confiança' } })
  });

  assert.equal(api.state.settings.slogan, 'Tecnologia com confiança');
  assert.deepEqual(plain(api.state.companyDocuments), [documentRecord]);
});

test('o CNPJ recebe máscara brasileira e valida corretamente seus dígitos verificadores', () => {
  const { api } = createApplication();

  assert.equal(api.formatCnpj('04252011000110'), '04.252.011/0001-10');
  assert.equal(api.formatCnpj('04.252.011/0001-10'), '04.252.011/0001-10');
  assert.equal(api.formatCnpj('0425201100011099'), '04.252.011/0001-10');
  assert.equal(api.isValidCnpj('04.252.011/0001-10'), true);
  assert.equal(api.isValidCnpj('04.252.011/0001-11'), false);
  assert.equal(api.isValidCnpj('00.000.000/0000-00'), false);
  assert.equal(api.isValidCnpj('123'), false);
});

test('os tamanhos dos documentos são apresentados de maneira legível', () => {
  const { api } = createApplication();

  assert.equal(api.formatFileSize(700), '700 B');
  assert.match(api.formatFileSize(1536), /^1[,.]5 KB$/);
  assert.match(api.formatFileSize(2 * 1024 * 1024), /^2 MB$/);
});

test('documentos PDF, imagens, planilhas e textos válidos são aceitos', () => {
  const { api } = createApplication();
  const files = [
    { name: 'contrato.PDF', size: 2000, type: 'application/pdf' },
    { name: 'logo.png', size: 4096, type: 'image/png' },
    { name: 'balanco.xlsx', size: 8000, type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
    { name: 'anotacoes.txt', size: 30, type: 'text/plain' },
    { name: 'exportacao.csv', size: 128, type: 'text/csv' }
  ];

  for (const file of files) {
    const validation = api.validateCompanyDocument(file);
    assert.equal(validation.valid, true, `${file.name} deveria ser aceito.`);
    assert.ok(validation.extension);
    assert.equal(validation.error, '');
  }
});

test('uploads recusam arquivos vazios, executáveis, tipos incompatíveis e mais de 10 MB', () => {
  const { api } = createApplication();
  const unsafe = [
    undefined,
    { name: 'sem-extensao', size: 200, type: '' },
    { name: 'executavel.exe', size: 200, type: 'application/octet-stream' },
    { name: 'arquivo-vazio.pdf', size: 0, type: 'application/pdf' },
    { name: 'arquivo-grande.pdf', size: 10 * 1024 * 1024 + 1, type: 'application/pdf' },
    { name: 'imagem-falsa.pdf', size: 200, type: 'application/x-msdownload' }
  ];

  for (const file of unsafe) {
    const validation = api.validateCompanyDocument(file);
    assert.equal(validation.valid, false);
    assert.ok(validation.error, 'A interface precisa explicar a recusa do arquivo.');
  }
});

test('documentos utilizam URLs assinadas para upload, leitura e remoção na nuvem', async () => {
  const { api, files, requests } = createApplication();
  const file = { name: 'contrato.pdf', size: 1024, type: 'application/pdf' };

  assert.equal(api.companyDocumentStorageAvailable(), true);
  const uploaded = await api.saveCompanyDocument('documento-1', file);
  const signedUpload = requests.find(request => request.url.includes('operation=upload-url'));
  const directUpload = requests.find(request => request.url.startsWith('https://storage.example.test/upload/'));

  assert.equal(signedUpload.method, 'POST');
  assert.equal(signedUpload.body.id, 'documento-1');
  assert.equal(signedUpload.body.fileName, 'contrato.pdf');
  assert.equal(signedUpload.body.contentType, 'application/pdf');
  assert.equal(signedUpload.body.size, 1024);
  assert.equal(directUpload.method, 'PUT');
  assert.equal(directUpload.body, file);
  assert.equal(files.get('documento-1'), file);
  assert.match(uploaded.path, /documento-1/u);

  const signedDownload = await api.readCompanyDocument('documento-1');

  assert.match(signedDownload, /^https:\/\/storage\.example\.test\/download\/documento-1\?/u);
  assert.ok(requests.some(request => request.url.includes('operation=download-url')));

  await api.deleteCompanyDocument('documento-1');

  assert.equal(files.has('documento-1'), false);
  assert.ok(requests.some(request => request.method === 'DELETE' && request.url.includes('documento-1')));
});

test('documentos ficam indisponíveis quando a sessão na nuvem está bloqueada', () => {
  const { api } = createApplication({ cloudStatus: 'locked' });

  assert.equal(api.companyDocumentStorageAvailable(), false);
  api.setCloudStatus('connected');
  assert.equal(api.companyDocumentStorageAvailable(), true);
});

test('apenas os metadados dos documentos são enviados para o banco remoto', async () => {
  const { api, remoteState } = createApplication();
  api.state.companyDocuments.push({
    id: 'documento-2',
    name: 'Comprovante de endereço',
    filename: 'endereco.pdf',
    size: 2048,
    storagePath: 'company/documento-2/endereco.pdf'
  });

  assert.equal(api.saveState(), true);
  await api.flushStateSave();
  const persisted = remoteState.value;

  assert.equal(persisted.companyDocuments[0].name, 'Comprovante de endereço');
  assert.equal(persisted.companyDocuments[0].storagePath, 'company/documento-2/endereco.pdf');
  assert.equal('blob' in persisted.companyDocuments[0], false);
});

test('anexar um documento envia o arquivo ao bucket privado e atualiza a interface', async () => {
  const { api, document, files, remoteState, messages } = createApplication();
  const file = { name: 'contrato-social.pdf', size: 4096, type: 'application/pdf' };
  const name = document.querySelector('#company-document-name');
  const input = document.querySelector('#company-document-file');
  name.value = 'Contrato social';
  input.value = 'contrato-social.pdf';
  input.files = [file];

  await api.handleCompanyDocumentUpload();

  assert.equal(api.state.companyDocuments.length, 1);
  const metadata = api.state.companyDocuments[0];
  assert.equal(metadata.name, 'Contrato social');
  assert.equal(metadata.filename, 'contrato-social.pdf');
  assert.equal(files.get(metadata.id), file);
  assert.match(metadata.storagePath, /contrato-social\.pdf/u);
  assert.equal(name.value, '');
  assert.equal(input.value, '');
  assert.match(document.querySelector('#company-document-list').innerHTML, /Contrato social/);
  assert.match(document.querySelector('#company-document-status').textContent, /(?:salvo|armazenado|nuvem|segurança)/i);
  assert.equal(document.querySelector('#company-document-upload-button').disabled, false);
  assert.equal(remoteState.value.companyDocuments[0].name, 'Contrato social');
  assert.ok(messages().some(item => /anexado/i.test(item.textContent)));
});

test('anexos sem identificação ou com arquivo proibido não alteram os documentos existentes', async () => {
  const { api, document, writes, files } = createApplication();
  const name = document.querySelector('#company-document-name');
  const input = document.querySelector('#company-document-file');
  input.files = [{ name: 'contrato.pdf', size: 1024, type: 'application/pdf' }];

  await api.handleCompanyDocumentUpload();

  assert.equal(name.focused, true);
  assert.equal(api.state.companyDocuments.length, 0);
  assert.equal(writes.length, 0);

  name.value = 'Arquivo suspeito';
  input.files = [{ name: 'executavel.exe', size: 1024, type: 'application/octet-stream' }];
  await api.handleCompanyDocumentUpload();

  assert.equal(files.size, 0);
  assert.equal(api.state.companyDocuments.length, 0);
  assert.match(document.querySelector('#company-document-status').textContent, /formato não permitido/i);
});

test('falha ao salvar metadados remove o upload remoto e mantém os documentos consistentes', async () => {
  const { api, document, files, requests } = createApplication({ failWrites: true });
  document.querySelector('#company-document-name').value = 'Licença comercial';
  document.querySelector('#company-document-file').files = [
    { name: 'licenca.pdf', size: 2048, type: 'application/pdf' }
  ];

  await api.handleCompanyDocumentUpload();

  assert.equal(api.state.companyDocuments.length, 0);
  assert.equal(files.size, 0);
  assert.ok(requests.some(request => request.method === 'DELETE'));
  assert.equal(document.querySelector('#company-document-upload-button').disabled, false);
});

test('baixar um documento utiliza uma URL assinada e preserva o nome original', async () => {
  const file = { name: 'alvara.pdf', size: 512, type: 'application/pdf' };
  const { api, document, requests } = createApplication({
    stored: fixture({ companyDocuments: [{ id: 'alvara-1', name: 'Alvará', filename: file.name, size: file.size }] })
  });

  await api.downloadCompanyDocument('alvara-1');

  const anchor = document.createdElements.find(element => element.tagName === 'A');
  assert.ok(anchor);
  assert.equal(anchor.download, 'alvara.pdf');
  assert.equal(anchor.clicked, true);
  assert.equal(anchor.isConnected, false);
  assert.match(anchor.href, /^https:\/\/storage\.example\.test\/download\/alvara-1\?/u);
  assert.ok(requests.some(request => request.url.includes('operation=download-url')));
});

test('remover um documento exige confirmação e elimina metadados e arquivo remoto', async () => {
  const file = { name: 'registro.pdf', size: 256, type: 'application/pdf' };
  const metadata = { id: 'registro-1', name: 'Registro da empresa', filename: file.name, size: file.size };
  const { api, remoteState, window, files } = createApplication({
    stored: fixture({ companyDocuments: [metadata] })
  });
  await api.saveCompanyDocument(metadata.id, file);

  await api.removeCompanyDocument(metadata.id);

  assert.equal(window.confirmations.length, 1);
  assert.match(window.confirmations[0], /Registro da empresa/);
  assert.equal(api.state.companyDocuments.length, 0);
  assert.equal(files.size, 0);
  assert.deepEqual(remoteState.value.companyDocuments, []);
});

test('cancelar a confirmação de remoção preserva integralmente o documento', async () => {
  const file = { name: 'registro.pdf', size: 256, type: 'application/pdf' };
  const metadata = { id: 'registro-2', name: 'Registro preservado', filename: file.name, size: file.size };
  const { api, window, files } = createApplication({
    confirmResult: false,
    stored: fixture({ companyDocuments: [metadata] })
  });
  await api.saveCompanyDocument(metadata.id, file);

  await api.removeCompanyDocument(metadata.id);

  assert.equal(window.confirmations.length, 1);
  assert.equal(api.state.companyDocuments.length, 1);
  assert.equal(files.size, 1);
});

test('a persistência usa exclusivamente a API remota e nunca armazena credenciais no navegador', () => {
  assert.doesNotMatch(application, /\blocalStorage\b|\bsessionStorage\b|\bindexedDB\b/iu);
  assert.doesNotMatch(application, /\bSUPABASE_SECRET_KEY\b|\bSUPABASE_SERVICE_ROLE_KEY\b/u);
  assert.doesNotMatch(application, /\bCELLF_APP_PASSWORD\b|\bCELLF_AUTH_SECRET\b/u);
  assert.match(application, /\/api\/state/u);
  assert.match(application, /\/api\/documents/u);
  assert.match(application, /\/api\/session/u);
});

test('carregar o estado remoto busca as informações compartilhadas pelo Supabase', async () => {
  const expected = fixture({ settings: { companyName: 'Empresa Sincronizada' } });
  const { api, requests } = createApplication({ stored: expected });

  await api.loadRemoteState();

  assert.equal(api.state.settings.companyName, 'Empresa Sincronizada');
  assert.ok(requests.some(request => request.url === '/api/state' && request.method === 'GET'));
});

test('a autenticação envia a senha somente ao endpoint de sessão', async () => {
  const { api, requests } = createApplication({ cloudStatus: 'locked' });

  await api.authenticate('senha-de-teste');

  const login = requests.find(request => request.url === '/api/session');
  assert.ok(login);
  assert.equal(login.method, 'POST');
  assert.equal(login.body.password, 'senha-de-teste');
});

test('a tela de login mostra a identidade oficial Cellf e um formulário de senha acessível', () => {
  const { api, document } = createApplication({ cloudStatus: 'locked' });

  api.renderCloudAccess('login');

  const markup = document.querySelector('#app-content').innerHTML;
  assert.match(markup, /class="cloud-access-screen"/u);
  assert.match(markup, /<img\b[^>]*src="\/cellf-logo\.png"[^>]*alt="Cellf — Reparo e Comércio"/u);
  assert.match(markup, /<h1\b[^>]*id="cloud-access-title"[^>]*>Acesse sua conta<\/h1>/u);
  assert.doesNotMatch(markup, /Entre para acessar os dados e documentos da sua empresa/iu);
  assert.match(markup, /<form\b[^>]*id="cloud-login-form"[^>]*method="post"/u);
  assert.match(markup, /<label\b[^>]*for="cloud-password"/u);
  assert.match(
    markup,
    /<input\b(?=[^>]*id="cloud-password")(?=[^>]*name="password")(?=[^>]*type="password")(?=[^>]*autocomplete="current-password")(?=[^>]*aria-describedby="cloud-login-status")(?=[^>]*required\b)[^>]*>/u
  );
  assert.match(markup, /id="cloud-login-status"[^>]*role="status"[^>]*aria-live="polite"/u);
  assert.match(markup, /id="cloud-login-submit"[^>]*type="submit"/u);
  assert.match(markup, /aria-label="Mostrar senha"/u);
  assert.match(markup, /<details\b[^>]*class="cloud-privacy-details"/u);
  assert.match(markup, /Privacidade e cookies/u);
  assert.match(markup, /cookie essencial de sessão/u);
  assert.match(markup, /Não usamos cookies de publicidade ou monitoramento/u);
  assert.match(
    markup,
    /<input\b(?=[^>]*id="cloud-privacy-accept")(?=[^>]*name="privacy_consent")(?=[^>]*type="checkbox")(?=[^>]*required\b)[^>]*>/u
  );
  assert.match(markup, /Sessão protegida/u);
  assert.doesNotMatch(markup, /Dados no Supabase/u);
  assert.equal(document.body.classList.contains('cloud-auth-mode'), true);
  assert.ok(document.views.every(view => view.disabled === true));
});

test('login válido autentica a sessão, apaga a senha e carrega o painel remoto', async () => {
  const { api, document, requests } = createApplication({ cloudStatus: 'locked' });
  api.renderCloudAccess('login');

  const form = document.querySelector('#cloud-login-form');
  const password = document.querySelector('#cloud-password');
  password.value = 'senha-de-teste';
  document.querySelector('#cloud-privacy-accept').checked = true;
  let prevented = false;

  await form.listeners.get('submit')[0]({
    preventDefault() {
      prevented = true;
    }
  });

  assert.equal(prevented, true);
  assert.equal(password.value, '');
  assert.equal(requests[0].url, '/api/session');
  assert.equal(requests[0].method, 'POST');
  assert.equal(requests[1].url, '/api/state');
  assert.equal(requests[1].method, 'GET');
  assert.equal(document.body.classList.contains('cloud-auth-mode'), false);
  assert.ok(document.views.every(view => view.disabled === false));
});

test('login sem senha orienta o usuário sem enviar uma requisição', async () => {
  const { api, document, requests } = createApplication({ cloudStatus: 'locked' });
  api.renderCloudAccess('login');

  const form = document.querySelector('#cloud-login-form');
  const password = document.querySelector('#cloud-password');
  await form.listeners.get('submit')[0]({ preventDefault() {} });

  assert.equal(requests.length, 0);
  assert.equal(password.focused, true);
  assert.match(document.querySelector('#cloud-login-status').textContent, /Informe sua senha/iu);
});

test('login exige confirmação de privacidade e cookies antes de enviar a senha', async () => {
  const { api, document, requests } = createApplication({ cloudStatus: 'locked' });
  api.renderCloudAccess('login');

  const form = document.querySelector('#cloud-login-form');
  const consent = document.querySelector('#cloud-privacy-accept');
  const status = document.querySelector('#cloud-login-status');
  document.querySelector('#cloud-password').value = 'senha-de-teste';

  await form.listeners.get('submit')[0]({ preventDefault() {} });

  assert.equal(requests.length, 0);
  assert.equal(consent.focused, true);
  assert.equal(consent.getAttribute('aria-invalid'), 'true');
  assert.equal(status.getAttribute('role'), 'alert');
  assert.match(status.textContent, /privacidade e cookies/iu);

  consent.checked = true;
  consent.listeners.get('change')[0]();

  assert.equal(consent.getAttribute('aria-invalid'), null);
  assert.equal(status.textContent, '');
  assert.equal(status.getAttribute('role'), 'status');
});

test('senha incorreta produz erro acessível e não deixa credenciais no formulário', async () => {
  const { api, document, requests } = createApplication({ cloudStatus: 'locked' });
  api.renderCloudAccess('login');

  const form = document.querySelector('#cloud-login-form');
  const password = document.querySelector('#cloud-password');
  const status = document.querySelector('#cloud-login-status');
  password.value = 'senha-incorreta';
  document.querySelector('#cloud-privacy-accept').checked = true;

  await form.listeners.get('submit')[0]({ preventDefault() {} });

  assert.equal(requests.length, 1);
  assert.equal(password.value, '');
  assert.equal(password.getAttribute('aria-invalid'), 'true');
  assert.equal(status.getAttribute('role'), 'alert');
  assert.match(status.textContent, /Senha incorreta/iu);
  assert.equal(document.querySelector('#cloud-login-submit').disabled, false);
});

test('sessão ausente abre a tela de login antes de liberar informações da empresa', async () => {
  const { api, document } = createApplication({
    unauthorized: true,
    cloudStatus: 'locked'
  });

  const connected = await api.bootstrapApplication();

  assert.equal(connected, false);
  assert.match(document.querySelector('#app-content').innerHTML, /id="cloud-login-form"/u);
  assert.equal(document.body.classList.contains('cloud-auth-mode'), true);
  assert.ok(document.views.every(view => view.disabled === true));
});

test('encerrar a sessão chama DELETE e restaura a tela protegida da Cellf', async () => {
  const { api, document, requests } = createApplication();
  api.addCartProduct('produto-capa');

  await api.logout();

  const logout = requests.find(request => request.url === '/api/session');
  assert.ok(logout);
  assert.equal(logout.method, 'DELETE');
  assert.equal(api.cart.items.length, 0);
  assert.match(document.querySelector('#app-content').innerHTML, /id="cloud-login-form"/u);
  assert.equal(document.body.classList.contains('cloud-auth-mode'), true);
});

test('mensagens de erro do acesso protegido são sanitizadas contra HTML injetado', () => {
  const { api, document } = createApplication({ cloudStatus: 'locked' });

  api.renderCloudAccess('login', '<img src=x onerror=alert(1)>');

  const markup = document.querySelector('#app-content').innerHTML;
  assert.match(markup, /&lt;img src=x onerror=alert\(1\)&gt;/u);
  assert.doesNotMatch(markup, /<img src=x onerror=alert\(1\)>/u);
  assert.match(markup, /id="cloud-login-status"[^>]*role="alert"/u);
});
