const PAYMENT_LABELS = { pix: 'Pix', debit: 'Cartão de débito', credit: 'Cartão de crédito', cash: 'Dinheiro', transfer: 'Transferência' };
const APPOINTMENT_LABELS = { repair: 'Reparo', delivery: 'Entrega', consultation: 'Atendimento', reminder: 'Lembrete', meeting: 'Reunião' };
const SETTINGS_TABS = [
  { id: 'empresa', label: 'Empresa', icon: '◇' },
  { id: 'responsavel', label: 'Administrador', icon: '♧' },
  { id: 'documentos', label: 'Documentos', icon: '▤' },
  { id: 'operacao', label: 'Operação', icon: '⌁' },
  { id: 'avisos', label: 'Avisos', icon: '◷' },
  { id: 'dados', label: 'Privacidade', icon: '◈' }
];
const MAX_COMPANY_DOCUMENT_BYTES = 10 * 1024 * 1024;
const CLOUD_SAVE_DEBOUNCE_MS = 350;
const ALLOWED_COMPANY_DOCUMENT_EXTENSIONS = new Set(['pdf', 'jpg', 'jpeg', 'png', 'webp', 'doc', 'docx', 'xls', 'xlsx', 'txt', 'csv']);
const ALLOWED_COMPANY_DOCUMENT_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain',
  'text/csv'
]);

function localDate(date = new Date()) {
  const value = new Date(date);
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
}

function offsetDate(days = 0, reference = new Date()) {
  const date = new Date(reference);
  date.setDate(date.getDate() + days);
  return localDate(date);
}

const seed = {
  products: [
    { id: 'p1', sku: 'CAP-IP15-TR', name: 'Capa Armor iPhone 15', category: 'Capas', cost: 22, price: 59.9, stock: 18, minimum: 5 },
    { id: 'p2', sku: 'PEL-3D-S23', name: 'Película 3D Galaxy S23', category: 'Películas', cost: 7.5, price: 29.9, stock: 3, minimum: 6 },
    { id: 'p3', sku: 'CAB-USBC-2M', name: 'Cabo USB-C 2m Reforçado', category: 'Cabos', cost: 18, price: 44.9, stock: 12, minimum: 5 },
    { id: 'p4', sku: 'FON-BT-WH', name: 'Fone Bluetooth Wave', category: 'Áudio', cost: 58, price: 119.9, stock: 7, minimum: 3 },
    { id: 'p5', sku: 'CAR-20W-PD', name: 'Carregador Turbo 20W PD', category: 'Carregadores', cost: 42, price: 89.9, stock: 2, minimum: 4 },
    { id: 'p6', sku: 'SUP-CAR-MAG', name: 'Suporte Veicular Magnético', category: 'Acessórios', cost: 25, price: 64.9, stock: 9, minimum: 3 }
  ],
  services: [
    { id: 's1', name: 'Troca de tela — iPhone 13', category: 'Tela', pricing: 'fixed', price: 649, duration: 120, active: true },
    { id: 's2', name: 'Troca de conector de carga', category: 'Conector', pricing: 'quote', price: null, duration: 90, active: true },
    { id: 's3', name: 'Troca de bateria — linha iPhone', category: 'Bateria', pricing: 'fixed', price: 289, duration: 60, active: true },
    { id: 's4', name: 'Reparo em placa', category: 'Placa', pricing: 'quote', price: null, duration: 180, active: true },
    { id: 's5', name: 'Limpeza e desoxidação', category: 'Manutenção', pricing: 'fixed', price: 149, duration: 90, active: true }
  ],
  orders: [
    { id: 'OS-1048', customer: 'André Martins', phone: '(11) 98842-1120', device: 'iPhone 13 Pro', imei: '356938035643809', issue: 'Tela sem imagem após queda', serviceId: 's1', value: 649, status: 'progress', createdAt: offsetDate(-2), dueAt: offsetDate(1), reminderAt: `${offsetDate(1)}T10:00`, reminder: 'Avisar quando a tela chegar do fornecedor' },
    { id: 'OS-1047', customer: 'Paula Oliveira', phone: '(11) 97654-8832', device: 'Galaxy S23', imei: '', issue: 'Não carrega', serviceId: 's2', value: null, status: 'analysis', createdAt: offsetDate(-1), dueAt: offsetDate(2), reminderAt: '', reminder: '' },
    { id: 'OS-1046', customer: 'Ricardo Lima', phone: '(11) 96531-1209', device: 'Moto Edge 40', imei: '', issue: 'Troca de bateria', serviceId: 's3', value: 289, status: 'ready', createdAt: offsetDate(-3), dueAt: offsetDate(), reminderAt: `${offsetDate()}T16:30`, reminder: 'Cliente pediu ligação, não WhatsApp' },
    { id: 'OS-1045', customer: 'Camila Rocha', phone: '(11) 99821-4431', device: 'iPhone 12', imei: '', issue: 'Falha intermitente no áudio', serviceId: 's4', value: 380, status: 'waiting', createdAt: offsetDate(-4), dueAt: offsetDate(3), reminderAt: `${offsetDate(3)}T09:00`, reminder: 'Confirmar aprovação do orçamento' },
    { id: 'OS-1044', customer: 'Lucas Mendes', phone: '(11) 98510-7756', device: 'Redmi Note 12', imei: '', issue: 'Oxidação por contato com água', serviceId: 's5', value: 149, status: 'progress', createdAt: offsetDate(-5), dueAt: offsetDate(-1), reminderAt: '', reminder: '' }
  ],
  payables: [
    { id: 'a1', description: 'Fornecedor de peças — Tela iPhone', supplier: 'Alpha Parts', category: 'Peças', amount: 1850, dueAt: offsetDate(-1), paid: false },
    { id: 'a2', description: 'Aluguel da loja', supplier: 'Imobiliária Central', category: 'Fixo', amount: 3200, dueAt: offsetDate(5), paid: false },
    { id: 'a3', description: 'Internet empresarial', supplier: 'Vivo Empresas', category: 'Fixo', amount: 189.9, dueAt: offsetDate(10), paid: false },
    { id: 'a4', description: 'Embalagens e sacolas', supplier: 'PackMais', category: 'Insumos', amount: 340, dueAt: offsetDate(-3), paid: true }
  ],
  customers: [],
  sales: [],
  appointments: [],
  stockMovements: [],
  activity: [],
  companyDocuments: [],
  settings: {
    companyName: 'Cellf',
    slogan: 'Reparo e Comércio',
    legalName: 'Cellf — Reparo e Comércio',
    document: '',
    phone: '',
    email: '',
    address: '',
    city: '',
    postalCode: '',
    managerName: 'Marcos Almeida',
    managerRole: 'Administrador',
    openingTime: '09:00',
    closingTime: '18:00',
    warrantyDays: 90,
    defaultDeadlineDays: 2,
    lowStockAlert: true,
    dueDateAlert: true,
    appointmentAlert: true,
    orderNotes: 'Garantia válida conforme condições descritas na ordem de serviço.'
  }
};

let state = loadState();
let currentView = 'dashboard';
let calendarMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
let selectedAgendaDate = localDate();
let reportPeriod = 30;
let salesQuery = '';
let lastFocusedElement = null;
let cart = { items: [], customerId: '', payment: 'pix', discount: 0 };
let activeSettingsTab = 'empresa';
let companyDocumentUploadInFlight = false;
let cloudConnection = { status: 'connecting', authenticated: false, detail: '', updatedAt: null };
let pendingStateRevision = 0;
let persistedStateRevision = 0;
let stateSaveTimer = null;
let activeStateSavePromise = null;
let applicationReady = false;
let applicationBootstrapPromise = null;
const content = document.querySelector('#app-content');
const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const dateFmt = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' });
const statusMap = {
  analysis: ['Em análise', 'analysis'],
  approved: ['Aprovado', 'progress'],
  progress: ['Em reparo', 'progress'],
  waiting: ['Aguardando', 'waiting'],
  ready: ['Pronto para retirada', 'ready'],
  delivered: ['Entregue', 'paid'],
  cancelled: ['Cancelado', 'overdue']
};

