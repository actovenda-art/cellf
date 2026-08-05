const STORAGE_KEY = 'nexo-mobile-state-v1';

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
    { id: 'OS-1048', customer: 'André Martins', phone: '(11) 98842-1120', device: 'iPhone 13 Pro', imei: '356938035643809', issue: 'Tela sem imagem após queda', serviceId: 's1', value: 649, status: 'progress', createdAt: '2026-08-04', dueAt: '2026-08-06', reminderAt: '2026-08-06T10:00', reminder: 'Avisar quando a tela chegar do fornecedor' },
    { id: 'OS-1047', customer: 'Paula Oliveira', phone: '(11) 97654-8832', device: 'Galaxy S23', imei: '', issue: 'Não carrega', serviceId: 's2', value: null, status: 'analysis', createdAt: '2026-08-04', dueAt: '2026-08-07', reminderAt: '', reminder: '' },
    { id: 'OS-1046', customer: 'Ricardo Lima', phone: '(11) 96531-1209', device: 'Moto Edge 40', imei: '', issue: 'Troca de bateria', serviceId: 's3', value: 289, status: 'ready', createdAt: '2026-08-03', dueAt: '2026-08-05', reminderAt: '2026-08-05T16:30', reminder: 'Cliente pediu ligação, não WhatsApp' },
    { id: 'OS-1045', customer: 'Camila Rocha', phone: '(11) 99821-4431', device: 'iPhone 12', imei: '', issue: 'Falha intermitente no áudio', serviceId: 's4', value: 380, status: 'waiting', createdAt: '2026-08-02', dueAt: '2026-08-08', reminderAt: '2026-08-08T09:00', reminder: 'Confirmar aprovação do orçamento' },
    { id: 'OS-1044', customer: 'Lucas Mendes', phone: '(11) 98510-7756', device: 'Redmi Note 12', imei: '', issue: 'Oxidação por contato com água', serviceId: 's5', value: 149, status: 'progress', createdAt: '2026-08-01', dueAt: '2026-08-06', reminderAt: '', reminder: '' }
  ],
  payables: [
    { id: 'a1', description: 'Fornecedor de peças — Tela iPhone', supplier: 'Alpha Parts', category: 'Peças', amount: 1850, dueAt: '2026-08-05', paid: false },
    { id: 'a2', description: 'Aluguel da loja', supplier: 'Imobiliária Central', category: 'Fixo', amount: 3200, dueAt: '2026-08-10', paid: false },
    { id: 'a3', description: 'Internet empresarial', supplier: 'Vivo Empresas', category: 'Fixo', amount: 189.9, dueAt: '2026-08-12', paid: false },
    { id: 'a4', description: 'Embalagens e sacolas', supplier: 'PackMais', category: 'Insumos', amount: 340, dueAt: '2026-08-02', paid: true }
  ]
};

let state = loadState();
let currentView = 'dashboard';
const content = document.querySelector('#app-content');
const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const dateFmt = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' });
const statusMap = {
  analysis: ['Em análise', 'analysis'], progress: ['Em reparo', 'progress'], ready: ['Pronto', 'ready'], waiting: ['Aguardando', 'waiting']
};