function loadState(source = structuredClone(seed)) {
  try {
    const stored = source && typeof source === 'object' && !Array.isArray(source) ? source : structuredClone(seed);
    const migrated = {
      ...stored,
      products: Array.isArray(stored.products) ? stored.products : structuredClone(seed.products),
      services: Array.isArray(stored.services) ? stored.services : structuredClone(seed.services),
      orders: Array.isArray(stored.orders) ? stored.orders : structuredClone(seed.orders),
      payables: Array.isArray(stored.payables) ? stored.payables : structuredClone(seed.payables),
      customers: Array.isArray(stored.customers) ? stored.customers : [],
      sales: Array.isArray(stored.sales) ? stored.sales : [],
      appointments: Array.isArray(stored.appointments) ? stored.appointments : [],
      stockMovements: Array.isArray(stored.stockMovements) ? stored.stockMovements : [],
      activity: Array.isArray(stored.activity) ? stored.activity : [],
      companyDocuments: Array.isArray(stored.companyDocuments) ? stored.companyDocuments : [],
      settings: { ...seed.settings, ...(stored.settings && typeof stored.settings === 'object' ? stored.settings : {}) }
    };

    migrated.orders.forEach(order => {
      const digits = String(order.phone || '').replace(/\D/g, '');
      let customer = migrated.customers.find(entry => {
        const phone = String(entry.phone || '').replace(/\D/g, '');
        return (digits && phone === digits) || entry.name?.toLowerCase() === String(order.customer || '').toLowerCase();
      });

      if (!customer && order.customer) {
        customer = {
          id: `customer-${order.id.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
          name: order.customer,
          phone: order.phone || '',
          email: '',
          document: '',
          notes: '',
          createdAt: order.createdAt || localDate(),
          active: true
        };
        migrated.customers.push(customer);
      }

      if (customer && !order.customerId) order.customerId = customer.id;
    });

    return migrated;
  } catch {
    return {
      ...structuredClone(seed),
      customers: seed.orders.map(order => ({
        id: `customer-${order.id.toLowerCase()}`,
        name: order.customer,
        phone: order.phone,
        email: '',
        document: '',
        notes: '',
        createdAt: order.createdAt,
        active: true
      }))
    };
  }
}

function updateCloudIndicator() {
  const indicator = document.querySelector('.storage-note');
  const title = document.querySelector('.storage-note strong');
  const description = document.querySelector('.storage-note small');
  const labels = {
    connecting: ['Conectando ao Supabase', 'Verificando acesso seguro'],
    locked: ['Acesso protegido', 'Entre para acessar a nuvem'],
    connected: ['Supabase conectado', 'Dados protegidos na nuvem'],
    saving: ['Salvando no Supabase', 'Sincronização em andamento'],
    error: ['Sincronização interrompida', 'Confira sua conexão e tente novamente'],
    unconfigured: ['Supabase indisponível', 'Configuração necessária no servidor']
  };
  const [heading, detail] = labels[cloudConnection.status] || labels.error;
  if (indicator) {
    indicator.setAttribute('aria-label', `${heading}. ${cloudConnection.detail || detail}`);
    indicator.setAttribute('aria-live', 'polite');
    indicator.dataset.cloudStatus = cloudConnection.status;
  }
  if (title) title.textContent = heading;
  if (description) description.textContent = cloudConnection.detail || detail;
}

function setCloudStatus(status, detail = '') {
  cloudConnection.status = status;
  cloudConnection.detail = String(detail || '');
  if (status === 'connected') cloudConnection.authenticated = true;
  if (status === 'locked' || status === 'unconfigured') cloudConnection.authenticated = false;
  updateCloudIndicator();
  return cloudConnection;
}

async function apiRequest(path, options = {}) {
  const headers = { Accept: 'application/json', ...(options.headers || {}) };
  const response = await fetch(path, { ...options, credentials: 'same-origin', cache: 'no-store', headers });
  let payload = {};
  try { payload = await response.json(); }
  catch { payload = {}; }
  if (!response.ok) {
    const error = new Error(payload.message || `A solicitação falhou (${response.status || 'sem resposta'}).`);
    error.code = payload.code || 'REQUEST_FAILED';
    error.status = Number(response.status || 0);
    throw error;
  }
  return payload;
}

function handleCloudError(error, { showAccessScreen = true } = {}) {
  if (error?.status === 401) {
    setCloudStatus('locked');
    if (showAccessScreen) renderCloudAccess('login', error.message || 'Sua sessão expirou. Entre novamente para continuar.');
    return;
  }
  if (error?.status === 503 || /NOT_CONFIGURED|CONFIGURATION/i.test(String(error?.code || ''))) {
    setCloudStatus('unconfigured');
    if (showAccessScreen) renderCloudAccess('configuration', error.message);
    return;
  }
  setCloudStatus('error');
  if (showAccessScreen && !applicationReady) renderCloudAccess('connection', error?.message);
}

function saveState() {
  if (!cloudConnection.authenticated) {
    toast('Entre novamente para salvar os dados no Supabase.', 'error');
    return false;
  }

  pendingStateRevision += 1;
  refreshBadges();
  syncShell();
  setCloudStatus('saving');
  if (stateSaveTimer) clearTimeout(stateSaveTimer);
  stateSaveTimer = setTimeout(() => {
    stateSaveTimer = null;
    flushStateSave().catch(error => {
      handleCloudError(error);
      if (error?.status !== 401) toast(error?.message || 'Não foi possível sincronizar os dados com o Supabase.', 'error');
    });
  }, CLOUD_SAVE_DEBOUNCE_MS);
  return true;
}

async function flushStateSave() {
  if (stateSaveTimer) {
    clearTimeout(stateSaveTimer);
    stateSaveTimer = null;
  }
  if (activeStateSavePromise) {
    await activeStateSavePromise;
    return pendingStateRevision > persistedStateRevision ? flushStateSave() : true;
  }
  if (pendingStateRevision <= persistedStateRevision) return true;
  if (!cloudConnection.authenticated) {
    const error = new Error('Sua sessão expirou. Entre novamente para salvar seus dados.');
    error.code = 'UNAUTHENTICATED';
    error.status = 401;
    throw error;
  }

  activeStateSavePromise = (async () => {
    while (pendingStateRevision > persistedStateRevision) {
      const revision = pendingStateRevision;
      setCloudStatus('saving');
      const payload = await apiRequest('/api/state', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ state })
      });
      persistedStateRevision = revision;
      cloudConnection.updatedAt = payload.updatedAt || new Date().toISOString();
    }
    setCloudStatus('connected');
    return true;
  })();

  try {
    return await activeStateSavePromise;
  } catch (error) {
    handleCloudError(error);
    throw error;
  } finally {
    activeStateSavePromise = null;
  }
}
function uid(prefix) { return `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2,5)}`; }
function esc(value = '') { return String(value).replace(/[&<>'"]/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[c])); }
function isoToday() { return localDate(); }
function formatDate(value) {
  if (!value) return '—';
  const date = new Date(`${String(value).slice(0, 10)}T12:00:00`);
  return Number.isNaN(date.valueOf()) ? '—' : dateFmt.format(date).replace('.', '');
}
function formatDateTime(value) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? '—' : date.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}
function initials(value = '') {
  return String(value).trim().split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join('').toUpperCase() || 'C';
}
function normalize(value = '') {
  return String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}
function formatCnpj(value = '') {
  return String(value).replace(/\D/g, '').slice(0, 14)
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2')
    .replace(/(\d{4})(\d)/, '$1-$2');
}
function isValidCnpj(value = '') {
  const digits = String(value).replace(/\D/g, '');
  if (digits.length !== 14 || /^(\d)\1{13}$/.test(digits)) return false;
  const verifier = (base, weights) => {
    const total = [...base].reduce((sum, digit, index) => sum + Number(digit) * weights[index], 0);
    const remainder = total % 11;
    return remainder < 2 ? 0 : 11 - remainder;
  };
  return verifier(digits.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]) === Number(digits[12])
    && verifier(digits.slice(0, 13), [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]) === Number(digits[13]);
}
function formatFileSize(bytes = 0) {
  const size = Number(bytes || 0);
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} KB`;
  return `${(size / (1024 * 1024)).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} MB`;
}
function validateCompanyDocument(file) {
  if (!file) return { valid: false, error: 'Escolha um arquivo para anexar.' };
  const name = String(file.name || '').trim();
  const extension = name.includes('.') ? name.split('.').at(-1).toLowerCase() : '';
  if (!name || !ALLOWED_COMPANY_DOCUMENT_EXTENSIONS.has(extension)) return { valid: false, error: 'Formato não permitido. Envie PDF, imagem, Word, Excel, TXT ou CSV.' };
  if (!Number.isFinite(Number(file.size)) || Number(file.size) <= 0) return { valid: false, error: 'O arquivo está vazio ou não pôde ser lido.' };
  if (Number(file.size) > MAX_COMPANY_DOCUMENT_BYTES) return { valid: false, error: 'O arquivo ultrapassa o limite de 10 MB.' };
  const type = String(file.type || '').toLowerCase().split(';')[0];
  if (type && !ALLOWED_COMPANY_DOCUMENT_TYPES.has(type)) return { valid: false, error: 'O tipo do arquivo não é aceito por segurança.' };
  return { valid: true, error: '', extension };
}
function companyDocumentStorageAvailable() {
  return cloudConnection.authenticated && !['locked', 'connecting', 'unconfigured'].includes(cloudConnection.status);
}
async function saveCompanyDocument(id, file) {
  const contentType = file.type || 'application/octet-stream';
  const upload = await apiRequest('/api/documents?operation=upload-url', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, fileName: file.name, contentType, size: Number(file.size) })
  });
  if (!upload.signedUrl || !upload.path) throw new Error('O servidor não forneceu um endereço seguro para enviar o documento.');
  const response = await fetch(upload.signedUrl, {
    method: 'PUT',
    headers: { 'Content-Type': contentType, 'x-upsert': 'false' },
    body: file
  });
  if (!response.ok) {
    const error = new Error('Não foi possível enviar o documento para o armazenamento seguro do Supabase.');
    error.status = Number(response.status || 0);
    throw error;
  }
  return { signedUrl: upload.signedUrl, path: upload.path };
}
async function readCompanyDocument(id) {
  const result = await apiRequest(`/api/documents?operation=download-url&id=${encodeURIComponent(id)}`);
  if (!result.signedUrl) throw new Error('O servidor não forneceu um link seguro para baixar o documento.');
  return result.signedUrl;
}
async function deleteCompanyDocument(id) {
  return apiRequest(`/api/documents?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
}
function sum(records, field = 'amount') { return records.reduce((total, record) => total + Number(record[field] || 0), 0); }
function customerOrders(customer) {
  return state.orders.filter(order => order.customerId === customer.id || normalize(order.customer) === normalize(customer.name));
}
function customerSales(customer) { return state.sales.filter(sale => sale.customerId === customer.id); }
function recordActivity(kind, description) {
  state.activity.unshift({ id: uid('log'), kind, description, createdAt: new Date().toISOString() });
  state.activity = state.activity.slice(0, 80);
}
function statusLabel(status) { return statusMap[status]?.[0] || status; }
function serviceName(id) { return state.services.find(s => s.id === id)?.name || 'Serviço personalizado'; }
function pageHeading(eyebrow, title, subtitle, actions = '') {
  return `<div class="page-heading page-header"><div><p class="eyebrow">${esc(eyebrow)}</p><h1 class="page-title">${esc(title)}</h1><p>${esc(subtitle)}</p></div>${actions ? `<div class="heading-actions page-actions">${actions}</div>` : ''}</div>`;
}
function emptyState(title, description, action = '') {
  return `<div class="empty-state"><span class="empty-icon" aria-hidden="true">◇</span><strong>${esc(title)}</strong><p>${esc(description)}</p>${action}</div>`;
}
function associateFormLabels(root = document) {
  root.querySelectorAll('.field').forEach((field, index) => {
    const label = field.querySelector(':scope > label');
    const control = field.querySelector(':scope > input, :scope > select, :scope > textarea');
    if (!label || !control || label.contains(control)) return;
    if (!control.id) {
      const scope = root.id || currentView || 'cellf';
      const name = String(control.name || `campo-${index}`).replace(/[^a-zA-Z0-9_-]/g, '-');
      control.id = `${scope}-${name}-${index}`;
    }
    label.htmlFor = control.id;
  });
}
function syncShell() {
  const profile = document.querySelector('#profile-name');
  const role = document.querySelector('#profile-role');
  const avatar = document.querySelector('.user-card .avatar');
  const brandCaption = document.querySelector('#brand-caption');
  const breadcrumbBrand = document.querySelector('.breadcrumb > span:first-child');
  const topbarDate = document.querySelector('#topbar-date');
  if (profile) profile.textContent = state.settings.managerName || 'Equipe Cellf';
  if (role) role.textContent = state.settings.managerRole || 'Administrador';
  if (avatar) avatar.textContent = initials(state.settings.managerName);
  if (brandCaption) brandCaption.textContent = state.settings.slogan || state.settings.legalName || 'Reparo e Comércio';
  if (breadcrumbBrand) breadcrumbBrand.textContent = state.settings.companyName || 'Cellf';
  if (topbarDate) topbarDate.textContent = new Intl.DateTimeFormat('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' }).format(new Date()).replaceAll('.', '');
  if (typeof document.title === 'string') document.title = `${state.settings.companyName || 'Cellf'} — ${state.settings.slogan || 'Reparo e Comércio'}`;
  updateCloudIndicator();
}

function renderDashboard() {
  const today = isoToday();
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite';
  const firstName = (state.settings.managerName || 'equipe').trim().split(/\s+/)[0];
  const fullDate = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' }).format(new Date()).toUpperCase();
  const active = state.orders.filter(order => !['ready', 'delivered', 'cancelled'].includes(order.status));
  const ready = state.orders.filter(order => order.status === 'ready');
  const lowProducts = state.products.filter(product => product.stock <= product.minimum).sort((a, b) => a.stock - b.stock);
  const openPayables = state.payables.filter(payable => !payable.paid);
  const payable = sum(openPayables);
  const todaySales = state.sales.filter(sale => String(sale.createdAt).slice(0, 10) === today && sale.status !== 'cancelled');
  const recentOrders = [...state.orders].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))).slice(0, 5);
  const reminders = state.orders.filter(order => order.reminderAt && order.reminder).sort((a, b) => a.reminderAt.localeCompare(b.reminderAt)).slice(0, 3);
  const appointmentCount = state.appointments.filter(appointment => appointment.date === today && appointment.status !== 'cancelled').length;
  content.innerHTML = `
    ${pageHeading(fullDate, `${greeting}, ${firstName}.`, 'Acompanhe o que precisa da sua atenção hoje.', '<button class="ghost-button" data-view="agenda">◷ Ver agenda</button><button class="primary-button" data-action="new-order">＋ Nova ordem</button>')}
    <div class="stats-grid">
      ${statCard('ORDENS EM ANDAMENTO', active.length, '⌁', `${active.filter(order => order.dueAt < today).length} com prazo vencido`, true)}
      ${statCard('PRONTAS PARA RETIRADA', ready.length, '✓', ready.length ? 'Aguardando contato com os clientes' : 'Nenhum aparelho aguardando')}
      ${statCard('VENDAS DE HOJE', brl.format(sum(todaySales, 'total')), '↗', `${todaySales.length} ${todaySales.length === 1 ? 'venda concluída' : 'vendas concluídas'}`)}
      ${statCard('CONTAS EM ABERTO', brl.format(payable), '↘', `${openPayables.filter(item => item.dueAt < today).length} vencidas · ${openPayables.length} no total`)}
    </div>
    <section class="quick-actions" aria-label="Ações rápidas">
      <button class="quick-action action-card" data-action="new-order"><span aria-hidden="true">▤</span><strong>Abrir ordem</strong><small>Registrar um novo aparelho</small></button>
      <button class="quick-action action-card" data-view="sales"><span aria-hidden="true">◈</span><strong>Nova venda</strong><small>Ir para o ponto de venda</small></button>
      <button class="quick-action action-card" data-action="new-customer"><span aria-hidden="true">♧</span><strong>Cadastrar cliente</strong><small>Adicionar contato à carteira</small></button>
      <button class="quick-action action-card" data-action="new-appointment"><span aria-hidden="true">◷</span><strong>Agendar atendimento</strong><small>${appointmentCount} ${appointmentCount === 1 ? 'compromisso hoje' : 'compromissos hoje'}</small></button>
    </section>
    <div class="dashboard-grid">
      <section class="card">
        <header class="card-header"><div><p class="eyebrow">MOVIMENTO RECENTE</p><h2>Ordens em andamento</h2></div><button class="text-button" data-view="orders">Ver todas →</button></header>
        <div class="orders-list">${recentOrders.length ? recentOrders.map(orderRow).join('') : emptyState('Nenhuma ordem registrada', 'Abra a primeira ordem para acompanhar seus reparos.')}</div>
      </section>
      <section class="card imei-card">
        <div class="imei-inner"><div class="imei-icon">⌕</div><h2>Consulta rápida de IMEI</h2><p>Verifique a situação legal de um aparelho antes de recebê-lo ou revendê-lo.</p>
          <form class="imei-form" id="imei-form"><input id="imei-input" inputmode="numeric" maxlength="18" placeholder="Digite os 15 dígitos" aria-label="IMEI" required><button aria-label="Consultar IMEI">→</button></form>
          <div class="imei-hint"><span>ⓘ</span><span>Integração segura via Infosimples / Anatel</span></div><div id="imei-result" role="status"></div>
        </div>
      </section>
    </div>
    <div class="bottom-grid">
      <section class="card"><header class="card-header"><div><p class="eyebrow">INVENTÁRIO</p><h2>Atenção ao estoque</h2></div><button class="text-button" data-view="products">Gerenciar →</button></header>
        <div class="stock-list">${lowProducts.length ? lowProducts.slice(0, 5).map(stockRow).join('') : emptyState('Estoque em dia', 'Nenhum produto está abaixo do mínimo configurado.')}</div>
      </section>
      <section class="card"><header class="card-header"><div><p class="eyebrow">AGENDA</p><h2>Próximos lembretes</h2></div><button class="text-button" id="open-reminders">Ver central →</button></header>
        <div class="reminders">${reminders.length ? reminders.map(reminderRow).join('') : emptyState('Tudo organizado', 'Nenhum lembrete pendente para suas ordens.')}</div>
      </section>
    </div>`;
  document.querySelector('#imei-form').addEventListener('submit', consultImei);
  document.querySelector('#open-reminders')?.addEventListener('click', openNotifications);
}

function statCard(label, value, icon, caption, highlight = false) {
  return `<article class="stat-card ${highlight ? 'highlight' : ''}"><div class="stat-top"><span>${label}</span><span class="stat-icon">${icon}</span></div><strong class="stat-value">${value}</strong><span class="stat-caption">${caption}</span></article>`;
}
function orderRow(o) {
  const deviceInitials = String(o.device || '').split(' ').map(part => part[0]).slice(0, 2).join('');
  return `<div class="order-row"><div class="device-thumb">${esc(deviceInitials)}</div><div class="order-main"><strong>${esc(o.customer)}</strong><small>${esc(o.id)} · ${formatDate(o.createdAt)}</small></div><div class="order-device"><strong>${esc(o.device)}</strong><small>${esc(o.issue)}</small></div><span class="status order-status ${statusMap[o.status]?.[1] || ''}" title="${esc(statusLabel(o.status))}">${esc(statusLabel(o.status))}</span><strong class="money order-value">${o.value == null ? 'A consultar' : brl.format(o.value)}</strong><button class="more-button" data-action="view-order" data-id="${esc(o.id)}" aria-label="Ver ordem ${esc(o.id)}">•••</button></div>`;
}
function stockRow(p) {
  const ratio = Math.min(100, Math.round((p.stock / Math.max(p.minimum * 3, 1)) * 100));
  return `<div class="stock-row"><div><strong>${esc(p.name)}</strong><small>${esc(p.sku)} · Mín. ${p.minimum}</small></div><span>${p.stock} un.</span><div class="stock-bar ${p.stock <= p.minimum ? 'danger' : ''}"><i style="width:${ratio}%"></i></div><strong class="money">${brl.format(p.price)}</strong></div>`;
}
function reminderRow(o) {
  const d = new Date(o.reminderAt);
  return `<div class="reminder"><div class="reminder-date"><span><strong>${String(d.getDate()).padStart(2,'0')}</strong>${d.toLocaleDateString('pt-BR',{month:'short'}).replace('.','').toUpperCase()}</span></div><div><strong>${esc(o.customer)} · ${esc(o.device)}</strong><small>${esc(o.reminder)} · ${d.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})}</small></div></div>`;
}

function renderProducts() {
  const lowStock = state.products.filter(product => product.stock <= product.minimum);
  const stockCost = state.products.reduce((total, product) => total + Number(product.cost || 0) * Number(product.stock || 0), 0);
  const stockRetail = state.products.reduce((total, product) => total + Number(product.price || 0) * Number(product.stock || 0), 0);
  content.innerHTML = `${pageHeading('INVENTÁRIO', 'Produtos e estoque', `${state.products.length} produtos cadastrados na sua loja`, '<button class="ghost-button" data-action="stock-movement">↕ Movimentar estoque</button><button class="primary-button" data-action="new-product">＋ Novo produto</button>')}
  <div class="summary-strip insight-grid">
    ${statCard('PRODUTOS CADASTRADOS', state.products.length, '◇', `${new Set(state.products.map(product => product.category)).size} categorias`)}
    ${statCard('ESTOQUE BAIXO', lowStock.length, '!', lowStock.length ? 'Precisam de reposição' : 'Nenhum item em alerta')}
    ${statCard('CUSTO DO ESTOQUE', brl.format(stockCost), '↘', `${state.products.reduce((total, product) => total + Number(product.stock || 0), 0)} unidades disponíveis`)}
    ${statCard('VALOR POTENCIAL', brl.format(stockRetail), '↗', 'Considerando o preço de venda')}
  </div>
  ${tableShell('products', `<option value="">Todas as categorias</option><option value="__low__">Estoque baixo</option>${[...new Set(state.products.map(product => product.category))].map(category => `<option value="${esc(category)}">${esc(category)}</option>`).join('')}`, productRows(state.products), productMobile(state.products), state.products.length)}`;
  bindTableFilter('products');
}
function productRows(list) {
  return `<thead><tr><th>PRODUTO</th><th>CATEGORIA</th><th>PREÇO</th><th>ESTOQUE</th><th>STATUS</th><th><span class="sr-only">Ações</span></th></tr></thead><tbody>${list.length ? list.map(product => `<tr><td><div class="cell-main"><span class="product-thumb">${esc(product.name?.[0] || 'P')}</span><span><strong>${esc(product.name)}</strong><small>${esc(product.sku)}</small></span></div></td><td>${esc(product.category)}</td><td class="money">${brl.format(product.price)}</td><td><span class="stock-pill ${product.stock <= product.minimum ? 'low' : ''}">${product.stock} un.</span><br><small>Mínimo: ${product.minimum}</small></td><td><span class="status ${product.stock <= product.minimum ? 'overdue' : 'ready'}">${product.stock === 0 ? 'Sem estoque' : product.stock <= product.minimum ? 'Estoque baixo' : 'Disponível'}</span></td><td><button class="more-button" data-action="edit-product" data-id="${esc(product.id)}" aria-label="Editar ${esc(product.name)}">•••</button></td></tr>`).join('') : '<tr><td colspan="6"><div class="table-empty">Nenhum produto encontrado.</div></td></tr>'}</tbody>`;
}
function productMobile(list) { return list.map(product => `<article class="mobile-card"><div class="mobile-card-top"><div><strong>${esc(product.name)}</strong><small>${esc(product.sku)} · ${esc(product.category)}</small></div><button class="more-button" data-action="edit-product" data-id="${esc(product.id)}" aria-label="Editar produto">•••</button></div><div class="mobile-card-bottom"><span>${Number(product.stock || 0)} un.</span><strong class="money">${brl.format(product.price)}</strong></div></article>`).join(''); }

function renderServices() {
  const active = state.services.filter(service => service.active);
  const fixed = active.filter(service => service.pricing === 'fixed');
  content.innerHTML = `${pageHeading('CATÁLOGO', 'Serviços e reparos', `${active.length} serviços disponíveis para novas ordens`, '<button class="primary-button" data-action="new-service">＋ Novo serviço</button>')}
  <div class="summary-strip insight-grid">${statCard('SERVIÇOS ATIVOS', active.length, '⌁', `${state.services.length - active.length} inativos`)}${statCard('PREÇO MÉDIO', fixed.length ? brl.format(sum(fixed, 'price') / fixed.length) : '—', '↗', `${fixed.length} com preço fixo`)}${statCard('DURAÇÃO MÉDIA', active.length ? `${Math.round(sum(active, 'duration') / active.length)} min` : '—', '◷', 'Tempo estimado de atendimento')}${statCard('CATEGORIAS', new Set(active.map(service => service.category)).size, '◇', 'Especialidades disponíveis')}</div>
  ${tableShell('services', '<option value="">Todos os serviços</option><option value="fixed">Preço fixo</option><option value="quote">A consultar</option><option value="inactive">Inativos</option>', serviceRows(state.services), serviceMobile(state.services), state.services.length)}`;
  bindTableFilter('services');
}
function serviceRows(list) { return `<thead><tr><th>SERVIÇO</th><th>CATEGORIA</th><th>COBRANÇA</th><th>DURAÇÃO</th><th>STATUS</th><th><span class="sr-only">Ações</span></th></tr></thead><tbody>${list.length ? list.map(service => `<tr><td><div class="cell-main"><span class="product-thumb">⌁</span><span><strong>${esc(service.name)}</strong><small>${esc(service.id.toUpperCase())}</small></span></div></td><td>${esc(service.category)}</td><td class="money">${service.pricing === 'fixed' ? brl.format(service.price) : 'A consultar'}</td><td>${service.duration} min</td><td><span class="status ${service.active ? 'ready' : 'waiting'}">${service.active ? 'Ativo' : 'Inativo'}</span></td><td><button class="more-button" data-action="edit-service" data-id="${esc(service.id)}" aria-label="Editar ${esc(service.name)}">•••</button></td></tr>`).join('') : '<tr><td colspan="6"><div class="table-empty">Nenhum serviço encontrado.</div></td></tr>'}</tbody>`; }
function serviceMobile(list) { return list.map(service => `<article class="mobile-card"><div class="mobile-card-top"><div><strong>${esc(service.name)}</strong><small>${esc(service.category)} · ${Number(service.duration || 0)} min</small></div><button class="more-button" data-action="edit-service" data-id="${esc(service.id)}" aria-label="Editar serviço">•••</button></div><div class="mobile-card-bottom"><span class="status ${service.active ? 'ready' : 'waiting'}">${service.active ? 'Ativo' : 'Inativo'}</span><strong class="money">${service.pricing === 'fixed' ? brl.format(service.price) : 'A consultar'}</strong></div></article>`).join(''); }

function renderCustomers() {
  const active = state.customers.filter(customer => customer.active !== false);
  const recurring = active.filter(customer => customerOrders(customer).length + customerSales(customer).length > 1);
  const currentMonth = isoToday().slice(0, 7);
  const recent = active.filter(customer => String(customer.createdAt || '').slice(0, 7) === currentMonth);
  content.innerHTML = `${pageHeading('RELACIONAMENTO', 'Clientes', `${active.length} clientes na carteira da Cellf`, '<button class="primary-button" data-action="new-customer">＋ Novo cliente</button>')}
    <div class="summary-strip insight-grid">${statCard('CLIENTES ATIVOS', active.length, '♧', `${state.customers.length - active.length} inativos`)}${statCard('CLIENTES RECORRENTES', recurring.length, '↻', 'Com mais de um atendimento')}${statCard('NOVOS ESTE MÊS', recent.length, '＋', 'Cadastros no mês atual')}${statCard('COM ORDENS ABERTAS', active.filter(customer => customerOrders(customer).some(order => !['delivered', 'cancelled'].includes(order.status))).length, '⌁', 'Acompanhamento em andamento')}</div>
    ${tableShell('customers', '<option value="">Todos os clientes</option><option value="active-orders">Com ordens abertas</option><option value="recurring">Recorrentes</option><option value="inactive">Inativos</option>', customerRows(state.customers), customerMobile(state.customers), state.customers.length)}`;
  bindTableFilter('customers');
}

function customerRows(list) {
  return `<thead><tr><th>CLIENTE</th><th>CONTATO</th><th>ATENDIMENTOS</th><th>TOTAL MOVIMENTADO</th><th>ÚLTIMO ATENDIMENTO</th><th><span class="sr-only">Ações</span></th></tr></thead><tbody>${list.length ? list.map(customer => {
    const orders = customerOrders(customer);
    const sales = customerSales(customer);
    const last = [...orders.map(order => order.createdAt), ...sales.map(sale => String(sale.createdAt).slice(0, 10))].filter(Boolean).sort().at(-1);
    const total = sum(orders.filter(order => order.status !== 'cancelled'), 'value') + sum(sales.filter(sale => sale.status !== 'cancelled'), 'total');
    return `<tr><td><div class="cell-main"><span class="customer-avatar avatar">${esc(initials(customer.name))}</span><span><strong>${esc(customer.name)}</strong><small>${customer.active === false ? 'Cadastro inativo' : esc(customer.document || 'Cliente Cellf')}</small></span></div></td><td>${esc(customer.phone || '—')}<br><small>${esc(customer.email || 'Sem e-mail')}</small></td><td>${orders.length} ${orders.length === 1 ? 'ordem' : 'ordens'} · ${sales.length} ${sales.length === 1 ? 'venda' : 'vendas'}</td><td class="money">${brl.format(total)}</td><td>${formatDate(last)}</td><td><button class="more-button" data-action="view-customer" data-id="${esc(customer.id)}" aria-label="Ver ${esc(customer.name)}">•••</button></td></tr>`;
  }).join('') : '<tr><td colspan="6"><div class="table-empty">Nenhum cliente encontrado.</div></td></tr>'}</tbody>`;
}

function customerMobile(list) {
  return list.map(customer => `<article class="mobile-card customer-card"><div class="mobile-card-top"><div class="customer-meta"><span class="customer-avatar avatar">${esc(initials(customer.name))}</span><div><strong>${esc(customer.name)}</strong><small>${esc(customer.phone || 'Telefone não informado')}</small></div></div><button class="more-button" data-action="view-customer" data-id="${esc(customer.id)}" aria-label="Ver cliente">•••</button></div><div class="mobile-card-bottom"><span>${customerOrders(customer).length} atendimentos</span><strong class="money">${brl.format(sum(customerSales(customer), 'total'))}</strong></div></article>`).join('');
}

function renderOrders() {
  const open = state.orders.filter(order => !['delivered', 'cancelled'].includes(order.status));
  const overdue = open.filter(order => order.dueAt < isoToday());
  const completed = state.orders.filter(order => order.status === 'delivered');
  content.innerHTML = `${pageHeading('ASSISTÊNCIA TÉCNICA', 'Ordens de serviço', `${open.length} ordens em acompanhamento`, '<button class="ghost-button" data-view="agenda">◷ Agenda de entregas</button><button class="primary-button" data-action="new-order">＋ Nova ordem</button>')}
  <div class="summary-strip insight-grid">${statCard('EM ANÁLISE', state.orders.filter(order => order.status === 'analysis').length, '⌕', 'Aguardando diagnóstico')}${statCard('EM REPARO', state.orders.filter(order => ['approved', 'progress'].includes(order.status)).length, '⌁', `${overdue.length} com prazo vencido`)}${statCard('PRONTAS', state.orders.filter(order => order.status === 'ready').length, '✓', 'Disponíveis para retirada')}${statCard('VALOR EM ABERTO', brl.format(sum(open, 'value')), '↗', `${completed.length} já entregues`)}</div>
  ${tableShell('orders', `<option value="">Todos os status</option><option value="overdue">Prazo vencido</option>${Object.entries(statusMap).map(([value, [label]]) => `<option value="${value}">${label}</option>`).join('')}`, orderRows(state.orders), orderMobile(state.orders), state.orders.length)}`;
  bindTableFilter('orders');
}
function orderRows(list) {
  return `<thead><tr><th>ORDEM / CLIENTE</th><th>APARELHO</th><th>SERVIÇO</th><th>PREVISÃO</th><th>VALOR</th><th>STATUS</th><th><span class="sr-only">Ações</span></th></tr></thead><tbody>${list.length ? list.map(order => {
    const overdue = order.dueAt < isoToday() && !['delivered', 'cancelled'].includes(order.status);
    return `<tr><td><div class="cell-main"><span class="product-thumb">${esc(order.id.slice(-2))}</span><span><strong>${esc(order.customer)}</strong><small>${esc(order.id)} · ${esc(order.phone || 'Sem telefone')}</small></span></div></td><td><strong>${esc(order.device)}</strong><br><small>${esc(order.issue)}</small></td><td>${esc(serviceName(order.serviceId))}</td><td><span class="${overdue ? 'text-danger' : ''}">${formatDate(order.dueAt)}</span>${overdue ? '<br><small class="text-danger">Prazo vencido</small>' : ''}</td><td class="money">${order.value == null ? 'A consultar' : brl.format(order.value)}</td><td><select class="inline-status" data-action="order-status" data-id="${esc(order.id)}" aria-label="Status da ordem ${esc(order.id)}">${Object.entries(statusMap).map(([value, [label]]) => `<option value="${value}" ${order.status === value ? 'selected' : ''}>${label}</option>`).join('')}</select></td><td><button class="more-button" data-action="view-order" data-id="${esc(order.id)}" aria-label="Ver ordem ${esc(order.id)}">•••</button></td></tr>`;
  }).join('') : '<tr><td colspan="7"><div class="table-empty">Nenhuma ordem encontrada.</div></td></tr>'}</tbody>`;
}
function orderMobile(list) { return list.map(order => `<article class="mobile-card"><div class="mobile-card-top"><div><strong>${esc(order.customer)}</strong><small>${esc(order.id)} · ${esc(order.device)}</small></div><button class="more-button" data-action="view-order" data-id="${esc(order.id)}" aria-label="Ver ordem">•••</button></div><div class="mobile-card-bottom"><span class="status order-status ${statusMap[order.status]?.[1] || 'waiting'}" title="${esc(statusLabel(order.status))}">${esc(statusLabel(order.status))}</span><strong class="money order-value">${order.value == null ? 'A consultar' : brl.format(order.value)}</strong></div></article>`).join(''); }

function renderPayables() {
  const open = state.payables.filter(payable => !payable.paid);
  const overdue = open.filter(payable => payable.dueAt < isoToday());
  const dueSoon = open.filter(payable => payable.dueAt >= isoToday() && payable.dueAt <= offsetDate(7));
  const paidMonth = state.payables.filter(payable => payable.paid && String(payable.paidAt || payable.dueAt).slice(0, 7) === isoToday().slice(0, 7));
  content.innerHTML = `${pageHeading('FINANCEIRO', 'Contas a pagar', `${brl.format(sum(open))} em compromissos pendentes`, '<button class="primary-button" data-action="new-payable">＋ Nova conta</button>')}
  <div class="summary-strip insight-grid">${statCard('TOTAL EM ABERTO', brl.format(sum(open)), '↘', `${open.length} ${open.length === 1 ? 'lançamento' : 'lançamentos'}`, true)}${statCard('VENCIDAS', brl.format(sum(overdue)), '!', `${overdue.length} aguardando pagamento`)}${statCard('PRÓXIMOS 7 DIAS', brl.format(sum(dueSoon)), '◷', `${dueSoon.length} vencimentos próximos`)}${statCard('PAGO NO MÊS', brl.format(sum(paidMonth)), '✓', `${paidMonth.length} pagamentos registrados`)}</div>
  ${tableShell('payables', '<option value="">Todos os lançamentos</option><option value="open">Em aberto</option><option value="overdue">Vencidas</option><option value="soon">Próximos 7 dias</option><option value="paid">Pagas</option>', payableRows(state.payables), payableMobile(state.payables), state.payables.length)}`;
  bindTableFilter('payables');
}
function payableRows(list) { return `<thead><tr><th>DESCRIÇÃO</th><th>FORNECEDOR</th><th>CATEGORIA</th><th>VENCIMENTO</th><th>VALOR</th><th>STATUS</th><th><span class="sr-only">Ações</span></th></tr></thead><tbody>${list.length ? list.map(payable => `<tr><td><div class="cell-main"><span class="product-thumb">↘</span><span><strong>${esc(payable.description)}</strong><small>${esc(payable.id.toUpperCase())}</small></span></div></td><td>${esc(payable.supplier)}</td><td>${esc(payable.category)}</td><td>${formatDate(payable.dueAt)}</td><td class="money">${brl.format(payable.amount)}</td><td><span class="status ${payable.paid ? 'paid' : payable.dueAt < isoToday() ? 'overdue' : 'waiting'}">${payable.paid ? 'Paga' : payable.dueAt < isoToday() ? 'Vencida' : 'Em aberto'}</span></td><td><div class="inline-actions"><button class="more-button" data-action="edit-payable" data-id="${esc(payable.id)}" aria-label="Editar conta">✎</button><button class="more-button" data-action="toggle-payable" data-id="${esc(payable.id)}" title="${payable.paid ? 'Reabrir' : 'Marcar como paga'}">${payable.paid ? '↶' : '✓'}</button></div></td></tr>`).join('') : '<tr><td colspan="7"><div class="table-empty">Nenhuma conta encontrada.</div></td></tr>'}</tbody>`; }
function payableMobile(list) { return list.map(payable => `<article class="mobile-card"><div class="mobile-card-top"><div><strong>${esc(payable.description)}</strong><small>${esc(payable.supplier)} · vence ${formatDate(payable.dueAt)}</small></div><button class="more-button" data-action="toggle-payable" data-id="${esc(payable.id)}" aria-label="${payable.paid ? 'Reabrir conta' : 'Marcar conta como paga'}">${payable.paid ? '↶' : '✓'}</button></div><div class="mobile-card-bottom"><span class="status ${payable.paid ? 'paid' : payable.dueAt < isoToday() ? 'overdue' : 'waiting'}">${payable.paid ? 'Paga' : payable.dueAt < isoToday() ? 'Vencida' : 'Em aberto'}</span><strong class="money">${brl.format(payable.amount)}</strong></div></article>`).join(''); }

function tableShell(type, options, rows, mobile, total = 0) {
  return `<section class="table-card"><div class="table-toolbar toolbar filter-bar"><label class="filter-search search-box"><span aria-hidden="true">⌕</span><input data-filter-query="${esc(type)}" placeholder="Buscar por nome, código ou descrição..." aria-label="Buscar registros"></label><div class="filter-group"><span class="result-count" data-result-count="${esc(type)}">${total} registros</span><select data-filter-select="${esc(type)}" aria-label="Filtrar registros">${options}</select></div></div><table class="data-table" data-table="${esc(type)}">${rows}</table><div class="mobile-cards" data-mobile="${esc(type)}">${mobile || '<div class="table-empty">Nenhum registro encontrado.</div>'}</div></section>`;
}
function bindTableFilter(type) {
  const input = document.querySelector(`[data-filter-query="${type}"]`);
  const select = document.querySelector(`[data-filter-select="${type}"]`);
  if (!input || !select) return;
  const update = () => {
    const q = normalize(input.value.trim());
    const f = select.value;
    let list = state[type].filter(item => normalize(Object.values(item).join(' ')).includes(q));
    if (f) {
      if (type === 'products') list = list.filter(product => f === '__low__' ? product.stock <= product.minimum : product.category === f);
      if (type === 'services') list = list.filter(service => f === 'inactive' ? !service.active : service.pricing === f);
      if (type === 'orders') list = list.filter(order => f === 'overdue' ? order.dueAt < isoToday() && !['delivered', 'cancelled'].includes(order.status) : order.status === f);
      if (type === 'payables') list = list.filter(payable => f === 'paid' ? payable.paid : f === 'overdue' ? !payable.paid && payable.dueAt < isoToday() : f === 'soon' ? !payable.paid && payable.dueAt >= isoToday() && payable.dueAt <= offsetDate(7) : !payable.paid);
      if (type === 'customers') list = list.filter(customer => f === 'inactive' ? customer.active === false : f === 'recurring' ? customerOrders(customer).length + customerSales(customer).length > 1 : customerOrders(customer).some(order => !['delivered', 'cancelled'].includes(order.status)));
    }
    const renderers = { products:[productRows,productMobile], services:[serviceRows,serviceMobile], orders:[orderRows,orderMobile], payables:[payableRows,payableMobile], customers:[customerRows,customerMobile] }[type];
    document.querySelector(`[data-table="${type}"]`).innerHTML = renderers[0](list);
    document.querySelector(`[data-mobile="${type}"]`).innerHTML = renderers[1](list) || '<div class="table-empty">Nenhum resultado.</div>';
    const count = document.querySelector(`[data-result-count="${type}"]`);
    if (count) count.textContent = `${list.length} ${list.length === 1 ? 'registro' : 'registros'}`;
  };
  input.addEventListener('input', update); select.addEventListener('change', update);
}

function renderSales() {
  const today = isoToday();
  const todaySales = state.sales.filter(sale => String(sale.createdAt).slice(0, 10) === today && sale.status !== 'cancelled');
  const monthSales = state.sales.filter(sale => String(sale.createdAt).slice(0, 7) === today.slice(0, 7) && sale.status !== 'cancelled');
  const products = state.products.filter(product => normalize(`${product.name} ${product.sku} ${product.category}`).includes(normalize(salesQuery)));
  const activeCustomers = state.customers.filter(customer => customer.active !== false);
  content.innerHTML = `${pageHeading('COMERCIAL', 'Vendas e caixa', 'Venda produtos, acompanhe o caixa e mantenha o estoque sincronizado.')}
    <div class="summary-strip insight-grid">${statCard('VENDAS DE HOJE', brl.format(sum(todaySales, 'total')), '↗', `${todaySales.length} ${todaySales.length === 1 ? 'atendimento' : 'atendimentos'}`, true)}${statCard('FATURAMENTO NO MÊS', brl.format(sum(monthSales, 'total')), '◈', `${monthSales.length} vendas concluídas`)}${statCard('TÍQUETE MÉDIO', monthSales.length ? brl.format(sum(monthSales, 'total') / monthSales.length) : brl.format(0), '⌁', 'Média por venda no mês')}${statCard('PRODUTOS VENDIDOS', monthSales.reduce((total, sale) => total + sale.items.reduce((quantity, item) => quantity + item.quantity, 0), 0), '◇', 'Unidades vendidas no mês')}</div>
    <div class="pos-layout">
      <section class="card pos-catalog"><header class="card-header"><div><p class="eyebrow">PONTO DE VENDA</p><h2>Escolha os produtos</h2></div><span class="result-count">${products.length} itens</span></header>
        <div class="pos-search"><label class="filter-search search-box"><span aria-hidden="true">⌕</span><input id="pos-search" value="${esc(salesQuery)}" placeholder="Buscar por produto, SKU ou categoria" aria-label="Buscar produto para venda"></label></div>
        <div class="pos-products">${products.length ? products.map(product => {
          const reserved = cart.items.find(item => item.productId === product.id)?.quantity || 0;
          const available = Number(product.stock) - reserved;
          return `<button class="pos-product product-card ${available <= 0 ? 'is-unavailable' : ''}" data-action="add-cart-product" data-id="${esc(product.id)}" ${available <= 0 ? 'disabled' : ''}><span class="product-thumb">${esc(product.name?.[0] || 'P')}</span><span class="pos-product-copy"><strong>${esc(product.name)}</strong><small>${esc(product.category)} · ${available} disponíveis</small></span><strong class="money">${brl.format(product.price)}</strong><span class="pos-add" aria-hidden="true">＋</span></button>`;
        }).join('') : emptyState('Nenhum produto encontrado', 'Experimente buscar por outro nome, código ou categoria.')}</div>
      </section>
      <aside class="card pos-cart"><header class="card-header"><div><p class="eyebrow">CAIXA</p><h2>Venda atual</h2></div>${cart.items.length ? '<button class="text-button" data-action="clear-cart">Limpar</button>' : ''}</header>
        <div class="pos-cart-content">${cart.items.length ? cart.items.map(item => `<div class="cart-item"><div class="cart-item-info"><strong>${esc(item.name)}</strong><small>${brl.format(item.unitPrice)} cada</small></div><div class="cart-item-actions"><button class="icon-action" data-action="cart-decrease" data-id="${esc(item.productId)}" aria-label="Diminuir quantidade">−</button><strong>${item.quantity}</strong><button class="icon-action" data-action="cart-increase" data-id="${esc(item.productId)}" aria-label="Aumentar quantidade">＋</button></div><strong class="money">${brl.format(item.quantity * item.unitPrice)}</strong></div>`).join('') : emptyState('Sua venda começa aqui', 'Escolha produtos ao lado para adicionar ao carrinho.')}
          ${cart.items.length ? `<div class="cart-fields"><div class="field"><label for="sale-customer">CLIENTE</label><select id="sale-customer" data-action="sale-customer"><option value="">Cliente de balcão</option>${activeCustomers.map(customer => `<option value="${esc(customer.id)}" ${customer.id === cart.customerId ? 'selected' : ''}>${esc(customer.name)}</option>`).join('')}</select></div><div class="field"><label for="sale-payment">FORMA DE PAGAMENTO</label><select id="sale-payment" data-action="sale-payment">${Object.entries(PAYMENT_LABELS).map(([value, label]) => `<option value="${value}" ${value === cart.payment ? 'selected' : ''}>${label}</option>`).join('')}</select></div><div class="field"><label for="sale-discount">DESCONTO (R$)</label><input id="sale-discount" data-action="sale-discount" type="number" min="0" step="0.01" value="${cart.discount || ''}" placeholder="0,00"></div></div>
          <div class="cart-summary"><div><span>Subtotal</span><strong>${brl.format(cartSubtotal())}</strong></div><div><span>Desconto</span><strong>− ${brl.format(Math.min(Number(cart.discount || 0), cartSubtotal()))}</strong></div><div class="cart-total"><span>Total a receber</span><strong>${brl.format(cartTotal())}</strong></div></div><button class="primary-button pos-checkout" data-action="complete-sale">✓ Finalizar venda</button>` : ''}
        </div>
      </aside>
    </div>
    <section class="card sale-history"><header class="card-header"><div><p class="eyebrow">MOVIMENTO</p><h2>Últimas vendas</h2></div><button class="text-button" data-action="export-sales">Exportar CSV ↓</button></header>
      ${state.sales.length ? `<table class="data-table"><thead><tr><th>VENDA</th><th>CLIENTE</th><th>ITENS</th><th>PAGAMENTO</th><th>DATA</th><th>TOTAL</th><th><span class="sr-only">Ações</span></th></tr></thead><tbody>${state.sales.slice(0, 12).map(sale => `<tr><td><strong>${esc(sale.id.toUpperCase())}</strong></td><td>${esc(sale.customer || 'Cliente de balcão')}</td><td>${sale.items.reduce((total, item) => total + item.quantity, 0)} un.</td><td>${esc(PAYMENT_LABELS[sale.payment] || sale.payment)}</td><td>${formatDateTime(sale.createdAt)}</td><td class="money">${brl.format(sale.total)}</td><td><button class="more-button" data-action="view-sale" data-id="${esc(sale.id)}">•••</button></td></tr>`).join('')}</tbody></table><div class="mobile-cards">${state.sales.slice(0, 12).map(sale => `<article class="mobile-card"><div class="mobile-card-top"><div><strong>${esc(sale.customer || 'Cliente de balcão')}</strong><small>${esc(sale.id.toUpperCase())} · ${formatDateTime(sale.createdAt)}</small></div><button class="more-button" data-action="view-sale" data-id="${esc(sale.id)}">•••</button></div><div class="mobile-card-bottom"><span>${esc(PAYMENT_LABELS[sale.payment] || sale.payment)}</span><strong class="money">${brl.format(sale.total)}</strong></div></article>`).join('')}</div>` : emptyState('Nenhuma venda registrada', 'Finalize uma venda para acompanhar o histórico do caixa.')}
    </section>`;

  associateFormLabels(content);
  document.querySelector('#pos-search')?.addEventListener('input', event => {
    salesQuery = event.target.value;
    const position = event.target.selectionStart;
    renderSales();
    const search = document.querySelector('#pos-search');
    search?.focus();
    search?.setSelectionRange(position, position);
  });
}

function cartSubtotal() { return cart.items.reduce((total, item) => total + item.quantity * item.unitPrice, 0); }
function cartTotal() { return Math.max(0, cartSubtotal() - Math.min(Number(cart.discount || 0), cartSubtotal())); }
function updateCartSummary() {
  const rows = document.querySelectorAll('.pos-cart .cart-summary > div');
  if (rows.length < 3) return;
  rows[0].querySelector('strong').textContent = brl.format(cartSubtotal());
  rows[1].querySelector('strong').textContent = `− ${brl.format(Math.min(Number(cart.discount || 0), cartSubtotal()))}`;
  rows[2].querySelector('strong').textContent = brl.format(cartTotal());
}

function addCartProduct(id, quantity = 1) {
  const product = state.products.find(item => item.id === id);
  if (!product) return toast('Produto não encontrado.', 'error');
  const existing = cart.items.find(item => item.productId === id);
  const nextQuantity = (existing?.quantity || 0) + quantity;
  if (nextQuantity > Number(product.stock)) return toast(`Apenas ${product.stock} unidades disponíveis em estoque.`, 'error');
  if (nextQuantity <= 0) cart.items = cart.items.filter(item => item.productId !== id);
  else if (existing) existing.quantity = nextQuantity;
  else cart.items.push({ productId: product.id, name: product.name, sku: product.sku, quantity: 1, unitPrice: Number(product.price), cost: Number(product.cost || 0) });
  renderSales();
}

function completeSale() {
  if (!cart.items.length) return toast('Adicione pelo menos um produto antes de finalizar.', 'error');
  for (const item of cart.items) {
    const product = state.products.find(entry => entry.id === item.productId);
    if (!product || Number(product.stock) < item.quantity) return toast(`Estoque insuficiente para ${item.name}.`, 'error');
  }

  const customer = state.customers.find(entry => entry.id === cart.customerId);
  const sale = {
    id: uid('v'),
    customerId: customer?.id || '',
    customer: customer?.name || 'Cliente de balcão',
    items: cart.items.map(item => ({ ...item })),
    subtotal: cartSubtotal(),
    discount: Math.min(Number(cart.discount || 0), cartSubtotal()),
    total: cartTotal(),
    payment: cart.payment,
    status: 'paid',
    createdAt: new Date().toISOString()
  };

  for (const item of sale.items) {
    const product = state.products.find(entry => entry.id === item.productId);
    product.stock -= item.quantity;
    state.stockMovements.unshift({ id: uid('mov'), productId: product.id, productName: product.name, type: 'out', quantity: item.quantity, reason: `Venda ${sale.id.toUpperCase()}`, createdAt: sale.createdAt });
  }

  state.sales.unshift(sale);
  state.stockMovements = state.stockMovements.slice(0, 200);
  recordActivity('sale', `Venda ${sale.id.toUpperCase()} concluída · ${brl.format(sale.total)}`);
  cart = { items: [], customerId: '', payment: 'pix', discount: 0 };
  saveState();
  renderSales();
  toast(`Venda concluída: ${brl.format(sale.total)} via ${PAYMENT_LABELS[sale.payment]}.`);
}

function viewSale(sale) {
  if (!sale) return;
  openModal(sale.id.toUpperCase(), 'COMPROVANTE DE VENDA', `<div class="receipt"><div class="detail-grid"><div class="field"><label>CLIENTE</label><strong>${esc(sale.customer)}</strong></div><div class="field"><label>DATA E HORA</label><strong>${formatDateTime(sale.createdAt)}</strong></div><div class="field"><label>PAGAMENTO</label><strong>${esc(PAYMENT_LABELS[sale.payment] || sale.payment)}</strong></div><div class="field"><label>STATUS</label><span class="status paid">Pagamento confirmado</span></div></div><div class="detail-section"><h3>Itens da venda</h3>${sale.items.map(item => `<div class="cart-item"><div class="cart-item-info"><strong>${esc(item.name)}</strong><small>${item.quantity} × ${brl.format(item.unitPrice)}</small></div><strong class="money">${brl.format(item.quantity * item.unitPrice)}</strong></div>`).join('')}</div><div class="cart-summary"><div><span>Subtotal</span><strong>${brl.format(sale.subtotal)}</strong></div><div><span>Desconto</span><strong>− ${brl.format(sale.discount)}</strong></div><div class="cart-total"><span>Total pago</span><strong>${brl.format(sale.total)}</strong></div></div><div class="form-actions"><button class="ghost-button" data-action="close-modal">Fechar</button></div></div>`);
}

function agendaEvents(date) {
  const scheduled = state.appointments.filter(appointment => appointment.date === date).map(appointment => ({
    id: appointment.id,
    title: appointment.title,
    subtitle: appointment.customer || APPOINTMENT_LABELS[appointment.type] || 'Compromisso',
    time: appointment.time || '09:00',
    type: appointment.type,
    status: appointment.status || 'scheduled',
    editable: true,
    duration: appointment.duration || 30
  }));
  const deliveries = state.orders.filter(order => order.dueAt === date && !['delivered', 'cancelled'].includes(order.status)).map(order => ({
    id: order.id,
    title: `Entrega prevista · ${order.device}`,
    subtitle: `${order.customer} · ${order.id}`,
    time: state.settings.closingTime || '18:00',
    type: 'delivery',
    status: order.status,
    orderId: order.id
  }));
  const reminders = state.orders.filter(order => order.reminder && String(order.reminderAt).slice(0, 10) === date).map(order => ({
    id: `reminder-${order.id}`,
    title: order.reminder,
    subtitle: `${order.customer} · ${order.id}`,
    time: String(order.reminderAt).slice(11, 16) || '09:00',
    type: 'reminder',
    status: 'scheduled',
    orderId: order.id
  }));
  const payables = state.payables.filter(payable => !payable.paid && payable.dueAt === date).map(payable => ({
    id: `payable-${payable.id}`,
    title: `Pagar · ${payable.description}`,
    subtitle: `${payable.supplier} · ${brl.format(payable.amount)}`,
    time: '12:00',
    type: 'payment',
    status: 'waiting',
    payableId: payable.id
  }));
  return [...scheduled, ...deliveries, ...reminders, ...payables].sort((a, b) => a.time.localeCompare(b.time));
}

function renderAgenda() {
  const firstDay = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), 1);
  const firstWeekday = firstDay.getDay();
  const totalDays = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 0).getDate();
  const calendarStart = new Date(firstDay);
  calendarStart.setDate(firstDay.getDate() - firstWeekday);
  const cells = Math.ceil((firstWeekday + totalDays) / 7) * 7;
  const monthLabel = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(calendarMonth);
  const selectedLabel = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' }).format(new Date(`${selectedAgendaDate}T12:00:00`));
  const events = agendaEvents(selectedAgendaDate);
  const monthPrefix = localDate(firstDay).slice(0, 7);
  const monthAppointments = state.appointments.filter(appointment => appointment.date?.startsWith(monthPrefix) && appointment.status !== 'cancelled');
  const monthDeliveries = state.orders.filter(order => order.dueAt?.startsWith(monthPrefix) && !['delivered', 'cancelled'].includes(order.status));

  let days = '';
  for (let index = 0; index < cells; index++) {
    const date = new Date(calendarStart);
    date.setDate(calendarStart.getDate() + index);
    const key = localDate(date);
    const dayEvents = agendaEvents(key);
    const classes = ['calendar-day', date.getMonth() === calendarMonth.getMonth() ? '' : 'is-outside', key === isoToday() ? 'is-today' : '', key === selectedAgendaDate ? 'is-selected' : ''].filter(Boolean).join(' ');
    days += `<button class="${classes}" data-action="calendar-select" data-date="${key}" aria-label="${date.toLocaleDateString('pt-BR')} · ${dayEvents.length} compromissos" ${key === selectedAgendaDate ? 'aria-current="date"' : ''}><span class="calendar-day-number">${date.getDate()}</span>${dayEvents.length ? `<span class="calendar-day-events">${dayEvents.slice(0, 3).map(event => `<i class="calendar-event-dot event-${esc(event.type)}"></i>`).join('')}${dayEvents.length > 3 ? `<small>+${dayEvents.length - 3}</small>` : ''}</span>` : ''}</button>`;
  }

  content.innerHTML = `${pageHeading('ORGANIZAÇÃO', 'Agenda', 'Acompanhe atendimentos, entregas, lembretes e vencimentos.', '<button class="ghost-button" data-action="calendar-today">Hoje</button><button class="primary-button" data-action="new-appointment">＋ Novo compromisso</button>')}
    <div class="summary-strip insight-grid">${statCard('COMPROMISSOS NO MÊS', monthAppointments.length, '◷', `${monthAppointments.filter(item => item.status === 'done').length} concluídos`)}${statCard('ENTREGAS PREVISTAS', monthDeliveries.length, '▤', 'Ordens com entrega neste mês')}${statCard('HOJE', agendaEvents(isoToday()).length, '⌁', 'Eventos e tarefas na agenda')}${statCard('HORÁRIO DE ATENDIMENTO', `${state.settings.openingTime} – ${state.settings.closingTime}`, '◷', 'Configurável em ajustes')}</div>
    <div class="agenda-layout"><section class="card calendar-card"><header class="card-header calendar-header"><div><p class="eyebrow">CALENDÁRIO</p><h2>${esc(monthLabel[0].toUpperCase() + monthLabel.slice(1))}</h2></div><div class="calendar-controls"><button class="icon-button" data-action="calendar-prev" aria-label="Mês anterior">‹</button><button class="icon-button" data-action="calendar-next" aria-label="Próximo mês">›</button></div></header><div class="calendar-grid" role="grid"><span class="calendar-weekday">DOM</span><span class="calendar-weekday">SEG</span><span class="calendar-weekday">TER</span><span class="calendar-weekday">QUA</span><span class="calendar-weekday">QUI</span><span class="calendar-weekday">SEX</span><span class="calendar-weekday">SÁB</span>${days}</div><div class="calendar-legend"><span><i class="calendar-event-dot event-repair"></i> Atendimento</span><span><i class="calendar-event-dot event-delivery"></i> Entrega</span><span><i class="calendar-event-dot event-reminder"></i> Lembrete</span><span><i class="calendar-event-dot event-payment"></i> Pagamento</span></div></section>
    <section class="card agenda-panel"><header class="card-header"><div><p class="eyebrow">${selectedAgendaDate === isoToday() ? 'HOJE' : 'DIA SELECIONADO'}</p><h2>${esc(selectedLabel[0].toUpperCase() + selectedLabel.slice(1))}</h2></div><button class="text-button" data-action="new-appointment">＋ Agendar</button></header><div class="agenda-list">${events.length ? events.map(event => `<article class="agenda-item event-${esc(event.type)} ${event.status === 'done' ? 'is-done' : ''}"><div class="agenda-time">${esc(event.time)}</div><div class="agenda-item-content"><strong>${esc(event.title)}</strong><small>${esc(event.subtitle)}</small>${event.editable ? `<span class="status ${event.status === 'done' ? 'paid' : event.status === 'cancelled' ? 'overdue' : 'analysis'}">${event.status === 'done' ? 'Concluído' : event.status === 'cancelled' ? 'Cancelado' : 'Agendado'}</span>` : ''}</div><div class="agenda-item-actions">${event.editable ? `<button class="more-button" data-action="edit-appointment" data-id="${esc(event.id)}" aria-label="Editar compromisso">✎</button>${event.status !== 'done' ? `<button class="more-button" data-action="complete-appointment" data-id="${esc(event.id)}" aria-label="Concluir compromisso">✓</button>` : ''}` : event.orderId ? `<button class="more-button" data-action="view-order" data-id="${esc(event.orderId)}" aria-label="Ver ordem">→</button>` : ''}</div></article>`).join('') : emptyState('Agenda livre neste dia', 'Cadastre um compromisso ou selecione outra data.', '<button class="ghost-button" data-action="new-appointment">Agendar atendimento</button>')}</div></section></div>`;
}

function appointmentModal(appointment = {}) {
  const customers = state.customers.filter(customer => customer.active !== false);
  openModal(appointment.id ? 'Editar compromisso' : 'Novo compromisso', 'AGENDA', `<form id="appointment-form" class="form-grid"><div class="field full"><label>TÍTULO *</label><input name="title" required value="${esc(appointment.title)}" placeholder="Ex.: Avaliação de aparelho ou retirada"></div><div class="field"><label>TIPO *</label><select name="type">${Object.entries(APPOINTMENT_LABELS).map(([value, label]) => `<option value="${value}" ${appointment.type === value ? 'selected' : ''}>${label}</option>`).join('')}</select></div><div class="field"><label>CLIENTE</label><select name="customerId"><option value="">Sem cliente vinculado</option>${customers.map(customer => `<option value="${esc(customer.id)}" ${appointment.customerId === customer.id ? 'selected' : ''}>${esc(customer.name)}</option>`).join('')}</select></div><div class="field"><label>DATA *</label><input name="date" type="date" required value="${esc(appointment.date || selectedAgendaDate)}"></div><div class="field"><label>HORÁRIO *</label><input name="time" type="time" required value="${esc(appointment.time || state.settings.openingTime || '09:00')}"></div><div class="field"><label>DURAÇÃO (MINUTOS)</label><input name="duration" type="number" min="5" step="5" value="${Number(appointment.duration || 30)}"></div><div class="field"><label>STATUS</label><select name="status"><option value="scheduled" ${appointment.status !== 'done' && appointment.status !== 'cancelled' ? 'selected' : ''}>Agendado</option><option value="done" ${appointment.status === 'done' ? 'selected' : ''}>Concluído</option><option value="cancelled" ${appointment.status === 'cancelled' ? 'selected' : ''}>Cancelado</option></select></div><div class="field full"><label>OBSERVAÇÕES</label><textarea name="notes" placeholder="Informações importantes para o atendimento...">${esc(appointment.notes)}</textarea></div>${formActions(appointment.id ? 'Salvar alterações' : 'Agendar compromisso')}</form>`);
  document.querySelector('#appointment-form').addEventListener('submit', event => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.target));
    const customer = state.customers.find(entry => entry.id === data.customerId);
    const record = { id: appointment.id || uid('ag'), title: data.title.trim(), type: data.type, customerId: customer?.id || '', customer: customer?.name || '', date: data.date, time: data.time, duration: Number(data.duration || 30), status: data.status, notes: data.notes.trim(), createdAt: appointment.createdAt || new Date().toISOString() };
    if (appointment.id) state.appointments = state.appointments.map(item => item.id === appointment.id ? record : item);
    else state.appointments.push(record);
    selectedAgendaDate = record.date;
    calendarMonth = new Date(`${record.date.slice(0, 7)}-01T12:00:00`);
    recordActivity('appointment', `${appointment.id ? 'Atualizado' : 'Agendado'}: ${record.title}`);
    saveState();
    closeModal();
    navigate('agenda');
    toast(appointment.id ? 'Compromisso atualizado.' : 'Compromisso agendado.');
  });
}

function withinPeriod(value, days = reportPeriod) {
  if (!value || !days) return Boolean(value);
  const key = String(value).slice(0, 10);
  return key >= offsetDate(-(days - 1)) && key <= isoToday();
}

function reportData() {
  const sales = state.sales.filter(sale => sale.status !== 'cancelled' && withinPeriod(sale.createdAt));
  const orders = state.orders.filter(order => withinPeriod(order.createdAt));
  const delivered = state.orders.filter(order => order.status === 'delivered' && withinPeriod(order.deliveredAt || order.createdAt));
  const paidPayables = state.payables.filter(payable => payable.paid && withinPeriod(payable.paidAt || payable.dueAt));
  const salesRevenue = sum(sales, 'total');
  const serviceRevenue = sum(delivered, 'value');
  const costOfSales = sales.reduce((total, sale) => total + sale.items.reduce((cost, item) => cost + Number(item.cost || 0) * item.quantity, 0), 0);
  const expenses = sum(paidPayables);
  const revenue = salesRevenue + serviceRevenue;
  return { sales, orders, delivered, paidPayables, salesRevenue, serviceRevenue, costOfSales, expenses, revenue, grossProfit: revenue - costOfSales - expenses };
}

function renderReports() {
  const data = reportData();
  const periodLabel = reportPeriod ? `Últimos ${reportPeriod} dias` : 'Todo o histórico';
  const openReceivables = state.orders.filter(order => !['delivered', 'cancelled'].includes(order.status) && order.value != null);
  const margin = data.revenue ? Math.round((data.grossProfit / data.revenue) * 100) : 0;
  const chartDays = reportPeriod && reportPeriod <= 7 ? 7 : 14;
  const buckets = Array.from({ length: chartDays }, (_, index) => {
    const date = offsetDate(index - chartDays + 1);
    const productSales = sum(data.sales.filter(sale => String(sale.createdAt).slice(0, 10) === date), 'total');
    const serviceSales = sum(data.delivered.filter(order => String(order.deliveredAt || order.createdAt).slice(0, 10) === date), 'value');
    return { date, total: productSales + serviceSales };
  });
  const maxBucket = Math.max(...buckets.map(bucket => bucket.total), 1);
  const paymentTotals = Object.entries(PAYMENT_LABELS).map(([key, label]) => ({ label, amount: sum(data.sales.filter(sale => sale.payment === key), 'total'), count: data.sales.filter(sale => sale.payment === key).length })).filter(item => item.count);
  const services = state.services.map(service => ({ name: service.name, count: data.orders.filter(order => order.serviceId === service.id).length, value: sum(data.orders.filter(order => order.serviceId === service.id && order.status !== 'cancelled'), 'value') })).filter(service => service.count).sort((a, b) => b.value - a.value).slice(0, 5);
  const categories = [...new Set(state.products.map(product => product.category))].map(category => {
    const matching = data.sales.flatMap(sale => sale.items).filter(item => state.products.find(product => product.id === item.productId)?.category === category);
    return { label: category, amount: matching.reduce((total, item) => total + item.quantity * item.unitPrice, 0), count: matching.reduce((total, item) => total + item.quantity, 0) };
  }).filter(item => item.amount).sort((a, b) => b.amount - a.amount).slice(0, 5);
  const expenseCategories = [...new Set(data.paidPayables.map(payable => payable.category))].map(category => ({ label: category, amount: sum(data.paidPayables.filter(payable => payable.category === category)), count: data.paidPayables.filter(payable => payable.category === category).length })).sort((a, b) => b.amount - a.amount);

  content.innerHTML = `${pageHeading('INTELIGÊNCIA DO NEGÓCIO', 'Relatórios e resultados', 'Entenda o desempenho da loja com dados reais da operação.', '<button class="ghost-button" data-action="export-report">↓ Exportar relatório</button>')}
    <div class="report-toolbar"><div class="segmented-control" role="group" aria-label="Período do relatório"><button class="segment ${reportPeriod === 7 ? 'active' : ''}" data-action="report-period" data-days="7">7 dias</button><button class="segment ${reportPeriod === 30 ? 'active' : ''}" data-action="report-period" data-days="30">30 dias</button><button class="segment ${reportPeriod === 90 ? 'active' : ''}" data-action="report-period" data-days="90">90 dias</button><button class="segment ${reportPeriod === 0 ? 'active' : ''}" data-action="report-period" data-days="0">Tudo</button></div><span class="result-count">${esc(periodLabel)} · atualizado agora</span></div>
    <div class="stats-grid">${statCard('FATURAMENTO TOTAL', brl.format(data.revenue), '↗', `${data.sales.length} vendas · ${data.delivered.length} ordens entregues`, true)}${statCard('RESULTADO LÍQUIDO', brl.format(data.grossProfit), '◈', `${margin}% de margem após custos e despesas`)}${statCard('A RECEBER', brl.format(sum(openReceivables, 'value')), '⌁', `${openReceivables.length} ordens com valor definido`)}${statCard('DESPESAS PAGAS', brl.format(data.expenses), '↘', `${data.paidPayables.length} pagamentos no período`)}</div>
    <div class="reports-grid"><section class="card report-chart"><header class="card-header"><div><p class="eyebrow">EVOLUÇÃO</p><h2>Faturamento diário</h2></div><strong class="money">${brl.format(buckets.reduce((total, bucket) => total + bucket.total, 0))}</strong></header><div class="chart-bars">${buckets.map(bucket => `<div class="chart-bar" title="${formatDate(bucket.date)}: ${brl.format(bucket.total)}"><span class="chart-bar-value">${bucket.total ? brl.format(bucket.total) : ''}</span><div class="chart-bar-track"><i class="chart-bar-fill" style="height:${bucket.total ? Math.max(Math.round(bucket.total / maxBucket * 100), 5) : 2}%"></i></div><small>${String(bucket.date).slice(8)}</small></div>`).join('')}</div><div class="chart-caption">Vendas de produtos e ordens entregues nos últimos ${chartDays} dias.</div></section>
    <section class="card report-summary"><header class="card-header"><div><p class="eyebrow">RESULTADO</p><h2>Composição financeira</h2></div></header><div class="report-breakdown"><div class="breakdown-row"><span>Vendas de produtos</span><strong>${brl.format(data.salesRevenue)}</strong></div><div class="breakdown-row"><span>Serviços entregues</span><strong>${brl.format(data.serviceRevenue)}</strong></div><div class="breakdown-row is-negative"><span>Custo dos produtos vendidos</span><strong>− ${brl.format(data.costOfSales)}</strong></div><div class="breakdown-row is-negative"><span>Despesas pagas</span><strong>− ${brl.format(data.expenses)}</strong></div><div class="breakdown-row is-total"><span>Resultado líquido</span><strong>${brl.format(data.grossProfit)}</strong></div></div></section>
    <section class="card report-section"><header class="card-header"><div><p class="eyebrow">PAGAMENTOS</p><h2>Como seus clientes pagam</h2></div></header>${renderBreakdown(paymentTotals, data.salesRevenue, 'Nenhuma venda no período', 'As formas de pagamento aparecerão após as primeiras vendas.')}</section>
    <section class="card report-section"><header class="card-header"><div><p class="eyebrow">ASSISTÊNCIA</p><h2>Serviços mais procurados</h2></div></header>${renderBreakdown(services.map(service => ({ label: service.name, amount: service.value, count: service.count })), Math.max(...services.map(service => service.value), 1), 'Nenhuma ordem no período', 'As ordens de serviço alimentarão este ranking.')}</section>
    <section class="card report-section"><header class="card-header"><div><p class="eyebrow">PRODUTOS</p><h2>Categorias mais vendidas</h2></div></header>${renderBreakdown(categories, Math.max(...categories.map(category => category.amount), 1), 'Nenhum produto vendido', 'As vendas do caixa alimentarão este indicador.')}</section>
    <section class="card report-section"><header class="card-header"><div><p class="eyebrow">DESPESAS</p><h2>Para onde vai o dinheiro</h2></div></header>${renderBreakdown(expenseCategories, data.expenses, 'Nenhuma despesa paga', 'Marque contas como pagas para acompanhar os custos.')}</section></div>`;
}

function renderBreakdown(entries, max, title, description) {
  if (!entries.length) return emptyState(title, description);
  return `<div class="report-breakdown">${entries.map(entry => `<div class="breakdown-item"><div class="breakdown-row"><span>${esc(entry.label)} <small>· ${entry.count}</small></span><strong>${brl.format(entry.amount)}</strong></div><div class="breakdown-bar progress-bar"><i style="width:${Math.min(Math.round(entry.amount / Math.max(max, 1) * 100), 100)}%"></i></div></div>`).join('')}</div>`;
}

function settingsPanelAttributes(id) {
  return `role="tabpanel" aria-labelledby="settings-tab-${id}" tabindex="0"${activeSettingsTab === id ? '' : ' hidden'}`;
}

function activateSettingsTab(tab, { focus = false } = {}) {
  if (!SETTINGS_TABS.some(item => item.id === tab)) return false;
  activeSettingsTab = tab;
  SETTINGS_TABS.forEach(item => {
    const button = document.querySelector(`#settings-tab-${item.id}`);
    const panel = document.querySelector(`#${item.id}`);
    const selected = item.id === activeSettingsTab;
    if (button) {
      button.setAttribute('aria-selected', String(selected));
      button.setAttribute('tabindex', selected ? '0' : '-1');
      button.classList.toggle('active', selected);
    }
    if (panel) panel.hidden = !selected;
  });
  if (focus) document.querySelector(`#settings-tab-${activeSettingsTab}`)?.focus();
  return true;
}

function renderSettings() {
  const settings = state.settings;
  const storageAvailable = companyDocumentStorageAvailable();
  if (!SETTINGS_TABS.some(tab => tab.id === activeSettingsTab)) activeSettingsTab = 'empresa';
  content.innerHTML = `${pageHeading('ADMINISTRAÇÃO', 'Configurações', 'Atualize a identidade da empresa, seus documentos e a operação da loja.')}
    <div class="settings-layout settings-tabs-layout">
      <nav class="settings-tabs" role="tablist" aria-label="Seções de configurações">
        ${SETTINGS_TABS.map(tab => `<button id="settings-tab-${tab.id}" class="settings-tab ${activeSettingsTab === tab.id ? 'active' : ''}" type="button" role="tab" aria-selected="${activeSettingsTab === tab.id}" aria-controls="${tab.id}" tabindex="${activeSettingsTab === tab.id ? '0' : '-1'}" data-action="settings-tab" data-tab="${tab.id}"><span aria-hidden="true">${tab.icon}</span><span>${tab.label}</span></button>`).join('')}
      </nav>
      <form id="settings-form" class="settings-content settings-tab-content">
        <section id="empresa" class="card settings-section" ${settingsPanelAttributes('empresa')}>
          <header class="card-header"><div><p class="eyebrow">IDENTIDADE E CONTATO</p><h2>Dados da empresa</h2></div></header>
          <div class="settings-grid form-grid">
            <div class="field"><label>NOME DA EMPRESA *</label><input name="companyName" autocomplete="organization" required value="${esc(settings.companyName)}" placeholder="Ex.: Cellf"></div>
            <div class="field"><label>SLOGAN</label><input name="slogan" maxlength="100" value="${esc(settings.slogan)}" placeholder="Ex.: Reparo e Comércio"></div>
            <div class="field"><label>RAZÃO SOCIAL</label><input name="legalName" value="${esc(settings.legalName)}" placeholder="Nome empresarial completo"></div>
            <div class="field"><label>CNPJ</label><input id="company-cnpj" name="document" inputmode="numeric" maxlength="18" autocomplete="off" value="${esc(formatCnpj(settings.document))}" placeholder="00.000.000/0000-00" aria-describedby="company-cnpj-help"><small id="company-cnpj-help" class="field-help">Informe os 14 dígitos do cadastro da empresa.</small></div>
            <div class="field"><label>TELEFONE / WHATSAPP</label><input name="phone" autocomplete="tel" value="${esc(settings.phone)}" placeholder="(11) 99999-9999"></div>
            <div class="field"><label>E-MAIL DE CONTATO</label><input name="email" type="email" autocomplete="email" value="${esc(settings.email)}" placeholder="contato@cellf.com.br"></div>
            <div class="field full"><label>ENDEREÇO COMPLETO</label><input name="address" autocomplete="street-address" value="${esc(settings.address)}" placeholder="Rua, número, bairro e complemento"></div>
            <div class="field"><label>CIDADE / ESTADO</label><input name="city" autocomplete="address-level2" value="${esc(settings.city)}" placeholder="São Paulo / SP"></div>
            <div class="field"><label>CEP</label><input name="postalCode" autocomplete="postal-code" value="${esc(settings.postalCode)}" placeholder="00000-000"></div>
          </div>
        </section>
        <section id="responsavel" class="card settings-section" ${settingsPanelAttributes('responsavel')}>
          <header class="card-header"><div><p class="eyebrow">RESPONSÁVEL PELA OPERAÇÃO</p><h2>Administrador</h2></div></header>
          <div class="settings-grid form-grid"><div class="field"><label>NOME DO ADMINISTRADOR *</label><input name="managerName" autocomplete="name" required value="${esc(settings.managerName)}"></div><div class="field"><label>FUNÇÃO</label><input name="managerRole" value="${esc(settings.managerRole)}" placeholder="Administrador"></div></div>
        </section>
        <section id="documentos" class="card settings-section company-document-panel" ${settingsPanelAttributes('documentos')}>
          <header class="card-header"><div><p class="eyebrow">ARQUIVOS DA EMPRESA</p><h2>Documentos</h2></div><span id="company-document-count" class="document-badge">${state.companyDocuments.length} ${state.companyDocuments.length === 1 ? 'arquivo' : 'arquivos'}</span></header>
          <div class="settings-grid company-document-content">
            <div class="document-upload">
              <div class="field document-upload-field"><label for="company-document-name">NOME DO DOCUMENTO</label><input id="company-document-name" name="companyDocumentName" maxlength="120" placeholder="Ex.: Contrato social, CNPJ ou alvará"></div>
              <label class="document-upload-zone" for="company-document-file" id="company-document-dropzone"><span class="document-upload-icon" aria-hidden="true">↑</span><span><strong>Escolha um arquivo para anexar</strong><small>PDF, imagens, Word, Excel, TXT ou CSV · até 10 MB</small></span><input id="company-document-file" name="companyDocumentFile" class="document-file-input" type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx,.xls,.xlsx,.txt,.csv" ${storageAvailable ? '' : 'disabled'} aria-describedby="company-document-status"></label>
              <div id="company-document-status" class="document-file-status" role="status" aria-live="polite">${storageAvailable ? 'Nenhum arquivo selecionado.' : 'Conecte-se ao Supabase para enviar documentos.'}</div>
              <button type="button" class="primary-button document-upload-button" id="company-document-upload-button" data-action="upload-company-document" ${storageAvailable ? '' : 'disabled'}>＋ Anexar documento</button>
            </div>
            <div id="company-document-list" class="document-list" aria-label="Documentos anexados"></div>
            <div class="company-privacy-note"><span aria-hidden="true">ⓘ</span><p>Os documentos são enviados diretamente para o armazenamento privado do Supabase. Os downloads utilizam links temporários e protegidos, sem manter arquivos no dispositivo.</p></div>
          </div>
        </section>
        <section id="operacao" class="card settings-section" ${settingsPanelAttributes('operacao')}><header class="card-header"><div><p class="eyebrow">ASSISTÊNCIA TÉCNICA</p><h2>Operação e prazos</h2></div></header><div class="settings-grid form-grid"><div class="field"><label>ABERTURA</label><input name="openingTime" type="time" value="${esc(settings.openingTime)}"></div><div class="field"><label>FECHAMENTO</label><input name="closingTime" type="time" value="${esc(settings.closingTime)}"></div><div class="field"><label>GARANTIA PADRÃO (DIAS)</label><input name="warrantyDays" type="number" min="0" max="3650" value="${Number(settings.warrantyDays || 0)}"></div><div class="field"><label>PRAZO PADRÃO DE ENTREGA (DIAS)</label><input name="defaultDeadlineDays" type="number" min="0" max="365" value="${Number(settings.defaultDeadlineDays || 0)}"></div><div class="field full"><label>OBSERVAÇÕES PADRÃO DA ORDEM</label><textarea name="orderNotes">${esc(settings.orderNotes)}</textarea></div></div></section>
        <section id="avisos" class="card settings-section" ${settingsPanelAttributes('avisos')}><header class="card-header"><div><p class="eyebrow">ATENÇÃO</p><h2>Avisos e lembretes</h2></div></header><div class="settings-grid settings-toggles"><label class="settings-toggle"><span><strong>Estoque baixo</strong><small>Destacar produtos abaixo da quantidade mínima.</small></span><input name="lowStockAlert" type="checkbox" ${settings.lowStockAlert ? 'checked' : ''}></label><label class="settings-toggle"><span><strong>Prazos de entrega</strong><small>Avisar sobre ordens vencidas e próximas do prazo.</small></span><input name="dueDateAlert" type="checkbox" ${settings.dueDateAlert ? 'checked' : ''}></label><label class="settings-toggle"><span><strong>Compromissos da agenda</strong><small>Exibir compromissos e lembretes na central.</small></span><input name="appointmentAlert" type="checkbox" ${settings.appointmentAlert ? 'checked' : ''}></label></div></section>
        <section id="dados" class="card settings-section" ${settingsPanelAttributes('dados')}><header class="card-header"><div><p class="eyebrow">SEGURANÇA</p><h2>Dados e privacidade</h2></div></header><div class="settings-grid"><div class="settings-notice"><span aria-hidden="true">☁</span><div><strong>Dados protegidos no Supabase</strong><p>Todos os cadastros ficam salvos no banco de dados na nuvem. Os documentos permanecem em um espaço privado com acesso autenticado e links temporários.</p></div></div><div class="cloud-session-actions"><button type="button" class="ghost-button" data-action="export-backup">↓ Exportar dados da nuvem</button><button type="button" class="ghost-button cloud-session-button" data-action="logout">↪ Encerrar sessão segura</button></div></div></section>
        <div class="settings-actions company-savebar"><button class="primary-button" type="submit">✓ Salvar configurações</button></div>
      </form>
    </div>`;

  renderCompanyDocuments();
  const cnpjField = document.querySelector('#company-cnpj');
  cnpjField?.addEventListener('input', event => {
    event.target.value = formatCnpj(event.target.value);
    event.target.setCustomValidity('');
    event.target.removeAttribute('aria-invalid');
  });
  cnpjField?.addEventListener('blur', event => {
    const value = event.target.value.trim();
    if (value && !isValidCnpj(value)) event.target.setAttribute('aria-invalid', 'true');
    else event.target.removeAttribute('aria-invalid');
  });
  document.querySelector('#company-document-file')?.addEventListener('change', event => {
    const file = event.target.files?.[0];
    const status = document.querySelector('#company-document-status');
    if (!file) { if (status) status.textContent = 'Nenhum arquivo selecionado.'; return; }
    const validation = validateCompanyDocument(file);
    if (status) status.textContent = validation.valid ? `${file.name} · ${formatFileSize(file.size)}` : validation.error;
    event.target.setAttribute('aria-invalid', String(!validation.valid));
    const name = document.querySelector('#company-document-name');
    if (validation.valid && name && !name.value.trim()) name.value = String(file.name).replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ');
  });

  const settingsForm = document.querySelector('#settings-form');
  settingsForm?.addEventListener('invalid', event => {
    const panel = event.target?.closest?.('[role="tabpanel"]');
    if (panel && panel.hidden) activateSettingsTab(panel.id);
  }, true);
  settingsForm?.addEventListener('submit', event => {
    event.preventDefault();
    const form = new FormData(event.target);
    const documentValue = String(form.get('document') || '').trim();
    if (documentValue && !isValidCnpj(documentValue)) {
      activateSettingsTab('empresa');
      const input = document.querySelector('#company-cnpj');
      input?.setCustomValidity('Informe um CNPJ válido com 14 dígitos.');
      input?.setAttribute('aria-invalid', 'true');
      input?.reportValidity();
      input?.focus();
      toast('Confira o CNPJ informado antes de salvar.', 'error');
      return;
    }
    state.settings = {
      ...state.settings,
      companyName: String(form.get('companyName') || '').trim(),
      slogan: String(form.get('slogan') || '').trim(),
      legalName: String(form.get('legalName') || '').trim(),
      document: formatCnpj(documentValue),
      phone: String(form.get('phone') || '').trim(),
      email: String(form.get('email') || '').trim(),
      address: String(form.get('address') || '').trim(),
      city: String(form.get('city') || '').trim(),
      postalCode: String(form.get('postalCode') || '').trim(),
      managerName: String(form.get('managerName') || '').trim(),
      managerRole: String(form.get('managerRole') || '').trim(),
      openingTime: String(form.get('openingTime') || '09:00'),
      closingTime: String(form.get('closingTime') || '18:00'),
      warrantyDays: Number(form.get('warrantyDays') || 0),
      defaultDeadlineDays: Number(form.get('defaultDeadlineDays') || 0),
      orderNotes: String(form.get('orderNotes') || '').trim(),
      lowStockAlert: form.has('lowStockAlert'),
      dueDateAlert: form.has('dueDateAlert'),
      appointmentAlert: form.has('appointmentAlert')
    };
    recordActivity('settings', 'Configurações da empresa atualizadas');
    saveState();
    document.title = `${state.settings.companyName || 'Cellf'} — ${state.settings.slogan || 'Reparo e Comércio'}`;
    toast('Configurações salvas com sucesso.');
  });
}