function loadState() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || structuredClone(seed); }
  catch { return structuredClone(seed); }
}
function saveState() { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); refreshBadges(); }
function uid(prefix) { return `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2,5)}`; }
function esc(value = '') { return String(value).replace(/[&<>'"]/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[c])); }
function isoToday() { return new Date().toISOString().slice(0,10); }
function formatDate(value) { if (!value) return '—'; return dateFmt.format(new Date(`${value.slice(0,10)}T12:00:00`)).replace('.', ''); }
function statusLabel(status) { return statusMap[status]?.[0] || status; }
function serviceName(id) { return state.services.find(s => s.id === id)?.name || 'Serviço personalizado'; }
function pageHeading(eyebrow, title, subtitle, actions = '') {
  return `<div class="page-heading"><div><p class="eyebrow">${eyebrow}</p><h1>${title}</h1><p>${subtitle}</p></div>${actions ? `<div class="heading-actions">${actions}</div>` : ''}</div>`;
}

function renderDashboard() {
  const active = state.orders.filter(o => !['ready','delivered'].includes(o.status)).length;
  const ready = state.orders.filter(o => o.status === 'ready').length;
  const low = state.products.filter(p => p.stock <= p.minimum).length;
  const payable = state.payables.filter(p => !p.paid).reduce((sum,p) => sum + p.amount, 0);
  const recentOrders = [...state.orders].slice(0,5);
  const lowProducts = [...state.products].sort((a,b) => (a.stock/a.minimum)-(b.stock/b.minimum)).slice(0,4);
  const reminders = state.orders.filter(o => o.reminderAt && o.reminder).sort((a,b) => a.reminderAt.localeCompare(b.reminderAt)).slice(0,3);
  content.innerHTML = `
    ${pageHeading('QUARTA-FEIRA, 05 DE AGOSTO', 'Bom dia, Marcos.', 'Aqui está o pulso da sua operação hoje.')}
    <div class="stats-grid">
      ${statCard('ORDENS ATIVAS', active, '⌁', '<span class="trend">+2 esta semana</span>', true)}
      ${statCard('PRONTAS P/ RETIRADA', ready, '✓', ready ? 'Aguardando clientes' : 'Nenhuma no momento')}
      ${statCard('ESTOQUE BAIXO', low, '!', low ? 'Itens pedindo reposição' : 'Estoque saudável')}
      ${statCard('CONTAS EM ABERTO', brl.format(payable), '↘', `${state.payables.filter(p=>!p.paid).length} lançamentos`)}
    </div>
    <div class="dashboard-grid">
      <section class="card">
        <header class="card-header"><div><p class="eyebrow">MOVIMENTO RECENTE</p><h2>Ordens em andamento</h2></div><button class="text-button" data-view="orders">Ver todas →</button></header>
        <div class="orders-list">${recentOrders.map(orderRow).join('')}</div>
      </section>
      <section class="card imei-card">
        <div class="imei-inner"><div class="imei-icon">⌕</div><h2>Consulta rápida de IMEI</h2><p>Verifique a situação legal de um aparelho antes de recebê-lo ou revendê-lo.</p>
          <form class="imei-form" id="imei-form"><input id="imei-input" inputmode="numeric" maxlength="18" placeholder="Digite os 15 dígitos" aria-label="IMEI"><button aria-label="Consultar">→</button></form>
          <div class="imei-hint"><span>ⓘ</span><span>Integração segura via Infosimples / Anatel</span></div><div id="imei-result"></div>
        </div>
      </section>
    </div>
    <div class="bottom-grid">
      <section class="card"><header class="card-header"><div><p class="eyebrow">INVENTÁRIO</p><h2>Atenção ao estoque</h2></div><button class="text-button" data-view="products">Gerenciar →</button></header>
        <div class="stock-list">${lowProducts.map(stockRow).join('')}</div>
      </section>
      <section class="card"><header class="card-header"><div><p class="eyebrow">AGENDA</p><h2>Próximos lembretes</h2></div><button class="text-button" id="open-reminders">Ver central →</button></header>
        <div class="reminders">${reminders.length ? reminders.map(reminderRow).join('') : '<div class="table-empty">Nenhum lembrete agendado.</div>'}</div>
      </section>
    </div>`;
  document.querySelector('#imei-form').addEventListener('submit', consultImei);
  document.querySelector('#open-reminders')?.addEventListener('click', openNotifications);
}

function statCard(label, value, icon, caption, highlight = false) {
  return `<article class="stat-card ${highlight ? 'highlight' : ''}"><div class="stat-top"><span>${label}</span><span class="stat-icon">${icon}</span></div><strong class="stat-value">${value}</strong><span class="stat-caption">${caption}</span></article>`;
}
function orderRow(o) {
  const initials = o.device.split(' ').map(x=>x[0]).slice(0,2).join('');
  return `<div class="order-row"><div class="device-thumb">${esc(initials)}</div><div class="order-main"><strong>${esc(o.customer)}</strong><small>${esc(o.id)} · ${formatDate(o.createdAt)}</small></div><div class="order-device"><strong>${esc(o.device)}</strong><small>${esc(o.issue)}</small></div><span class="status ${statusMap[o.status]?.[1] || ''}">${statusLabel(o.status)}</span><strong class="money">${o.value == null ? 'A consultar' : brl.format(o.value)}</strong><button class="more-button" data-action="view-order" data-id="${o.id}">•••</button></div>`;
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
  content.innerHTML = `${pageHeading('INVENTÁRIO', 'Produtos & estoque', `${state.products.length} produtos cadastrados`, '<button class="ghost-button" data-action="stock-movement">↕ Movimentar estoque</button><button class="primary-button" data-action="new-product">＋ Novo produto</button>')}
  ${tableShell('products', `<option value="">Todas as categorias</option>${[...new Set(state.products.map(p=>p.category))].map(c=>`<option>${esc(c)}</option>`).join('')}`, productRows(state.products), productMobile(state.products))}`;
  bindTableFilter('products');
}
function productRows(list) {
  return `<thead><tr><th>PRODUTO</th><th>CATEGORIA</th><th>PREÇO</th><th>ESTOQUE</th><th>STATUS</th><th></th></tr></thead><tbody>${list.map(p=>`<tr><td><div class="cell-main"><span class="product-thumb">${esc(p.name[0])}</span><span><strong>${esc(p.name)}</strong><small>${esc(p.sku)}</small></span></div></td><td>${esc(p.category)}</td><td class="money">${brl.format(p.price)}</td><td>${p.stock} un.</td><td><span class="status ${p.stock <= p.minimum ? 'overdue':'ready'}">${p.stock <= p.minimum ? 'Estoque baixo':'Disponível'}</span></td><td><button class="more-button" data-action="edit-product" data-id="${p.id}">•••</button></td></tr>`).join('')}</tbody>`;
}
function productMobile(list) { return list.map(p=>`<article class="mobile-card"><div class="mobile-card-top"><div><strong>${esc(p.name)}</strong><small>${esc(p.sku)} · ${esc(p.category)}</small></div><button class="more-button" data-action="edit-product" data-id="${p.id}">•••</button></div><div class="mobile-card-bottom"><span>${p.stock} un.</span><strong>${brl.format(p.price)}</strong></div></article>`).join(''); }

function renderServices() {
  content.innerHTML = `${pageHeading('CATÁLOGO', 'Serviços', `${state.services.filter(s=>s.active).length} serviços ativos`, '<button class="primary-button" data-action="new-service">＋ Novo serviço</button>')}
  ${tableShell('services', '<option value="">Todos os preços</option><option value="fixed">Preço fixo</option><option value="quote">A consultar</option>', serviceRows(state.services), serviceMobile(state.services))}`;
  bindTableFilter('services');
}
function serviceRows(list) { return `<thead><tr><th>SERVIÇO</th><th>CATEGORIA</th><th>COBRANÇA</th><th>DURAÇÃO</th><th>STATUS</th><th></th></tr></thead><tbody>${list.map(s=>`<tr><td><div class="cell-main"><span class="product-thumb">⌁</span><span><strong>${esc(s.name)}</strong><small>${esc(s.id.toUpperCase())}</small></span></div></td><td>${esc(s.category)}</td><td class="money">${s.pricing === 'fixed' ? brl.format(s.price) : 'A consultar'}</td><td>${s.duration} min</td><td><span class="status ${s.active ? 'ready':'waiting'}">${s.active?'Ativo':'Inativo'}</span></td><td><button class="more-button" data-action="edit-service" data-id="${s.id}">•••</button></td></tr>`).join('')}</tbody>`; }
function serviceMobile(list) { return list.map(s=>`<article class="mobile-card"><div class="mobile-card-top"><div><strong>${esc(s.name)}</strong><small>${esc(s.category)} · ${s.duration} min</small></div><button class="more-button" data-action="edit-service" data-id="${s.id}">•••</button></div><div class="mobile-card-bottom"><span class="status ${s.active?'ready':'waiting'}">${s.active?'Ativo':'Inativo'}</span><strong>${s.pricing==='fixed'?brl.format(s.price):'A consultar'}</strong></div></article>`).join(''); }

function renderOrders() {
  content.innerHTML = `${pageHeading('ASSISTÊNCIA TÉCNICA', 'Ordens de serviço', `${state.orders.length} ordens registradas`, '<button class="primary-button" data-action="new-order">＋ Nova ordem</button>')}
  ${tableShell('orders', '<option value="">Todos os status</option><option value="analysis">Em análise</option><option value="progress">Em reparo</option><option value="ready">Pronto</option><option value="waiting">Aguardando</option>', orderRows(state.orders), orderMobile(state.orders))}`;
  bindTableFilter('orders');
}
function orderRows(list) { return `<thead><tr><th>ORDEM / CLIENTE</th><th>APARELHO</th><th>SERVIÇO</th><th>ENTREGA</th><th>VALOR</th><th>STATUS</th><th></th></tr></thead><tbody>${list.map(o=>`<tr><td><div class="cell-main"><span class="product-thumb">${esc(o.id.slice(-2))}</span><span><strong>${esc(o.customer)}</strong><small>${esc(o.id)} · ${esc(o.phone)}</small></span></div></td><td><strong>${esc(o.device)}</strong><br><small>${esc(o.issue)}</small></td><td>${esc(serviceName(o.serviceId))}</td><td>${formatDate(o.dueAt)}</td><td class="money">${o.value == null?'A consultar':brl.format(o.value)}</td><td><select class="inline-status" data-action="order-status" data-id="${o.id}">${Object.entries(statusMap).map(([v,x])=>`<option value="${v}" ${o.status===v?'selected':''}>${x[0]}</option>`).join('')}</select></td><td><button class="more-button" data-action="view-order" data-id="${o.id}">•••</button></td></tr>`).join('')}</tbody>`; }
function orderMobile(list) { return list.map(o=>`<article class="mobile-card"><div class="mobile-card-top"><div><strong>${esc(o.customer)}</strong><small>${esc(o.id)} · ${esc(o.device)}</small></div><button class="more-button" data-action="view-order" data-id="${o.id}">•••</button></div><div class="mobile-card-bottom"><span class="status ${statusMap[o.status]?.[1]}">${statusLabel(o.status)}</span><strong>${o.value==null?'A consultar':brl.format(o.value)}</strong></div></article>`).join(''); }

function renderPayables() {
  const open = state.payables.filter(p=>!p.paid).reduce((s,p)=>s+p.amount,0);
  content.innerHTML = `${pageHeading('FINANCEIRO', 'Contas a pagar', `${brl.format(open)} em aberto`, '<button class="primary-button" data-action="new-payable">＋ Nova conta</button>')}
  ${tableShell('payables', '<option value="">Todos os status</option><option value="open">Em aberto</option><option value="paid">Pago</option>', payableRows(state.payables), payableMobile(state.payables))}`;
  bindTableFilter('payables');
}
function payableRows(list) { return `<thead><tr><th>DESCRIÇÃO</th><th>FORNECEDOR</th><th>CATEGORIA</th><th>VENCIMENTO</th><th>VALOR</th><th>STATUS</th><th></th></tr></thead><tbody>${list.map(p=>`<tr><td><div class="cell-main"><span class="product-thumb">↘</span><span><strong>${esc(p.description)}</strong><small>${esc(p.id.toUpperCase())}</small></span></div></td><td>${esc(p.supplier)}</td><td>${esc(p.category)}</td><td>${formatDate(p.dueAt)}</td><td class="money">${brl.format(p.amount)}</td><td><span class="status ${p.paid?'paid':(p.dueAt<isoToday()?'overdue':'waiting')}">${p.paid?'Pago':(p.dueAt<isoToday()?'Vencida':'Em aberto')}</span></td><td><button class="more-button" data-action="toggle-payable" data-id="${p.id}" title="${p.paid?'Reabrir':'Marcar como paga'}">${p.paid?'↶':'✓'}</button></td></tr>`).join('')}</tbody>`; }
function payableMobile(list) { return list.map(p=>`<article class="mobile-card"><div class="mobile-card-top"><div><strong>${esc(p.description)}</strong><small>${esc(p.supplier)} · vence ${formatDate(p.dueAt)}</small></div><button class="more-button" data-action="toggle-payable" data-id="${p.id}">${p.paid?'↶':'✓'}</button></div><div class="mobile-card-bottom"><span class="status ${p.paid?'paid':'waiting'}">${p.paid?'Pago':'Em aberto'}</span><strong>${brl.format(p.amount)}</strong></div></article>`).join(''); }

function tableShell(type, options, rows, mobile) {
  return `<section class="table-card"><div class="table-toolbar"><label class="filter-search"><span>⌕</span><input data-filter-query="${type}" placeholder="Buscar nesta lista..."></label><div class="filter-group"><select data-filter-select="${type}">${options}</select></div></div><table class="data-table" data-table="${type}">${rows}</table><div class="mobile-cards" data-mobile="${type}">${mobile}</div></section>`;
}
function bindTableFilter(type) {
  const input = document.querySelector(`[data-filter-query="${type}"]`);
  const select = document.querySelector(`[data-filter-select="${type}"]`);
  const update = () => {
    const q = input.value.toLowerCase().trim(), f = select.value;
    let list = state[type].filter(item => Object.values(item).join(' ').toLowerCase().includes(q));
    if (f) {
      if (type==='products') list = list.filter(x=>x.category===f);
      if (type==='services') list = list.filter(x=>x.pricing===f);
      if (type==='orders') list = list.filter(x=>x.status===f);
      if (type==='payables') list = list.filter(x=>f==='paid'?x.paid:!x.paid);
    }
    const renderers = { products:[productRows,productMobile], services:[serviceRows,serviceMobile], orders:[orderRows,orderMobile], payables:[payableRows,payableMobile] }[type];
    document.querySelector(`[data-table="${type}"]`).innerHTML = renderers[0](list);
    document.querySelector(`[data-mobile="${type}"]`).innerHTML = renderers[1](list) || '<div class="table-empty">Nenhum resultado.</div>';
  };
  input.addEventListener('input', update); select.addEventListener('change', update);
}

function renderReports() {
  content.innerHTML = `${pageHeading('ANÁLISES', 'Relatórios', 'Uma base pronta para os próximos módulos')}
  <section class="card report-placeholder"><div><div class="big-symbol">↗</div><h2>Relatórios entram na próxima etapa</h2><p>Após conectar o Supabase, esta área poderá consolidar faturamento, margem por serviço, giro de estoque, produtividade e fluxo de caixa com dados reais.</p><button class="ghost-button" data-view="dashboard">Voltar à visão geral</button></div></section>`;
}

function navigate(view) {
  currentView = view;
  const labels = { dashboard:'Visão geral', orders:'Ordens de serviço', products:'Produtos & estoque', services:'Catálogo de serviços', payables:'Contas a pagar', reports:'Relatórios' };
  document.querySelectorAll('.nav-item').forEach(b=>b.classList.toggle('active',b.dataset.view===view));
  document.querySelector('#current-view-label').textContent = labels[view];
  document.querySelector('#sidebar').classList.remove('open');
  ({ dashboard:renderDashboard, products:renderProducts, services:renderServices, orders:renderOrders, payables:renderPayables, reports:renderReports }[view] || renderDashboard)();
  window.scrollTo({top:0,behavior:'smooth'});
}

function openModal(title, eyebrow, body) {
  document.querySelector('#modal-title').textContent = title;
  document.querySelector('#modal-eyebrow').textContent = eyebrow;
  document.querySelector('#modal-body').innerHTML = body;
  document.querySelector('#modal-backdrop').hidden = false;
  setTimeout(()=>document.querySelector('#modal-body input, #modal-body select')?.focus(), 30);
}
function closeModal() { document.querySelector('#modal-backdrop').hidden = true; }
function formActions(label='Salvar cadastro') { return `<div class="form-actions"><button type="button" class="ghost-button" data-action="close-modal">Cancelar</button><button class="primary-button" type="submit">${label}</button></div>`; }

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
    if(product.id) state.products=state.products.map(x=>x.id===product.id?record:x); else state.products.unshift(record);
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
  const toggle=()=>document.querySelector('#price-field').style.opacity=document.querySelector('#pricing-select').value==='quote'?'.4':'1'; toggle(); document.querySelector('#pricing-select').addEventListener('change',toggle);
  document.querySelector('#service-form').addEventListener('submit',e=>{
    e.preventDefault(); const fd=new FormData(e.target), data=Object.fromEntries(fd); const pricing=data.pricing;
    const record={id:service.id||uid('s'),name:data.name.trim(),category:data.category.trim(),pricing,price:pricing==='fixed'?Number(data.price||0):null,duration:Number(data.duration),active:fd.has('active')};
    if(service.id) state.services=state.services.map(x=>x.id===service.id?record:x); else state.services.unshift(record);
    saveState();closeModal();navigate('services');toast(service.id?'Serviço atualizado.':'Serviço cadastrado.','success');
  });
}
function orderModal() {
  const next = Math.max(1000,...state.orders.map(o=>Number(o.id.replace(/\D/g,''))||0))+1;
  openModal('Nova ordem de serviço','ASSISTÊNCIA TÉCNICA',`<form id="order-form" class="form-grid">
    <div class="field"><label>CLIENTE *</label><input name="customer" required placeholder="Nome completo"></div><div class="field"><label>TELEFONE *</label><input name="phone" required placeholder="(11) 99999-9999"></div>
    <div class="field"><label>APARELHO *</label><input name="device" required placeholder="Ex.: iPhone 13 Pro"></div><div class="field"><label>IMEI</label><input name="imei" inputmode="numeric" maxlength="15" placeholder="15 dígitos"></div>
    <div class="field full"><label>DEFEITO RELATADO *</label><textarea name="issue" required placeholder="Descreva o problema informado pelo cliente..."></textarea></div>
    <div class="form-section"><h3>Serviço e prazo</h3></div>
    <div class="field full"><label>SERVIÇO *</label><select name="serviceId" id="order-service" required><option value="">Selecione...</option>${state.services.filter(s=>s.active).map(s=>`<option value="${s.id}" data-price="${s.price??''}">${esc(s.name)} — ${s.pricing==='fixed'?brl.format(s.price):'A consultar'}</option>`).join('')}</select></div>
    <div class="field"><label>VALOR ACORDADO (R$)</label><input name="value" id="order-value" type="number" min="0" step="0.01" placeholder="Deixe vazio se a consultar"></div><div class="field"><label>PREVISÃO DE ENTREGA *</label><input name="dueAt" type="date" required value="${isoToday()}"></div>
    <div class="form-section"><h3>Lembrete opcional</h3></div>
    <div class="field full"><label>LEMBRETE</label><input name="reminder" placeholder="Ex.: Avisar o cliente quando a peça chegar"></div><div class="field full"><label>DATA E HORA DO LEMBRETE</label><input name="reminderAt" type="datetime-local"></div>
    ${formActions('Criar ordem')}</form>`);
  document.querySelector('#order-service').addEventListener('change',e=>{const price=e.target.selectedOptions[0]?.dataset.price;if(price)document.querySelector('#order-value').value=price;});
  document.querySelector('#order-form').addEventListener('submit',e=>{
    e.preventDefault();const d=Object.fromEntries(new FormData(e.target));
    state.orders.unshift({id:`OS-${next}`,customer:d.customer.trim(),phone:d.phone.trim(),device:d.device.trim(),imei:d.imei.replace(/\D/g,''),issue:d.issue.trim(),serviceId:d.serviceId,value:d.value===''?null:Number(d.value),status:'analysis',createdAt:isoToday(),dueAt:d.dueAt,reminderAt:d.reminderAt,reminder:d.reminder.trim()});
    saveState();closeModal();navigate('orders');toast(`Ordem OS-${next} criada.`, 'success');
  });
}
function payableModal() {
  openModal('Nova conta a pagar','FINANCEIRO',`<form id="payable-form" class="form-grid"><div class="field full"><label>DESCRIÇÃO *</label><input name="description" required placeholder="Ex.: Compra de peças"></div><div class="field"><label>FORNECEDOR *</label><input name="supplier" required placeholder="Nome do fornecedor"></div><div class="field"><label>CATEGORIA *</label><input name="category" required placeholder="Peças, fixo, insumos..."></div><div class="field"><label>VALOR (R$) *</label><input name="amount" type="number" min="0" step="0.01" required></div><div class="field"><label>VENCIMENTO *</label><input name="dueAt" type="date" required value="${isoToday()}"></div>${formActions('Cadastrar conta')}</form>`);
  document.querySelector('#payable-form').addEventListener('submit',e=>{e.preventDefault();const d=Object.fromEntries(new FormData(e.target));state.payables.unshift({id:uid('a'),description:d.description.trim(),supplier:d.supplier.trim(),category:d.category.trim(),amount:Number(d.amount),dueAt:d.dueAt,paid:false});saveState();closeModal();navigate('payables');toast('Conta cadastrada.','success');});
}
function stockModal() {
  openModal('Movimentar estoque','INVENTÁRIO',`<form id="stock-form" class="form-grid"><div class="field full"><label>PRODUTO *</label><select name="productId" required><option value="">Selecione...</option>${state.products.map(p=>`<option value="${p.id}">${esc(p.name)} — atual: ${p.stock}</option>`).join('')}</select></div><div class="field"><label>TIPO *</label><select name="type"><option value="in">Entrada</option><option value="out">Saída</option><option value="adjust">Definir saldo</option></select></div><div class="field"><label>QUANTIDADE *</label><input name="quantity" type="number" min="0" required></div><div class="field full"><label>MOTIVO / OBSERVAÇÃO</label><input name="reason" placeholder="Ex.: Compra do fornecedor ou venda balcão"></div>${formActions('Confirmar movimento')}</form>`);
  document.querySelector('#stock-form').addEventListener('submit',e=>{e.preventDefault();const d=Object.fromEntries(new FormData(e.target)),p=state.products.find(x=>x.id===d.productId),q=Number(d.quantity);if(d.type==='in')p.stock+=q;if(d.type==='out')p.stock=Math.max(0,p.stock-q);if(d.type==='adjust')p.stock=q;saveState();closeModal();navigate('products');toast('Estoque atualizado.','success');});
}
function viewOrder(order) {
  openModal(order.id,'DETALHES DA ORDEM',`<div class="form-grid"><div class="field"><label>CLIENTE</label><strong>${esc(order.customer)}</strong><span class="field-help">${esc(order.phone)}</span></div><div class="field"><label>APARELHO</label><strong>${esc(order.device)}</strong><span class="field-help">IMEI: ${esc(order.imei||'não informado')}</span></div><div class="field full"><label>DEFEITO RELATADO</label><p style="margin:0;font-size:11px;line-height:1.6">${esc(order.issue)}</p></div><div class="field full"><label>SERVIÇO</label><strong>${esc(serviceName(order.serviceId))}</strong></div><div class="field"><label>VALOR</label><strong>${order.value==null?'A consultar':brl.format(order.value)}</strong></div><div class="field"><label>PREVISÃO</label><strong>${formatDate(order.dueAt)}</strong></div>${order.reminder?`<div class="field full" style="background:var(--orange-soft);padding:13px;border-radius:11px"><label>LEMBRETE</label><strong>${esc(order.reminder)}</strong><span class="field-help">${new Date(order.reminderAt).toLocaleString('pt-BR')}</span></div>`:''}<div class="form-actions"><button class="ghost-button" data-action="close-modal">Fechar</button></div></div>`);
}

async function consultImei(event) {
  event.preventDefault(); const input=document.querySelector('#imei-input'), result=document.querySelector('#imei-result'); const imei=input.value.replace(/\D/g,'');
  result.className='imei-result'; result.innerHTML='Consultando a base da Anatel…';
  try { const response=await fetch('/api/imei',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({imei})}); const payload=await response.json(); if(!response.ok)throw payload; const data=payload.data?.[0]||payload.data||payload; result.innerHTML=`<strong>Consulta concluída</strong><br>${esc(data.resultado||data.result||'Resposta recebida da Infosimples.')}<br><small>IMEI ${esc(imei)}</small>`; }
  catch(error) { result.innerHTML=`<strong>${error.code==='IMEI_API_NOT_CONFIGURED'?'Integração aguardando token':'Não foi possível consultar'}</strong><br>${esc(error.message||'Revise o IMEI e tente novamente.')}`; }
}

function openNotifications() {
  const list=state.orders.filter(o=>o.reminder&&o.reminderAt).sort((a,b)=>a.reminderAt.localeCompare(b.reminderAt));
  document.querySelector('#notification-list').innerHTML=list.length?list.map(o=>`<article class="drawer-item"><strong>${esc(o.customer)} · ${esc(o.id)}</strong><p>${esc(o.reminder)}</p><time>${new Date(o.reminderAt).toLocaleString('pt-BR')}</time></article>`).join(''):'<div class="table-empty">Nenhum lembrete agendado.</div>';
  document.querySelector('#notification-drawer').classList.add('open');document.querySelector('#notification-drawer').setAttribute('aria-hidden','false');
}
function closeNotifications(){document.querySelector('#notification-drawer').classList.remove('open');document.querySelector('#notification-drawer').setAttribute('aria-hidden','true');}
function openCommand() { document.querySelector('#command-backdrop').hidden=false; const input=document.querySelector('#command-query');input.value='';commandSearch('');setTimeout(()=>input.focus(),20); }
function closeCommand(){document.querySelector('#command-backdrop').hidden=true;}
function commandSearch(query) {
  const q=query.toLowerCase().trim(); let items=[...state.orders.map(x=>({kind:'Ordem',title:`${x.id} · ${x.customer}`,sub:`${x.device} · ${x.imei||x.phone}`,view:'orders'})),...state.products.map(x=>({kind:'Produto',title:x.name,sub:`${x.sku} · ${x.stock} em estoque`,view:'products'})),...state.services.map(x=>({kind:'Serviço',title:x.name,sub:x.category,view:'services'}))];
  if(q)items=items.filter(x=>(x.title+x.sub).toLowerCase().includes(q));items=items.slice(0,8);
  document.querySelector('#command-results').innerHTML=items.length?items.map(x=>`<button class="command-result" data-command-view="${x.view}"><span><strong>${esc(x.title)}</strong><small>${esc(x.sub)}</small></span><span class="command-kind">${x.kind}</span></button>`).join(''):'<div class="table-empty">Nenhum resultado encontrado.</div>';
}
function toast(message,type='success'){const el=document.createElement('div');el.className=`toast ${type}`;el.textContent=message;document.querySelector('#toast-region').append(el);setTimeout(()=>el.remove(),3200);}
function refreshBadges(){const active=state.orders.filter(o=>!['ready','delivered'].includes(o.status)).length;document.querySelector('#nav-orders-count').textContent=active;const reminders=state.orders.filter(o=>o.reminder&&o.reminderAt).length;document.querySelector('#notification-dot').style.display=reminders?'block':'none';}

document.addEventListener('click',event=>{
  const view=event.target.closest('[data-view]')?.dataset.view;if(view){navigate(view);return;}
  const button=event.target.closest('[data-action]');if(!button)return;const {action,id}=button.dataset;
  if(action==='close-modal')closeModal();
  if(action==='new-product')productModal();
  if(action==='edit-product')productModal(state.products.find(x=>x.id===id));
  if(action==='new-service')serviceModal();
  if(action==='edit-service')serviceModal(state.services.find(x=>x.id===id));
  if(action==='new-order')orderModal();
  if(action==='view-order')viewOrder(state.orders.find(x=>x.id===id));
  if(action==='new-payable')payableModal();
  if(action==='stock-movement')stockModal();
  if(action==='toggle-payable'){const p=state.payables.find(x=>x.id===id);p.paid=!p.paid;saveState();navigate('payables');toast(p.paid?'Conta marcada como paga.':'Conta reaberta.');}
  if(action==='close-notifications')closeNotifications();
});
document.addEventListener('change',event=>{if(event.target.matches('[data-action="order-status"]')){const o=state.orders.find(x=>x.id===event.target.dataset.id);o.status=event.target.value;saveState();toast('Status da ordem atualizado.');}});
document.querySelector('#menu-button').addEventListener('click',()=>document.querySelector('#sidebar').classList.toggle('open'));
document.querySelector('#global-search').addEventListener('click',openCommand);
document.querySelector('#notifications-button').addEventListener('click',openNotifications);
document.querySelector('#command-query').addEventListener('input',e=>commandSearch(e.target.value));
document.querySelector('#command-results').addEventListener('click',e=>{const view=e.target.closest('[data-command-view]')?.dataset.commandView;if(view){closeCommand();navigate(view);}});
document.querySelector('#modal-backdrop').addEventListener('click',e=>{if(e.target.id==='modal-backdrop')closeModal();});
document.querySelector('#command-backdrop').addEventListener('click',e=>{if(e.target.id==='command-backdrop')closeCommand();});
document.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){e.preventDefault();openCommand();}if(e.key==='Escape'){closeModal();closeCommand();closeNotifications();}});

refreshBadges();
navigate('dashboard');