function renderCompanyDocuments() {
  const container = document.querySelector('#company-document-list');
  const count = document.querySelector('#company-document-count');
  if (count) count.textContent = `${state.companyDocuments.length} ${state.companyDocuments.length === 1 ? 'arquivo' : 'arquivos'}`;
  if (!container) return;
  if (!state.companyDocuments.length) {
    container.innerHTML = emptyState('Nenhum documento anexado', 'Adicione CNPJ, contrato social, alvarás ou outros documentos da empresa.');
    return;
  }

  container.innerHTML = state.companyDocuments.map(item => {
    const extension = String(item.filename || '').split('.').at(-1).toLowerCase();
    const badge = extension === 'pdf' ? 'pdf' : ['jpg', 'jpeg', 'png', 'webp'].includes(extension) ? 'image' : 'doc';
    return `<article class="document-item"><span class="document-icon document-badge-${badge}" aria-hidden="true">${extension === 'pdf' ? 'PDF' : ['jpg', 'jpeg', 'png', 'webp'].includes(extension) ? 'IMG' : 'DOC'}</span><div class="document-copy"><strong>${esc(item.name)}</strong><span class="document-meta">${esc(item.filename)} · ${formatFileSize(item.size)} · ${formatDate(item.createdAt)}</span></div><div class="document-actions"><button type="button" class="icon-button" data-action="download-company-document" data-id="${esc(item.id)}" aria-label="Baixar ${esc(item.name)}" title="Baixar documento">↓</button><button type="button" class="icon-button document-remove" data-action="remove-company-document" data-id="${esc(item.id)}" aria-label="Remover ${esc(item.name)}" title="Remover documento">×</button></div></article>`;
  }).join('');
}

async function handleCompanyDocumentUpload() {
  if (companyDocumentUploadInFlight) return;
  const nameInput = document.querySelector('#company-document-name');
  const fileInput = document.querySelector('#company-document-file');
  const button = document.querySelector('#company-document-upload-button');
  const status = document.querySelector('#company-document-status');
  const name = nameInput?.value.trim() || '';
  const file = fileInput?.files?.[0];
  if (!name) { nameInput?.focus(); toast('Informe um nome para identificar o documento.', 'error'); return; }
  const validation = validateCompanyDocument(file);
  if (!validation.valid) { if (status) status.textContent = validation.error; toast(validation.error, 'error'); return; }
  if (!companyDocumentStorageAvailable()) { toast('Conecte-se ao Supabase para enviar o documento com segurança.', 'error'); return; }

  const metadata = { id: uid('doc'), name, filename: file.name, size: Number(file.size), mimeType: file.type || 'application/octet-stream', createdAt: new Date().toISOString() };
  const previousDocuments = state.companyDocuments;
  const previousActivity = state.activity.slice();
  let uploaded = false;
  let committed = false;
  companyDocumentUploadInFlight = true;
  if (button) { button.disabled = true; button.textContent = 'Enviando para a nuvem…'; }
  if (status) status.textContent = 'Preparando o envio protegido para o Supabase…';
  document.querySelector('#company-document-dropzone')?.classList.add('is-uploading');

  try {
    const upload = await saveCompanyDocument(metadata.id, file);
    uploaded = true;
    metadata.storagePath = upload.path;
    if (status) status.textContent = 'Arquivo enviado. Confirmando os dados na nuvem…';
    state.companyDocuments = [metadata, ...state.companyDocuments];
    recordActivity('document', `Documento adicionado: ${metadata.name}`);
    if (!saveState()) {
      throw new Error('Não foi possível registrar o documento no Supabase.');
    }
    await flushStateSave();
    committed = true;
    if (nameInput) nameInput.value = '';
    if (fileInput) { fileInput.value = ''; fileInput.removeAttribute('aria-invalid'); }
    if (status) status.textContent = 'Documento salvo com segurança no Supabase.';
    renderCompanyDocuments();
    toast(`Documento “${metadata.name}” anexado e salvo na nuvem.`);
  } catch (error) {
    if (!committed) {
      state.companyDocuments = previousDocuments;
      state.activity = previousActivity;
      if (uploaded) await deleteCompanyDocument(metadata.id).catch(() => {});
      renderCompanyDocuments();
    }
    if (error?.status === 401 || error?.status === 503) handleCloudError(error);
    const message = error?.message || 'Não foi possível salvar o documento no Supabase.';
    if (status) status.textContent = message;
    toast(message, 'error');
  } finally {
    companyDocumentUploadInFlight = false;
    if (button?.isConnected) { button.disabled = false; button.textContent = '＋ Anexar documento'; }
    document.querySelector('#company-document-dropzone')?.classList.remove('is-uploading');
  }
}

async function downloadCompanyDocument(id) {
  const metadata = state.companyDocuments.find(item => item.id === id);
  if (!metadata) return toast('Documento não encontrado.', 'error');
  try {
    const url = await readCompanyDocument(id);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = metadata.filename;
    anchor.rel = 'noopener noreferrer';
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    toast(`Download de “${metadata.name}” iniciado.`);
  } catch (error) {
    if (error?.status === 401 || error?.status === 503) handleCloudError(error);
    toast(error?.message || 'Não foi possível baixar o documento.', 'error');
  }
}

async function removeCompanyDocument(id) {
  const metadata = state.companyDocuments.find(item => item.id === id);
  if (!metadata) return;
  if (!window.confirm(`Remover o documento “${metadata.name}”? O arquivo será apagado do armazenamento protegido no Supabase.`)) return;
  const previousDocuments = state.companyDocuments;
  const previousActivity = state.activity.slice();
  let metadataRemoved = false;
  try {
    state.companyDocuments = state.companyDocuments.filter(item => item.id !== id);
    recordActivity('document', `Documento removido: ${metadata.name}`);
    if (!saveState()) throw new Error('Não foi possível sincronizar a remoção do documento.');
    await flushStateSave();
    metadataRemoved = true;
    await deleteCompanyDocument(id);
    renderCompanyDocuments();
    toast('Documento removido do Supabase com sucesso.');
  } catch (error) {
    state.companyDocuments = previousDocuments;
    state.activity = previousActivity;
    if (metadataRemoved && cloudConnection.authenticated) {
      if (saveState()) await flushStateSave().catch(() => {});
    }
    renderCompanyDocuments();
    if (error?.status === 401 || error?.status === 503) handleCloudError(error);
    toast(error?.message || 'Não foi possível remover o documento.', 'error');
  }
}

function closeMenu() {
  const sidebar = document.querySelector('#sidebar');
  const backdrop = document.querySelector('#sidebar-backdrop');
  const menuButton = document.querySelector('#menu-button');
  sidebar?.classList.remove('open');
  if (backdrop) backdrop.hidden = true;
  menuButton?.setAttribute('aria-expanded', 'false');
  document.body.classList.remove('menu-open');
}

function toggleMenu() {
  const sidebar = document.querySelector('#sidebar');
  const backdrop = document.querySelector('#sidebar-backdrop');
  const menuButton = document.querySelector('#menu-button');
  if (!sidebar) return;
  const open = !sidebar.classList.contains('open');
  sidebar.classList.toggle('open', open);
  if (backdrop) backdrop.hidden = !open;
  menuButton?.setAttribute('aria-expanded', String(open));
  document.body.classList.toggle('menu-open', open);
  if (open) document.querySelector('#sidebar-close')?.focus();
}

function navigate(view) {
  const renderers = { dashboard: renderDashboard, orders: renderOrders, customers: renderCustomers, products: renderProducts, services: renderServices, sales: renderSales, payables: renderPayables, reports: renderReports, settings: renderSettings, agenda: renderAgenda };
  currentView = renderers[view] ? view : 'dashboard';
  const labels = { dashboard: 'Visão geral', orders: 'Ordens de serviço', customers: 'Clientes', products: 'Produtos e estoque', services: 'Serviços e reparos', sales: 'Vendas e caixa', payables: 'Contas a pagar', reports: 'Relatórios e resultados', settings: 'Configurações', agenda: 'Agenda' };
  document.querySelectorAll('.nav-item').forEach(button => {
    const active = button.dataset.view === currentView;
    button.classList.toggle('active', active);
    if (active) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  });
  const label = document.querySelector('#current-view-label');
  if (label) label.textContent = labels[currentView];
  const context = document.querySelector('#topbar-context');
  if (context) context.textContent = labels[currentView];
  closeMenu();
  renderers[currentView]();
  associateFormLabels(content);
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function openModal(title, eyebrow, body) {
  lastFocusedElement = document.activeElement;
  document.querySelector('#modal-title').textContent = title;
  document.querySelector('#modal-eyebrow').textContent = eyebrow;
  document.querySelector('#modal-body').innerHTML = body;
  associateFormLabels(document.querySelector('#modal-body'));
  document.querySelector('#modal-backdrop').hidden = false;
  document.body.classList.add('modal-open');
  setTimeout(() => document.querySelector('#modal-body input:not([type="hidden"]), #modal-body select, #modal-body button')?.focus(), 30);
}
function closeModal() {
  const modal = document.querySelector('#modal-backdrop');
  if (modal) modal.hidden = true;
  document.body.classList.remove('modal-open');
  if (lastFocusedElement?.isConnected) lastFocusedElement.focus();
  lastFocusedElement = null;
}
function formActions(label='Salvar cadastro') { return `<div class="form-actions"><button type="button" class="ghost-button" data-action="close-modal">Cancelar</button><button class="primary-button" type="submit">${label}</button></div>`; }

function customerModal(customer = {}) {
  openModal(customer.id ? 'Editar cliente' : 'Novo cliente', 'RELACIONAMENTO', `<form id="customer-form" class="form-grid"><div class="field full"><label>NOME COMPLETO *</label><input name="name" required value="${esc(customer.name)}" placeholder="Nome completo do cliente"></div><div class="field"><label>TELEFONE / WHATSAPP *</label><input name="phone" required value="${esc(customer.phone)}" placeholder="(11) 99999-9999"></div><div class="field"><label>CPF / CNPJ</label><input name="document" value="${esc(customer.document)}" placeholder="000.000.000-00"></div><div class="field full"><label>E-MAIL</label><input name="email" type="email" value="${esc(customer.email)}" placeholder="cliente@email.com"></div><div class="field full"><label>OBSERVAÇÕES</label><textarea name="notes" placeholder="Preferências, orientações ou informações importantes...">${esc(customer.notes)}</textarea></div>${customer.id ? `<label class="field full checkbox-field"><span><input name="active" type="checkbox" ${customer.active !== false ? 'checked' : ''}> Cliente ativo para novos atendimentos</span></label>` : ''}${formActions(customer.id ? 'Salvar alterações' : 'Cadastrar cliente')}</form>`);
  document.querySelector('#customer-form').addEventListener('submit', event => {
    event.preventDefault();
    const form = new FormData(event.target);
    const data = Object.fromEntries(form);
    const digits = data.phone.replace(/\D/g, '');
    const duplicate = state.customers.find(entry => entry.id !== customer.id && digits && String(entry.phone || '').replace(/\D/g, '') === digits);
    if (duplicate) return toast(`Já existe um cliente com este telefone: ${duplicate.name}.`, 'error');
    const record = { id: customer.id || uid('c'), name: data.name.trim(), phone: data.phone.trim(), document: data.document.trim(), email: data.email.trim(), notes: data.notes.trim(), active: customer.id ? form.has('active') : true, createdAt: customer.createdAt || isoToday() };
    if (customer.id) {
      state.customers = state.customers.map(entry => entry.id === customer.id ? record : entry);
      state.orders.filter(order => order.customerId === customer.id).forEach(order => { order.customer = record.name; order.phone = record.phone; });
      state.sales.filter(sale => sale.customerId === customer.id).forEach(sale => { sale.customer = record.name; });
      state.appointments.filter(appointment => appointment.customerId === customer.id).forEach(appointment => { appointment.customer = record.name; });
    } else state.customers.unshift(record);
    recordActivity('customer', `${customer.id ? 'Atualizado' : 'Cadastrado'}: ${record.name}`);
    saveState();
    closeModal();
    navigate('customers');
    toast(customer.id ? 'Cliente atualizado.' : 'Cliente cadastrado.');
  });
}

function viewCustomer(customer) {
  if (!customer) return;
  const orders = customerOrders(customer);
  const sales = customerSales(customer);
  const total = sum(orders.filter(order => order.status !== 'cancelled'), 'value') + sum(sales.filter(sale => sale.status !== 'cancelled'), 'total');
  const digits = String(customer.phone || '').replace(/\D/g, '');
  openModal(customer.name, 'FICHA DO CLIENTE', `<div class="customer-detail"><div class="customer-profile"><span class="customer-avatar avatar">${esc(initials(customer.name))}</span><div><strong>${esc(customer.name)}</strong><small>Cliente desde ${formatDate(customer.createdAt)}</small></div>${customer.active === false ? '<span class="status waiting">Inativo</span>' : '<span class="status ready">Ativo</span>'}</div><div class="detail-grid"><div class="field"><label>TELEFONE</label><strong>${esc(customer.phone || 'Não informado')}</strong></div><div class="field"><label>E-MAIL</label><strong>${esc(customer.email || 'Não informado')}</strong></div><div class="field"><label>CPF / CNPJ</label><strong>${esc(customer.document || 'Não informado')}</strong></div><div class="field"><label>TOTAL MOVIMENTADO</label><strong>${brl.format(total)}</strong></div></div>${customer.notes ? `<div class="detail-section"><h3>Observações</h3><p>${esc(customer.notes)}</p></div>` : ''}<div class="detail-section"><h3>Últimos atendimentos</h3>${orders.length ? `<div class="activity-list">${orders.slice(0, 5).map(order => `<button class="activity-item" data-action="view-order" data-id="${esc(order.id)}"><span><strong>${esc(order.device)}</strong><small>${esc(order.id)} · ${formatDate(order.createdAt)}</small></span><span class="status ${statusMap[order.status]?.[1] || 'waiting'}">${esc(statusLabel(order.status))}</span></button>`).join('')}</div>` : '<p>Este cliente ainda não possui ordens de serviço.</p>'}</div><div class="form-actions">${digits ? `<a class="ghost-button" href="https://wa.me/55${esc(digits)}" target="_blank" rel="noopener noreferrer">WhatsApp ↗</a>` : ''}<button class="primary-button" data-action="edit-customer" data-id="${esc(customer.id)}">Editar cliente</button></div></div>`);
}

function productModal(product = {}) {
  openModal(product.id?'Editar produto':'Novo produto','INVENTÁRIO',`<form id="product-form" class="form-grid">
    <div class="field full"><label>NOME DO PRODUTO *</label><input name="name" required value="${esc(product.name)}" placeholder="Ex.: Capa Armor iPhone 15"></div>
    <div class="field"><label>SKU / CÓDIGO *</label><input name="sku" required value="${esc(product.sku)}" placeholder="CAP-IP15-TR"></div>
    <div class="field"><label>CATEGORIA *</label><input name="category" required value="${esc(product.category)}" placeholder="Capas"></div>
    <div class="field"><label>CUSTO (R$)</label><input name="cost" type="number" min="0" step="0.01" value="${product.cost??''}"></div>
    <div class="field"><label>PREÇO DE VENDA (R$) *</label><input name="price" type="number" min="0" step="0.01" required value="${product.price??''}"></div>
    <div class="field"><label>ESTOQUE ATUAL *</label><input name="stock" type="number" min="0" required value="${product.stock??0}"></div>
    <div class="field"><label>ESTOQUE MÍNIMO *</label><input name="minimum" type="number" min="0" required value="${product.minimum??0}"></div>
    ${formActions(product.id?'Salvar alterações':'Cadastrar produto')}</form>`);
  document.querySelector('#product-form').addEventListener('submit', e=>{
    e.preventDefault(); const data=Object.fromEntries(new FormData(e.target));
    const record={ id:product.id||uid('p'), name:data.name.trim(), sku:data.sku.trim().toUpperCase(), category:data.category.trim(), cost:Number(data.cost||0), price:Number(data.price), stock:Number(data.stock), minimum:Number(data.minimum) };
    if (state.products.some(item => item.id !== record.id && normalize(item.sku) === normalize(record.sku))) return toast('Já existe um produto cadastrado com este SKU.', 'error');
    if(product.id) state.products=state.products.map(x=>x.id===product.id?record:x); else state.products.unshift(record);
    recordActivity('product', `${product.id ? 'Atualizado' : 'Cadastrado'}: ${record.name}`);
    saveState(); closeModal(); navigate('products'); toast(product.id?'Produto atualizado.':'Produto cadastrado.','success');
  });
}
function serviceModal(service = {}) {
  openModal(service.id?'Editar serviço':'Novo serviço','CATÁLOGO',`<form id="service-form" class="form-grid">
    <div class="field full"><label>NOME DO SERVIÇO *</label><input name="name" required value="${esc(service.name)}" placeholder="Ex.: Troca de tela — iPhone 14"></div>
    <div class="field"><label>CATEGORIA *</label><input name="category" required value="${esc(service.category)}" placeholder="Tela, bateria, placa..."></div>
    <div class="field"><label>FORMA DE PREÇO *</label><select name="pricing" id="pricing-select"><option value="fixed" ${service.pricing!=='quote'?'selected':''}>Preço fixo</option><option value="quote" ${service.pricing==='quote'?'selected':''}>Valor a consultar</option></select></div>
    <div class="field" id="price-field"><label>PREÇO FIXO (R$)</label><input name="price" type="number" min="0" step="0.01" value="${service.price??''}"></div>
    <div class="field"><label>DURAÇÃO ESTIMADA (MIN) *</label><input name="duration" type="number" min="1" required value="${service.duration??60}"></div>
    <div class="field full"><label><input name="active" type="checkbox" style="width:auto;height:auto" ${service.active!==false?'checked':''}> Serviço ativo para novas ordens</label></div>
    ${formActions(service.id?'Salvar alterações':'Cadastrar serviço')}</form>`);
  const toggle=()=>{
    const quoted=document.querySelector('#pricing-select').value==='quote';
    document.querySelector('#price-field').style.opacity=quoted?'.45':'1';
    document.querySelector('#price-field input').disabled=quoted;
  }; toggle(); document.querySelector('#pricing-select').addEventListener('change',toggle);
  document.querySelector('#service-form').addEventListener('submit',e=>{
    e.preventDefault(); const fd=new FormData(e.target), data=Object.fromEntries(fd); const pricing=data.pricing;
    const record={id:service.id||uid('s'),name:data.name.trim(),category:data.category.trim(),pricing,price:pricing==='fixed'?Number(data.price||0):null,duration:Number(data.duration),active:fd.has('active')};
    if(service.id) state.services=state.services.map(x=>x.id===service.id?record:x); else state.services.unshift(record);
    recordActivity('service', `${service.id ? 'Atualizado' : 'Cadastrado'}: ${record.name}`);
    saveState();closeModal();navigate('services');toast(service.id?'Serviço atualizado.':'Serviço cadastrado.','success');
  });
}
function orderModal(order = {}) {
  const next = Math.max(1000, ...state.orders.map(item => Number(item.id.replace(/\D/g, '')) || 0)) + 1;
  const defaultDue = offsetDate(Number(state.settings.defaultDeadlineDays || 2));
  const customers = state.customers.filter(customer => customer.active !== false);
  openModal(order.id ? `Editar ${order.id}` : 'Nova ordem de serviço', 'ASSISTÊNCIA TÉCNICA', `<form id="order-form" class="form-grid"><div class="field full"><label>CLIENTE CADASTRADO</label><select name="customerId" id="order-customer"><option value="">Cadastrar a partir dos dados abaixo</option>${customers.map(customer => `<option value="${esc(customer.id)}" data-name="${esc(customer.name)}" data-phone="${esc(customer.phone)}" ${order.customerId === customer.id ? 'selected' : ''}>${esc(customer.name)} · ${esc(customer.phone || 'sem telefone')}</option>`).join('')}</select></div><div class="field"><label>NOME DO CLIENTE *</label><input name="customer" id="order-customer-name" required value="${esc(order.customer)}" placeholder="Nome completo"></div><div class="field"><label>TELEFONE *</label><input name="phone" id="order-customer-phone" required value="${esc(order.phone)}" placeholder="(11) 99999-9999"></div><div class="field"><label>APARELHO *</label><input name="device" required value="${esc(order.device)}" placeholder="Ex.: iPhone 13 Pro"></div><div class="field"><label>IMEI</label><input name="imei" inputmode="numeric" maxlength="15" value="${esc(order.imei)}" placeholder="15 dígitos"></div><div class="field full"><label>DEFEITO RELATADO *</label><textarea name="issue" required placeholder="Descreva o problema informado pelo cliente...">${esc(order.issue)}</textarea></div><div class="form-section"><h3>Serviço e prazo</h3></div><div class="field full"><label>SERVIÇO *</label><select name="serviceId" id="order-service" required><option value="">Selecione...</option>${state.services.filter(service => service.active || service.id === order.serviceId).map(service => `<option value="${esc(service.id)}" data-price="${service.price ?? ''}" ${order.serviceId === service.id ? 'selected' : ''}>${esc(service.name)} — ${service.pricing === 'fixed' ? brl.format(service.price) : 'A consultar'}</option>`).join('')}</select></div><div class="field"><label>VALOR ACORDADO (R$)</label><input name="value" id="order-value" type="number" min="0" step="0.01" value="${order.value ?? ''}" placeholder="Deixe vazio se a consultar"></div><div class="field"><label>PREVISÃO DE ENTREGA *</label><input name="dueAt" type="date" required value="${esc(order.dueAt || defaultDue)}"></div>${order.id ? `<div class="field full"><label>STATUS</label><select name="status">${Object.entries(statusMap).map(([value, [label]]) => `<option value="${value}" ${order.status === value ? 'selected' : ''}>${label}</option>`).join('')}</select></div>` : ''}<div class="form-section"><h3>Lembrete opcional</h3></div><div class="field full"><label>LEMBRETE</label><input name="reminder" value="${esc(order.reminder)}" placeholder="Ex.: Avisar o cliente quando a peça chegar"></div><div class="field full"><label>DATA E HORA DO LEMBRETE</label><input name="reminderAt" type="datetime-local" value="${esc(order.reminderAt)}"></div>${formActions(order.id ? 'Salvar alterações' : 'Criar ordem')}</form>`);
  document.querySelector('#order-customer').addEventListener('change', event => {
    const option = event.target.selectedOptions[0];
    if (option?.value) {
      document.querySelector('#order-customer-name').value = option.dataset.name || '';
      document.querySelector('#order-customer-phone').value = option.dataset.phone || '';
    }
  });
  document.querySelector('#order-service').addEventListener('change', event => {
    const price = event.target.selectedOptions[0]?.dataset.price;
    if (price && !document.querySelector('#order-value').value) document.querySelector('#order-value').value = price;
  });
  document.querySelector('#order-form').addEventListener('submit', event => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.target));
    const imei = data.imei.replace(/\D/g, '');
    if (imei && imei.length !== 15) return toast('O IMEI deve conter exatamente 15 dígitos.', 'error');
    let customer = state.customers.find(entry => entry.id === data.customerId);
    if (!customer) {
      const digits = data.phone.replace(/\D/g, '');
      customer = state.customers.find(entry => String(entry.phone || '').replace(/\D/g, '') === digits);
    }
    if (!customer) {
      customer = { id: uid('c'), name: data.customer.trim(), phone: data.phone.trim(), email: '', document: '', notes: '', active: true, createdAt: isoToday() };
      state.customers.unshift(customer);
    }
    const status = order.id ? data.status : 'analysis';
    const record = { id: order.id || `OS-${next}`, customerId: customer.id, customer: data.customer.trim(), phone: data.phone.trim(), device: data.device.trim(), imei, issue: data.issue.trim(), serviceId: data.serviceId, value: data.value === '' ? null : Number(data.value), status, createdAt: order.createdAt || isoToday(), dueAt: data.dueAt, reminderAt: data.reminderAt, reminder: data.reminder.trim(), deliveredAt: status === 'delivered' ? order.deliveredAt || new Date().toISOString() : '' };
    if (order.id) state.orders = state.orders.map(item => item.id === order.id ? record : item);
    else state.orders.unshift(record);
    recordActivity('order', `${order.id ? 'Atualizada' : 'Criada'} ${record.id} · ${record.customer}`);
    saveState(); closeModal(); navigate('orders'); toast(order.id ? `${record.id} atualizada.` : `${record.id} criada.`);
  });
}

function payableModal(payable = {}) {
  openModal(payable.id ? 'Editar conta a pagar' : 'Nova conta a pagar', 'FINANCEIRO', `<form id="payable-form" class="form-grid"><div class="field full"><label>DESCRIÇÃO *</label><input name="description" required value="${esc(payable.description)}" placeholder="Ex.: Compra de peças"></div><div class="field"><label>FORNECEDOR *</label><input name="supplier" required value="${esc(payable.supplier)}" placeholder="Nome do fornecedor"></div><div class="field"><label>CATEGORIA *</label><input name="category" required value="${esc(payable.category)}" placeholder="Peças, fixo, insumos..."></div><div class="field"><label>VALOR (R$) *</label><input name="amount" type="number" min="0.01" step="0.01" required value="${payable.amount ?? ''}"></div><div class="field"><label>VENCIMENTO *</label><input name="dueAt" type="date" required value="${esc(payable.dueAt || isoToday())}"></div>${formActions(payable.id ? 'Salvar alterações' : 'Cadastrar conta')}</form>`);
  document.querySelector('#payable-form').addEventListener('submit', event => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.target));
    const record = { id: payable.id || uid('a'), description: data.description.trim(), supplier: data.supplier.trim(), category: data.category.trim(), amount: Number(data.amount), dueAt: data.dueAt, paid: Boolean(payable.paid), paidAt: payable.paidAt || '' };
    if (payable.id) state.payables = state.payables.map(item => item.id === payable.id ? record : item);
    else state.payables.unshift(record);
    recordActivity('payable', `${payable.id ? 'Atualizada' : 'Cadastrada'} conta: ${record.description}`);
    saveState(); closeModal(); navigate('payables'); toast(payable.id ? 'Conta atualizada.' : 'Conta cadastrada.');
  });
}

function stockModal() {
  openModal('Movimentar estoque', 'INVENTÁRIO', `<form id="stock-form" class="form-grid"><div class="field full"><label>PRODUTO *</label><select name="productId" required><option value="">Selecione...</option>${state.products.map(product => `<option value="${esc(product.id)}">${esc(product.name)} — atual: ${product.stock}</option>`).join('')}</select></div><div class="field"><label>TIPO *</label><select name="type"><option value="in">Entrada</option><option value="out">Saída</option><option value="adjust">Definir saldo</option></select></div><div class="field"><label>QUANTIDADE *</label><input name="quantity" type="number" min="0" required></div><div class="field full"><label>MOTIVO / OBSERVAÇÃO *</label><input name="reason" required placeholder="Ex.: Compra do fornecedor ou ajuste de inventário"></div>${formActions('Confirmar movimento')}</form>`);
  document.querySelector('#stock-form').addEventListener('submit', event => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.target));
    const product = state.products.find(item => item.id === data.productId);
    const quantity = Number(data.quantity);
    if (!product) return toast('Selecione um produto válido.', 'error');
    if (data.type === 'out' && quantity > product.stock) return toast(`Saída maior que o estoque disponível (${product.stock}).`, 'error');
    if (data.type === 'in') product.stock += quantity;
    if (data.type === 'out') product.stock -= quantity;
    if (data.type === 'adjust') product.stock = quantity;
    state.stockMovements.unshift({ id: uid('mov'), productId: product.id, productName: product.name, type: data.type, quantity, reason: data.reason.trim(), createdAt: new Date().toISOString() });
    state.stockMovements = state.stockMovements.slice(0, 200);
    recordActivity('stock', `${product.name}: ${data.type === 'in' ? '+' : data.type === 'out' ? '−' : '='}${quantity}`);
    saveState(); closeModal(); navigate('products'); toast('Estoque atualizado.');
  });
}

function viewOrder(order) {
  if (!order) return;
  const service = serviceName(order.serviceId);
  const digits = String(order.phone || '').replace(/\D/g, '');
  const message = encodeURIComponent(`Olá, ${order.customer}! Sobre sua ordem ${order.id} (${order.device}): o status atual é ${statusLabel(order.status)}.`);
  openModal(order.id, 'DETALHES DA ORDEM', `<div class="order-detail"><div class="order-detail-header"><div><span class="status ${statusMap[order.status]?.[1] || 'waiting'}">${esc(statusLabel(order.status))}</span><h3>${esc(order.device)}</h3><p>${esc(order.issue)}</p></div><strong class="order-detail-value">${order.value == null ? 'A consultar' : brl.format(order.value)}</strong></div><div class="detail-grid"><div class="field"><label>CLIENTE</label><strong>${esc(order.customer)}</strong><span class="field-help">${esc(order.phone || 'Sem telefone')}</span></div><div class="field"><label>IMEI</label><strong>${esc(order.imei || 'Não informado')}</strong></div><div class="field"><label>SERVIÇO</label><strong>${esc(service)}</strong></div><div class="field"><label>PREVISÃO DE ENTREGA</label><strong>${formatDate(order.dueAt)}</strong></div><div class="field"><label>ENTRADA</label><strong>${formatDate(order.createdAt)}</strong></div><div class="field"><label>GARANTIA PADRÃO</label><strong>${Number(state.settings.warrantyDays || 0)} dias</strong></div></div>${order.reminder ? `<div class="detail-section reminder-callout"><h3>Lembrete</h3><p>${esc(order.reminder)}</p><small>${formatDateTime(order.reminderAt)}</small></div>` : ''}${state.settings.orderNotes ? `<div class="detail-section"><h3>Condições e observações</h3><p>${esc(state.settings.orderNotes)}</p></div>` : ''}<div class="form-actions">${digits ? `<a class="ghost-button" href="https://wa.me/55${esc(digits)}?text=${message}" target="_blank" rel="noopener noreferrer">WhatsApp ↗</a>` : ''}<button class="ghost-button" data-action="edit-order" data-id="${esc(order.id)}">Editar</button>${order.status !== 'delivered' && order.status !== 'cancelled' ? `<button class="primary-button" data-action="deliver-order" data-id="${esc(order.id)}">✓ Marcar como entregue</button>` : ''}</div></div>`);
}

async function consultImei(event) {
  event.preventDefault();
  const input = document.querySelector('#imei-input');
  const result = document.querySelector('#imei-result');
  const button = event.target.querySelector('button');
  const imei = input.value.replace(/\D/g, '');
  result.className = 'imei-result';
  if (imei.length !== 15) {
    result.innerHTML = '<strong>IMEI incompleto</strong><br>Informe exatamente 15 dígitos para consultar.';
    input.focus();
    return;
  }

  result.textContent = 'Consultando a base da Anatel…';
  button.disabled = true;
  try {
    const response = await fetch('/api/imei', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ imei }) });
    const payload = await response.json();
    if (!response.ok) throw payload;
    const data = payload.data?.[0] || payload.data || payload;
    result.innerHTML = `<strong>Consulta concluída</strong><br>${esc(data.resultado || data.result || 'Resposta recebida da Infosimples.')}<br><small>IMEI ${esc(imei)}</small>`;
  } catch (error) {
    result.innerHTML = `<strong>${error.code === 'IMEI_API_NOT_CONFIGURED' ? 'Integração aguardando configuração' : 'Não foi possível consultar'}</strong><br>${esc(error.message || 'Revise o IMEI e tente novamente.')}`;
  } finally {
    button.disabled = false;
  }
}

function openNotifications() {
  const notifications = [];
  if (state.settings.appointmentAlert) {
    state.orders.filter(order => order.reminder && order.reminderAt).forEach(order => notifications.push({ title: `${order.customer} · ${order.id}`, message: order.reminder, date: order.reminderAt, view: 'orders' }));
    state.appointments.filter(appointment => appointment.status === 'scheduled' && appointment.date >= isoToday()).slice(0, 8).forEach(appointment => notifications.push({ title: appointment.title, message: appointment.customer || APPOINTMENT_LABELS[appointment.type], date: `${appointment.date}T${appointment.time}`, view: 'agenda' }));
  }
  if (state.settings.dueDateAlert) {
    state.orders.filter(order => !['delivered', 'cancelled'].includes(order.status) && order.dueAt < isoToday()).slice(0, 5).forEach(order => notifications.push({ title: `Prazo vencido · ${order.id}`, message: `${order.customer} · ${order.device}`, date: `${order.dueAt}T${state.settings.closingTime || '18:00'}`, view: 'orders' }));
  }
  if (state.settings.lowStockAlert) {
    state.products.filter(product => product.stock <= product.minimum).slice(0, 5).forEach(product => notifications.push({ title: 'Estoque baixo', message: `${product.name} · ${product.stock} unidades restantes`, date: '', view: 'products' }));
  }
  notifications.sort((a, b) => String(a.date || '9999').localeCompare(String(b.date || '9999')));
  document.querySelector('#notification-list').innerHTML = notifications.length ? notifications.map(item => `<button class="drawer-item" data-view="${esc(item.view)}"><strong>${esc(item.title)}</strong><p>${esc(item.message)}</p>${item.date ? `<time>${formatDateTime(item.date)}</time>` : '<time>Atenção necessária</time>'}</button>`).join('') : emptyState('Tudo em dia', 'Nenhum aviso ou lembrete pendente.');
  const drawer = document.querySelector('#notification-drawer');
  drawer.classList.add('open');
  drawer.setAttribute('aria-hidden', 'false');
}

function closeNotifications() {
  const drawer = document.querySelector('#notification-drawer');
  if (!drawer) return;
  drawer.classList.remove('open');
  drawer.setAttribute('aria-hidden', 'true');
}

function openCommand() {
  const backdrop = document.querySelector('#command-backdrop');
  const input = document.querySelector('#command-query');
  if (!backdrop || !input) return;
  backdrop.hidden = false;
  input.value = '';
  commandSearch('');
  setTimeout(() => input.focus(), 20);
}

function closeCommand() {
  const backdrop = document.querySelector('#command-backdrop');
  if (backdrop) backdrop.hidden = true;
}

function commandSearch(query) {
  const q = normalize(query.trim());
  const shortcuts = [
    { kind: 'Tela', title: 'Visão geral', sub: 'Indicadores e ações rápidas', view: 'dashboard' },
    { kind: 'Tela', title: 'Clientes', sub: 'Cadastros e histórico de atendimento', view: 'customers' },
    { kind: 'Tela', title: 'Vendas e caixa', sub: 'Ponto de venda e produtos', view: 'sales' },
    { kind: 'Tela', title: 'Agenda', sub: 'Compromissos e entregas', view: 'agenda' },
    { kind: 'Tela', title: 'Relatórios', sub: 'Faturamento, resultado e despesas', view: 'reports' },
    { kind: 'Tela', title: 'Configurações', sub: 'Empresa, CNPJ, documentos, slogan e preferências', view: 'settings' }
  ];
  let items = [...shortcuts, ...state.orders.map(order => ({ kind: 'Ordem', title: `${order.id} · ${order.customer}`, sub: `${order.device} · ${order.imei || order.phone}`, view: 'orders', id: order.id })), ...state.customers.map(customer => ({ kind: 'Cliente', title: customer.name, sub: `${customer.phone || 'Sem telefone'} · ${customer.email || 'Sem e-mail'}`, view: 'customers', id: customer.id })), ...state.products.map(product => ({ kind: 'Produto', title: product.name, sub: `${product.sku} · ${product.stock} em estoque`, view: 'products', id: product.id })), ...state.services.map(service => ({ kind: 'Serviço', title: service.name, sub: service.category, view: 'services', id: service.id }))];
  if (q) items = items.filter(item => normalize(`${item.title} ${item.sub} ${item.kind}`).includes(q));
  items = items.slice(0, 10);
  document.querySelector('#command-results').innerHTML = items.length ? items.map(item => `<button class="command-result" data-command-view="${esc(item.view)}" data-command-id="${esc(item.id || '')}" data-command-kind="${esc(item.kind)}"><span><strong>${esc(item.title)}</strong><small>${esc(item.sub)}</small></span><span class="command-kind">${esc(item.kind)}</span></button>`).join('') : '<div class="table-empty">Nenhum resultado encontrado.</div>';
}

function toast(message, type = 'success') {
  const region = document.querySelector('#toast-region');
  if (!region) return;
  const element = document.createElement('div');
  element.className = `toast ${type === 'error' ? 'error' : 'success'}`;
  element.setAttribute('role', type === 'error' ? 'alert' : 'status');
  element.textContent = message;
  region.append(element);
  setTimeout(() => element.remove(), 3600);
}

function refreshBadges() {
  const active = state.orders.filter(order => !['ready', 'delivered', 'cancelled'].includes(order.status)).length;
  const count = document.querySelector('#nav-orders-count');
  if (count) count.textContent = active;
  const reminders = state.orders.filter(order => order.reminder && order.reminderAt).length;
  const appointments = state.appointments.filter(appointment => appointment.date === isoToday() && appointment.status === 'scheduled').length;
  const low = state.settings.lowStockAlert ? state.products.filter(product => product.stock <= product.minimum).length : 0;
  const dot = document.querySelector('#notification-dot');
  if (dot) dot.style.display = reminders + appointments + low ? 'block' : 'none';
}

function downloadFile(name, value, type) {
  const blob = new Blob([value], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function exportCsv(name, headings, rows) {
  const cell = value => `"${String(value ?? '').replaceAll('"', '""')}"`;
  const csv = `\uFEFF${[headings, ...rows].map(row => row.map(cell).join(';')).join('\r\n')}`;
  downloadFile(name, csv, 'text/csv;charset=utf-8');
}

function exportSales() {
  exportCsv(`cellf-vendas-${isoToday()}.csv`, ['Código', 'Data', 'Cliente', 'Itens', 'Pagamento', 'Subtotal', 'Desconto', 'Total'], state.sales.map(sale => [sale.id.toUpperCase(), formatDateTime(sale.createdAt), sale.customer, sale.items.map(item => `${item.quantity}x ${item.name}`).join(' | '), PAYMENT_LABELS[sale.payment] || sale.payment, sale.subtotal, sale.discount, sale.total]));
  toast('Histórico de vendas exportado.');
}

function exportReport() {
  const data = reportData();
  const rows = [['Período', reportPeriod ? `Últimos ${reportPeriod} dias` : 'Todo o histórico'], ['Faturamento total', data.revenue], ['Vendas de produtos', data.salesRevenue], ['Serviços entregues', data.serviceRevenue], ['Custo dos produtos vendidos', data.costOfSales], ['Despesas pagas', data.expenses], ['Resultado líquido', data.grossProfit], ['Quantidade de vendas', data.sales.length], ['Ordens entregues', data.delivered.length]];
  exportCsv(`cellf-relatorio-${isoToday()}.csv`, ['Indicador', 'Valor'], rows);
  toast('Relatório exportado com sucesso.');
}

function setShellAccess(enabled) {
  const accessible = Boolean(enabled);
  document.body.classList.toggle('cloud-auth-mode', !accessible);
  document.querySelectorAll('.nav-item, .topbar button, .user-card, .cloud-logout-button').forEach(button => {
    button.disabled = !accessible;
  });
  if (!accessible) closeMenu();
}

function renderCloudAccess(mode = 'login', message = '') {
  const login = mode === 'login';
  const loading = mode === 'loading';
  const configuration = mode === 'configuration';
  const title = loading ? 'Conectando sua empresa' : login ? 'Acesse sua conta' : configuration ? 'Configuração necessária' : 'Não foi possível conectar';
  const description = loading
    ? 'Estamos verificando sua sessão e buscando seus dados protegidos na nuvem.'
    : login
      ? 'Entre para acessar os dados e documentos da sua empresa com segurança.'
      : configuration
        ? 'A conexão com o Supabase e o acesso administrativo precisam ser configurados no servidor.'
        : 'Não conseguimos acessar o Supabase neste momento. Confira sua conexão e tente novamente.';
  const feedback = message && !(login && /UNAUTHENTICATED|sessão|autentic/i.test(message)) ? String(message) : '';

  setShellAccess(false);
  content.innerHTML = `<section class="cloud-access-screen" aria-labelledby="cloud-access-title">
    <div class="cloud-access-card">
      <div class="cloud-brand"><img src="/cellf-logo.png" alt="Cellf — Reparo e Comércio" width="1600" height="800"></div>
      <div class="cloud-access-body">
        <div class="cloud-access-heading"><span class="cloud-access-kicker">ACESSO SEGURO</span><h1 id="cloud-access-title">${esc(title)}</h1><p>${esc(description)}</p></div>
        ${login ? `<form id="cloud-login-form" class="cloud-login-form" method="post" autocomplete="on">
          <div class="cloud-account"><span class="cloud-account-avatar" aria-hidden="true">C</span><span><strong>Administrador Cellf</strong><small>Ambiente empresarial protegido</small></span><span class="cloud-account-check" aria-hidden="true">✓</span></div>
          <div class="field cloud-password-field"><label for="cloud-password">SENHA DE ACESSO</label><div class="cloud-password-control"><input id="cloud-password" name="password" type="password" autocomplete="current-password" placeholder="Digite sua senha" aria-describedby="cloud-login-status" required><button type="button" class="cloud-password-toggle" data-action="toggle-cloud-password" aria-label="Mostrar senha" aria-pressed="false">◉</button></div></div>
          <p id="cloud-login-status" class="cloud-login-status${feedback ? ' is-error' : ''}" role="${feedback ? 'alert' : 'status'}" aria-live="polite">${esc(feedback)}</p>
          <button id="cloud-login-submit" class="primary-button cloud-login-submit" type="submit"><span>Entrar no sistema</span><span aria-hidden="true">→</span></button>
        </form>` : `<div class="cloud-access-details${loading ? ' is-loading' : ''}">${loading ? '<span class="cloud-loading-spinner" aria-hidden="true"></span><span>Verificando conexão segura…</span>' : `<span aria-hidden="true">${configuration ? '⚙' : '↻'}</span><p>${esc(feedback || (configuration ? 'Configure as credenciais do Supabase, a senha administrativa e o segredo da sessão nas variáveis de ambiente do servidor.' : 'Seus dados permanecem protegidos no Supabase e serão exibidos assim que a conexão for restabelecida.'))}</p><button type="button" class="primary-button cloud-login-submit" data-action="retry-cloud">Tentar novamente</button>`}</div>`}
        <div class="cloud-access-security"><span><span aria-hidden="true">◈</span> Sessão protegida</span><span><span aria-hidden="true">☁</span> Dados no Supabase</span></div>
      </div>
    </div>
    <p class="cloud-access-footer">Cellf · Gestão de assistência técnica</p>
  </section>`;

  const form = document.querySelector('#cloud-login-form');
  form?.addEventListener('submit', async event => {
    event.preventDefault();
    const input = document.querySelector('#cloud-password');
    const button = document.querySelector('#cloud-login-submit');
    const status = document.querySelector('#cloud-login-status');
    const password = input?.value || '';
    if (!password) {
      if (status) { status.textContent = 'Informe sua senha para continuar.'; status.classList.add('is-error'); }
      input?.focus();
      return;
    }

    if (button) { button.disabled = true; button.innerHTML = '<span>Verificando acesso…</span>'; }
    if (status) { status.textContent = 'Validando sua sessão protegida…'; status.classList.remove('is-error'); }
    input?.removeAttribute('aria-invalid');
    try {
      await authenticate(password);
      if (input) input.value = '';
      await bootstrapApplication();
    } catch (error) {
      if (error?.status === 503) {
        handleCloudError(error);
        return;
      }
      if (status?.isConnected) {
        status.textContent = error?.status === 401 ? 'Senha incorreta. Confira e tente novamente.' : error?.message || 'Não foi possível validar seu acesso.';
        status.classList.add('is-error');
        status.setAttribute('role', 'alert');
      }
      if (input?.isConnected) { input.value = ''; input.setAttribute('aria-invalid', 'true'); input.focus(); }
      if (button?.isConnected) { button.disabled = false; button.innerHTML = '<span>Entrar no sistema</span><span aria-hidden="true">→</span>'; }
    }
  });
  if (login) setTimeout(() => document.querySelector('#cloud-password')?.focus(), 30);
}

async function authenticate(password) {
  const result = await apiRequest('/api/session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: String(password || '') })
  });
  setCloudStatus('connected');
  return result;
}

async function loadRemoteState() {
  const preservePendingChanges = applicationReady && pendingStateRevision > persistedStateRevision;
  const payload = await apiRequest('/api/state');
  setCloudStatus('connected');

  if (preservePendingChanges) {
    await flushStateSave();
    return state;
  }

  pendingStateRevision = 0;
  persistedStateRevision = 0;
  if (payload.state && typeof payload.state === 'object' && !Array.isArray(payload.state)) {
    state = loadState(payload.state);
    cloudConnection.updatedAt = payload.updatedAt || null;
    return state;
  }

  state = loadState();
  pendingStateRevision += 1;
  await flushStateSave();
  return state;
}

async function bootstrapApplication() {
  if (applicationBootstrapPromise) return applicationBootstrapPromise;
  applicationBootstrapPromise = (async () => {
    setCloudStatus('connecting');
    renderCloudAccess('loading');
    try {
      await loadRemoteState();
      applicationReady = true;
      setShellAccess(true);
      syncShell();
      refreshBadges();
      navigate(currentView);
      return true;
    } catch (error) {
      handleCloudError(error);
      return false;
    }
  })();

  try { return await applicationBootstrapPromise; }
  finally { applicationBootstrapPromise = null; }
}

async function logout() {
  try {
    if (pendingStateRevision > persistedStateRevision) await flushStateSave();
    await apiRequest('/api/session', { method: 'DELETE' });
    if (stateSaveTimer) { clearTimeout(stateSaveTimer); stateSaveTimer = null; }
    pendingStateRevision = 0;
    persistedStateRevision = 0;
    applicationReady = false;
    state = loadState();
    cart = { items: [], customerId: '', payment: 'pix', discount: 0 };
    currentView = 'dashboard';
    setCloudStatus('locked');
    renderCloudAccess('login');
    toast('Sessão encerrada com segurança.');
  } catch (error) {
    if (error?.status === 401) {
      setCloudStatus('locked');
      renderCloudAccess('login');
      return;
    }
    toast(error?.message || 'Não foi possível encerrar a sessão. Tente novamente.', 'error');
  }
}

document.addEventListener('click', event => {
  if (!(event.target instanceof Element)) return;
  const view = event.target.closest('[data-view]')?.dataset.view;
  if (view) { closeNotifications(); navigate(view); return; }
  const button = event.target.closest('[data-action]');
  if (!button) return;
  const { action, id } = button.dataset;

  switch (action) {
    case 'close-modal': closeModal(); break;
    case 'close-menu': closeMenu(); break;
    case 'retry-cloud': bootstrapApplication(); break;
    case 'logout': logout(); break;
    case 'toggle-cloud-password': {
      const password = document.querySelector('#cloud-password');
      if (!password) break;
      const visible = password.type === 'password';
      password.type = visible ? 'text' : 'password';
      button.setAttribute('aria-pressed', String(visible));
      button.setAttribute('aria-label', visible ? 'Ocultar senha' : 'Mostrar senha');
      password.focus();
      break;
    }
    case 'profile': navigate('settings'); break;
    case 'settings-tab': activateSettingsTab(button.dataset.tab); break;
    case 'new-product': productModal(); break;
    case 'edit-product': productModal(state.products.find(item => item.id === id)); break;
    case 'new-service': serviceModal(); break;
    case 'edit-service': serviceModal(state.services.find(item => item.id === id)); break;
    case 'new-customer': customerModal(); break;
    case 'edit-customer': customerModal(state.customers.find(item => item.id === id)); break;
    case 'view-customer': viewCustomer(state.customers.find(item => item.id === id)); break;
    case 'new-order': orderModal(); break;
    case 'edit-order': orderModal(state.orders.find(item => item.id === id)); break;
    case 'view-order': viewOrder(state.orders.find(item => item.id === id)); break;
    case 'new-payable': payableModal(); break;
    case 'edit-payable': payableModal(state.payables.find(item => item.id === id)); break;
    case 'stock-movement': stockModal(); break;
    case 'new-appointment': appointmentModal(); break;
    case 'edit-appointment': appointmentModal(state.appointments.find(item => item.id === id)); break;
    case 'view-sale': viewSale(state.sales.find(item => item.id === id)); break;
    case 'add-cart-product': addCartProduct(id); break;
    case 'cart-increase': addCartProduct(id); break;
    case 'cart-decrease': addCartProduct(id, -1); break;
    case 'clear-cart': cart = { items: [], customerId: '', payment: 'pix', discount: 0 }; renderSales(); break;
    case 'complete-sale': completeSale(); break;
    case 'calendar-select': selectedAgendaDate = button.dataset.date; calendarMonth = new Date(`${selectedAgendaDate.slice(0, 7)}-01T12:00:00`); renderAgenda(); break;
    case 'calendar-prev': calendarMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1); selectedAgendaDate = localDate(calendarMonth); renderAgenda(); break;
    case 'calendar-next': calendarMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1); selectedAgendaDate = localDate(calendarMonth); renderAgenda(); break;
    case 'calendar-today': calendarMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1); selectedAgendaDate = isoToday(); renderAgenda(); break;
    case 'report-period': reportPeriod = Number(button.dataset.days); renderReports(); break;
    case 'export-sales': exportSales(); break;
    case 'export-report': exportReport(); break;
    case 'export-backup': downloadFile(`cellf-backup-${isoToday()}.json`, JSON.stringify(state, null, 2), 'application/json;charset=utf-8'); toast('Backup baixado com sucesso.'); break;
    case 'upload-company-document': handleCompanyDocumentUpload(); break;
    case 'download-company-document': downloadCompanyDocument(id); break;
    case 'remove-company-document': removeCompanyDocument(id); break;
    case 'close-notifications': closeNotifications(); break;
    case 'toggle-payable': {
      const payable = state.payables.find(item => item.id === id);
      if (!payable) break;
      payable.paid = !payable.paid;
      payable.paidAt = payable.paid ? new Date().toISOString() : '';
      recordActivity('payable', `${payable.paid ? 'Paga' : 'Reaberta'}: ${payable.description}`);
      saveState(); navigate('payables'); toast(payable.paid ? 'Conta marcada como paga.' : 'Conta reaberta.');
      break;
    }
    case 'deliver-order': {
      const order = state.orders.find(item => item.id === id);
      if (!order) break;
      order.status = 'delivered';
      order.deliveredAt = new Date().toISOString();
      recordActivity('order', `${order.id} entregue a ${order.customer}`);
      saveState(); closeModal(); navigate('orders'); toast(`${order.id} marcada como entregue.`);
      break;
    }
    case 'complete-appointment': {
      const appointment = state.appointments.find(item => item.id === id);
      if (!appointment) break;
      appointment.status = 'done';
      recordActivity('appointment', `Concluído: ${appointment.title}`);
      saveState(); renderAgenda(); toast('Compromisso concluído.');
      break;
    }
    default: break;
  }
});

document.addEventListener('change', event => {
  if (!(event.target instanceof Element)) return;
  if (event.target.matches('[data-action="order-status"]')) {
    const order = state.orders.find(item => item.id === event.target.dataset.id);
    if (!order) return;
    order.status = event.target.value;
    order.deliveredAt = order.status === 'delivered' ? order.deliveredAt || new Date().toISOString() : '';
    recordActivity('order', `${order.id}: ${statusLabel(order.status)}`);
    saveState(); navigate('orders'); toast('Status da ordem atualizado.');
  }
  if (event.target.matches('[data-action="sale-customer"]')) cart.customerId = event.target.value;
  if (event.target.matches('[data-action="sale-payment"]')) cart.payment = event.target.value;
  if (event.target.matches('[data-action="sale-discount"]')) { cart.discount = Math.max(0, Number(event.target.value || 0)); updateCartSummary(); }
});

document.addEventListener('input', event => {
  if (event.target instanceof Element && event.target.matches('[data-action="sale-discount"]')) {
    cart.discount = Math.max(0, Number(event.target.value || 0));
    updateCartSummary();
  }
});

document.querySelector('#menu-button')?.addEventListener('click', toggleMenu);
document.querySelector('#global-search')?.addEventListener('click', openCommand);
document.querySelector('#notifications-button')?.addEventListener('click', openNotifications);
document.querySelector('#command-query')?.addEventListener('input', event => commandSearch(event.target.value));
document.querySelector('#command-results')?.addEventListener('click', event => {
  if (!(event.target instanceof Element)) return;
  const item = event.target.closest('[data-command-view]');
  if (!item) return;
  closeCommand(); navigate(item.dataset.commandView);
  if (item.dataset.commandKind === 'Ordem') viewOrder(state.orders.find(order => order.id === item.dataset.commandId));
  if (item.dataset.commandKind === 'Cliente') viewCustomer(state.customers.find(customer => customer.id === item.dataset.commandId));
});
document.querySelector('#modal-backdrop')?.addEventListener('click', event => { if (event.target.id === 'modal-backdrop') closeModal(); });
document.querySelector('#command-backdrop')?.addEventListener('click', event => { if (event.target.id === 'command-backdrop') closeCommand(); });
document.addEventListener('keydown', event => {
  const settingsTab = event.target instanceof Element ? event.target.closest('[role="tab"][data-action="settings-tab"]') : null;
  if (settingsTab && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) {
    event.preventDefault();
    const currentIndex = SETTINGS_TABS.findIndex(tab => tab.id === settingsTab.dataset.tab);
    let nextIndex = currentIndex;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') nextIndex = (currentIndex + 1) % SETTINGS_TABS.length;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') nextIndex = (currentIndex - 1 + SETTINGS_TABS.length) % SETTINGS_TABS.length;
    if (event.key === 'Home') nextIndex = 0;
    if (event.key === 'End') nextIndex = SETTINGS_TABS.length - 1;
    activateSettingsTab(SETTINGS_TABS[nextIndex].id, { focus: true });
    return;
  }
  if (typeof cloudConnection !== 'undefined' && !cloudConnection.authenticated) return;
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); openCommand(); }
  if (event.key === 'Escape') { closeModal(); closeCommand(); closeNotifications(); closeMenu(); }
  if (event.key === 'Enter' && event.target.id === 'command-query') document.querySelector('#command-results .command-result')?.click();
  if (event.key === 'Enter' && event.target.id === 'company-document-name') { event.preventDefault(); handleCompanyDocumentUpload(); }
  if (event.key === 'Tab' && !document.querySelector('#modal-backdrop')?.hidden) {
    const focusable = [...document.querySelectorAll('#modal-backdrop button:not([disabled]), #modal-backdrop input:not([disabled]), #modal-backdrop select:not([disabled]), #modal-backdrop textarea:not([disabled]), #modal-backdrop a[href]')];
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }
});

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'hidden' || pendingStateRevision <= persistedStateRevision || !cloudConnection.authenticated) return;
  flushStateSave().catch(error => handleCloudError(error, { showAccessScreen: false }));
});

window.addEventListener?.('beforeunload', event => {
  if (!cloudConnection.authenticated || pendingStateRevision <= persistedStateRevision) return;
  event.preventDefault();
  event.returnValue = '';
});

bootstrapApplication();
