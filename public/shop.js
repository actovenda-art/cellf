/* CELLF storefront and customer area. Cart state is intentionally memory-only. */
(() => {
  const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
  const date = value => value ? new Date(value).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '—';
  const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[char]);
  const cart = new Map();
  let catalog = { products: [], ratings: {}, deliverySlots: [], deliveryEnabled: false };
  let session = { signedIn: false };
  let mountId = 0;
  let accountTab = 'purchases';
  let checkoutAfterAuth = false;
  const $ = selector => document.querySelector(selector);

  async function request(operation, options = {}) {
    const { query, ...requestOptions } = options;
    const params = new URLSearchParams({ operation, ...(query || {}) });
    const response = await fetch(`/api/shop?${params}`, { credentials: 'same-origin', cache: 'no-store', headers: { Accept: 'application/json', ...(requestOptions.body ? { 'Content-Type': 'application/json' } : {}) }, ...requestOptions });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || 'Não foi possível concluir agora. Tente novamente.');
    return data;
  }
  const post = (operation, body) => request(operation, { method: 'POST', body: JSON.stringify(body) });
  function error(target, value) { const node = $(target); if (node) { node.textContent = value || ''; node.hidden = !value; } }
  function toast(value) { error('#shop-message', value); $('#shop-message')?.scrollIntoView({ block: 'nearest' }); }
  function itemCount() { return [...cart.values()].reduce((sum, quantity) => sum + quantity, 0); }
  function total() { return [...cart].reduce((sum, [id, quantity]) => sum + (catalog.products.find(product => product.id === id)?.price || 0) * quantity, 0); }
  function productVisual(product) {
    const label = String(product.category || 'CELLF').slice(0, 18).toUpperCase();
    return `<div class="shop-product-visual" aria-hidden="true"><span>${escape(label)}</span><svg viewBox="0 0 96 96" fill="none"><rect x="28" y="8" width="40" height="80" rx="9" stroke="currentColor" stroke-width="4"/><path d="M39 16h18M42 79h12" stroke="currentColor" stroke-width="3" stroke-linecap="round"/><circle cx="48" cy="47" r="12" stroke="currentColor" stroke-width="3"/><path d="M48 40v14m-7-7h14" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg></div>`;
  }
  function productCards() {
    const list = $('#shop-products');
    if (!list) return;
    list.innerHTML = catalog.products.length ? catalog.products.map(product => {
      const votes = catalog.ratings[product.id] || { positive: 0, negative: 0 };
      return `<article class="shop-product-card">${productVisual(product)}<div class="shop-product-body"><p class="shop-category">${escape(product.category)}</p><h3>${escape(product.name)}</h3><p class="shop-description">${escape(product.description || 'Selecionado para cuidar do seu dia a dia.')}</p><div class="shop-votes" aria-label="${votes.positive} pessoas gostaram e ${votes.negative} não gostaram"><span>♥ ${votes.positive}</span><span>− ${votes.negative}</span></div><div class="shop-product-bottom"><strong>${money.format(product.price)}</strong><button class="shop-add" type="button" data-shop-add="${escape(product.id)}" aria-label="Adicionar ${escape(product.name)} ao carrinho">Adicionar <span aria-hidden="true">＋</span></button></div></div></article>`;
    }).join('') : '<div class="shop-empty"><span aria-hidden="true">⌁</span><h3>Produtos em preparação</h3><p>A equipe está selecionando os itens disponíveis para compra online. Volte em breve.</p></div>';
  }
  function renderCart() {
    const badge = $('#shop-cart-count');
    if (badge) badge.textContent = String(itemCount());
    const list = $('#shop-cart-items');
    if (!list) return;
    const rows = [...cart].map(([id, quantity]) => ({ product: catalog.products.find(entry => entry.id === id), quantity })).filter(row => row.product);
    list.innerHTML = rows.length ? rows.map(({ product, quantity }) => `<div class="shop-cart-row"><div><strong>${escape(product.name)}</strong><small>${money.format(product.price)} cada</small></div><div class="shop-quantity"><button type="button" data-shop-quantity="${escape(product.id)}" data-delta="-1" aria-label="Remover uma unidade de ${escape(product.name)}">−</button><span>${quantity}</span><button type="button" data-shop-quantity="${escape(product.id)}" data-delta="1" aria-label="Adicionar uma unidade de ${escape(product.name)}">＋</button></div><strong>${money.format(product.price * quantity)}</strong></div>`).join('') : '<p class="shop-cart-empty">Seu carrinho está vazio. Escolha um produto da vitrine.</p>';
    $('#shop-cart-total').textContent = money.format(total());
    $('#shop-start-checkout').disabled = !rows.length;
  }
  function renderAccountButton() {
    const button = $('#shop-account-button');
    if (!button) return;
    button.textContent = session.signedIn ? `Olá, ${String(session.account.name).split(' ')[0]} ↗` : 'Minha conta ↗';
    $('#shop-quote-name')?.setAttribute('value', session.signedIn ? session.account.name : '');
  }
  function show(dialog) { dialog?.showModal(); }
  function authDialog(afterCheckout = false) {
    checkoutAfterAuth = afterCheckout;
    show($('#shop-auth-dialog'));
    $('#shop-auth-cpf')?.focus();
  }
  function maybeOpenAccount() { if (!session.signedIn) return authDialog(); renderAccount(); show($('#shop-account-dialog')); }
  function accountRecordCard(record, type) {
    const isSale = type === 'sale';
    const start = isSale ? record.paidAt : record.deliveredAt;
    const warrantyDays = Number(record.warrantyDays || 0);
    const expiry = start && warrantyDays ? new Date(new Date(start).getTime() + warrantyDays * 86400000) : null;
    const remaining = expiry ? Math.max(0, Math.ceil((expiry.getTime() - Date.now()) / 86400000)) : 0;
    const warranty = expiry ? remaining ? `${remaining} dias de garantia restantes · até ${date(expiry)}` : `Garantia encerrada em ${date(expiry)}` : start ? 'Sem garantia adicional registrada' : 'Garantia começa após a entrega ou confirmação do pagamento';
    const items = isSale ? record.items : record.parts;
    const eligible = isSale ? record.status === 'paid' : record.status === 'delivered';
    const ratingMarkup = eligible ? items.map(item => {
      const current = session.ratings?.find(r => r.sourceType === type && r.sourceId === record.id && r.productId === item.productId);
      return `<form class="shop-rating-form" data-source-type="${type}" data-source-id="${escape(record.id)}" data-product-id="${escape(item.productId)}"><label><span>Avaliar ${escape(item.name)}</span><select name="stars" aria-label="Estrelas para ${escape(item.name)}"><option value="">Escolha estrelas</option>${[1,2,3,4,5].map(stars => `<option value="${stars}" ${current?.stars === stars ? 'selected' : ''}>${'★'.repeat(stars)}${'☆'.repeat(5 - stars)}</option>`).join('')}</select></label><label class="shop-rating-comment"><span>Comentário privado (opcional)</span><input name="comment" maxlength="500" value="${escape(current?.comment || '')}" placeholder="Ex.: Está durando bastante!"></label><button type="submit">Salvar avaliação</button></form>`;
    }).join('') : '';
    return `<article class="shop-history-card"><div class="shop-history-top"><div><small>${isSale ? 'COMPRA' : 'ORDEM DE SERVIÇO'} · ${escape(record.id)}</small><h3>${isSale ? escape(record.items.map(item => item.name).join(', ')) : escape(record.device)}</h3></div><strong>${isSale ? money.format(record.total) : record.value == null ? 'A consultar' : money.format(record.value)}</strong></div><p>${date(record.createdAt)} · ${escape(record.status || 'Em andamento')}</p><div class="shop-warranty">${escape(warranty)}</div>${ratingMarkup}</article>`;
  }
  function renderAccount() {
    if (!session.signedIn) return;
    const title = $('#shop-account-title'); if (title) title.textContent = `Olá, ${session.account.name.split(' ')[0]}`;
    const tabs = [...document.querySelectorAll('[data-shop-account-tab]')];
    for (const button of tabs) button.setAttribute('aria-selected', String(button.dataset.shopAccountTab === accountTab));
    const body = $('#shop-account-body');
    if (!body) return;
    if (accountTab === 'purchases') {
      body.innerHTML = `<h3>Minhas compras e encomendas</h3>${session.sales?.length ? session.sales.map(sale => accountRecordCard(sale, 'sale')).join('') : '<p class="shop-account-empty">Nenhuma compra nesta conta ainda.</p>'}${session.quotes?.length ? `<h3>Orçamentos solicitados</h3>${session.quotes.map(quote => `<div class="shop-quote-line"><strong>${escape(quote.model)}</strong><span>${date(quote.createdAt)} · ${escape(quote.status === 'new' ? 'Recebido' : quote.status)}</span></div>`).join('')}` : ''}`;
    } else if (accountTab === 'orders') {
      body.innerHTML = `<h3>Minhas ordens e garantias</h3>${session.approved ? session.orders?.length ? session.orders.map(order => accountRecordCard(order, 'order')).join('') : '<p class="shop-account-empty">Nenhuma ordem vinculada ao seu CPF.</p>' : '<div class="shop-approval-note"><strong>Histórico aguardando aprovação</strong><p>Para proteger seus dados, o proprietário precisa confirmar sua identidade antes de liberar ordens e compras registradas anteriormente com este CPF. As compras feitas nesta conta já aparecem normalmente.</p></div>'}`;
    } else {
      const products = session.sales?.filter(sale => sale.status === 'paid').length || 0;
      const services = session.orders?.filter(order => order.status === 'delivered').length || 0;
      const sum = products + services;
      const percentage = sum ? Math.round(products / sum * 100) : 0;
      body.innerHTML = `<h3>Relatório das suas utilizações</h3><p>Distribuição por atendimento concluído: compras de produtos e serviços concluídos.</p><div class="shop-report"><div class="shop-pie" style="--shop-product-share:${percentage}%" role="img" aria-label="${percentage}% produtos e ${100 - percentage}% serviços"><span>${sum}</span><small>utilizações</small></div><div class="shop-report-legend"><p><i class="shop-legend-product"></i><strong>Produtos</strong><span>${products} · ${percentage}%</span></p><p><i class="shop-legend-service"></i><strong>Serviços</strong><span>${services} · ${sum ? 100 - percentage : 0}%</span></p></div></div>`;
    }
    body.querySelectorAll('.shop-rating-form').forEach(form => form.addEventListener('submit', submitRating));
  }
  async function submitRating(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    try {
      await post('rate', { sourceType: form.dataset.sourceType, sourceId: form.dataset.sourceId, productId: form.dataset.productId, stars: Number(data.get('stars')), comment: String(data.get('comment') || '') });
      session = await request('session'); catalog = await request('catalog'); productCards(); renderAccount();
      error('#shop-account-message', 'Avaliação salva. O texto fica privado; a vitrine mostra somente quantas pessoas gostaram ou não gostaram.');
    } catch (problem) { error('#shop-account-message', problem.message); }
  }
  function renderDeliveryFields() {
    const delivery = $('#shop-fulfillment')?.value === 'delivery';
    const fields = $('#shop-delivery-fields'); if (!fields) return;
    fields.hidden = !delivery;
    fields.querySelectorAll('input, select').forEach(input => { input.required = delivery && !['complement', 'neighborhood', 'reference'].includes(input.name); });
    error('#shop-delivery-price', delivery ? (catalog.deliveryEnabled ? 'Informe o endereço para calcular a rota e o frete.' : 'Entrega indisponível até o proprietário configurar Google Maps e preço por km.') : 'Retirada na loja · sem frete.');
  }
  function checkoutDialog() {
    if (!itemCount()) return;
    if (!session.signedIn) return authDialog(true);
    $('#shop-checkout-items').textContent = `${itemCount()} ${itemCount() === 1 ? 'item' : 'itens'} · ${money.format(total())}`;
    const select = $('#shop-delivery-slot');
    select.innerHTML = `<option value="">Escolha um horário</option>${catalog.deliverySlots.map(slot => `<option value="${escape(slot.id)}">${date(slot.date + 'T12:00:00-03:00')} · ${escape(slot.start)}–${escape(slot.end)} (${slot.remaining} disponível${slot.remaining === 1 ? '' : 'is'})</option>`).join('')}`;
    renderDeliveryFields(); show($('#shop-checkout-dialog'));
  }
  async function calculateDelivery(form) {
    const data = Object.fromEntries(new FormData(form));
    const address = { postalCode: data.postalCode, street: data.street, number: data.number, complement: data.complement, neighborhood: data.neighborhood, city: data.city, state: data.state, reference: data.reference };
    const price = await post('delivery-quote', { address });
    error('#shop-delivery-price', `Rota de ${price.km.toLocaleString('pt-BR')} km · frete ${money.format(price.fee)} (${money.format(price.rate)}/km). Total ${money.format(total() + price.fee)}.`);
    return address;
  }
  async function submitCheckout(event) {
    event.preventDefault();
    const form = event.currentTarget, button = form.querySelector('button[type=submit]');
    button.disabled = true; error('#shop-checkout-message', 'Preparando pagamento seguro…');
    try {
      const fulfillment = $('#shop-fulfillment').value;
      const address = fulfillment === 'delivery' ? await calculateDelivery(form) : null;
      const result = await post('checkout', { items: [...cart].map(([productId, quantity]) => ({ productId, quantity })), fulfillment, address, deliverySlotId: fulfillment === 'delivery' ? $('#shop-delivery-slot').value : '' });
      if (!result.url || new URL(result.url).hostname !== 'checkout.stripe.com') throw new Error('A Stripe não forneceu um endereço seguro de pagamento.');
      location.assign(result.url);
    } catch (problem) { error('#shop-checkout-message', problem.message); button.disabled = false; }
  }
  async function submitAuth(event) {
    event.preventDefault();
    const form = event.currentTarget, mode = form.dataset.mode, data = Object.fromEntries(new FormData(form));
    const button = form.querySelector('button[type=submit]'); button.disabled = true; error('#shop-auth-message', 'Validando seus dados…');
    try {
      await post(mode, data); session = await request('session');
      $('#shop-auth-dialog')?.close(); renderAccountButton();
      if (checkoutAfterAuth) { checkoutAfterAuth = false; checkoutDialog(); }
      else maybeOpenAccount();
      error('#shop-auth-message', '');
    } catch (problem) { error('#shop-auth-message', problem.message); }
    finally { button.disabled = false; }
  }
  async function imageData(file) {
    if (!file || !['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('Envie uma foto JPG, PNG ou WebP de cada lado do aparelho.');
    let image, release = () => {};
    if (typeof createImageBitmap === 'function') {
      image = await createImageBitmap(file);
      release = () => image.close();
    } else {
      const url = URL.createObjectURL(file);
      image = new Image(); image.src = url;
      try { await image.decode(); }
      catch { URL.revokeObjectURL(url); throw new Error('Não foi possível ler a foto. Escolha outra imagem.'); }
      release = () => URL.revokeObjectURL(url);
    }
    const width = image.width || image.naturalWidth, height = image.height || image.naturalHeight;
    const scale = Math.min(1, 1200 / Math.max(width, height));
    const canvas = document.createElement('canvas'); canvas.width = Math.round(width * scale); canvas.height = Math.round(height * scale);
    canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height); release();
    for (const quality of [0.82, 0.7, 0.56, 0.42]) {
      const data = canvas.toDataURL('image/jpeg', quality);
      if (data.length < 900_000) return data;
    }
    throw new Error('A foto é grande demais. Use uma imagem menor.');
  }
  async function submitQuote(event) {
    event.preventDefault(); const form = event.currentTarget, button = form.querySelector('button[type=submit]');
    button.disabled = true; error('#shop-quote-message', 'Enviando fotos e detalhes com segurança…');
    try {
      const data = Object.fromEntries(new FormData(form));
      const frontPhoto = await imageData(form.elements.frontPhoto.files[0]);
      const backPhoto = await imageData(form.elements.backPhoto.files[0]);
      const result = await post('quote-request', { name: data.name, phone: data.phone, model: data.model, details: data.details, website: data.website, frontPhoto, backPhoto });
      form.reset(); error('#shop-quote-message', `Solicitação ${result.id.slice(0, 14)} recebida. Nossa equipe avaliará as fotos e entrará em contato.`);
      if (session.signedIn) session = await request('session');
    } catch (problem) { error('#shop-quote-message', problem.message); }
    finally { button.disabled = false; }
  }
  function markup() {
    return `<section class="shop-section" id="vitrine-online" aria-labelledby="shop-title"><div class="shop-intro"><div><p class="shop-eyebrow">LOJA VIRTUAL CELLF</p><h2 id="shop-title">O que você precisa,<br><span>mais perto.</span></h2><p>Produtos selecionados pela nossa equipe. Escolha, pague com segurança e receba em casa ou retire na loja.</p></div><button type="button" class="shop-cart-trigger" id="shop-cart-button" aria-controls="shop-cart-dialog">Meu carrinho <span id="shop-cart-count">0</span> ↗</button></div><p id="shop-message" class="shop-message" role="status" hidden></p><div class="shop-product-grid" id="shop-products" aria-live="polite"><p>Carregando produtos…</p></div></section>
    <section class="shop-quote-section" id="solicitar-orcamento" aria-labelledby="shop-quote-title"><div class="shop-quote-copy"><p class="shop-eyebrow">ASSISTÊNCIA TÉCNICA</p><h2 id="shop-quote-title">Conte o que<br>aconteceu.</h2><p>Envie a frente e o verso do aparelho e compartilhe os detalhes. Sua solicitação chega diretamente à equipe CELLF.</p><div class="shop-quote-privacy">Fotos privadas · orçamento sem compromisso · antes ou depois do login</div></div><form id="shop-quote-form" class="shop-quote-form"><label>Seu nome<input id="shop-quote-name" name="name" autocomplete="name" minlength="3" maxlength="100" required></label><label>WhatsApp / telefone<input name="phone" type="tel" autocomplete="tel" inputmode="tel" required></label><label>Modelo do aparelho<input name="model" placeholder="Ex.: iPhone 11" minlength="3" maxlength="120" required></label><label>Histórico e detalhes importantes<textarea name="details" minlength="10" maxlength="2000" rows="4" placeholder="Conte o problema, quando começou e se o aparelho já foi reparado" required></textarea></label><div class="shop-photo-inputs"><label>Foto da frente<input name="frontPhoto" type="file" accept="image/jpeg,image/png,image/webp" required></label><label>Foto de trás<input name="backPhoto" type="file" accept="image/jpeg,image/png,image/webp" required></label></div><label class="shop-honeypot" aria-hidden="true" tabindex="-1">Website<input name="website" tabindex="-1" autocomplete="off"></label><button class="shop-primary" type="submit">Solicitar orçamento ↗</button><p id="shop-quote-message" class="shop-form-status" role="status" hidden></p></form></section>
    <dialog id="shop-cart-dialog" class="shop-dialog" aria-labelledby="shop-cart-title"><div class="shop-dialog-inner"><header><div><p class="shop-eyebrow">SUA SELEÇÃO</p><h2 id="shop-cart-title">Meu carrinho</h2></div><button type="button" data-shop-close aria-label="Fechar carrinho">×</button></header><div id="shop-cart-items"></div><div class="shop-cart-summary"><span>Subtotal</span><strong id="shop-cart-total">R$ 0,00</strong></div><button class="shop-primary" id="shop-start-checkout" type="button">Continuar para a compra →</button></div></dialog>
    <dialog id="shop-auth-dialog" class="shop-dialog" aria-labelledby="shop-auth-title"><div class="shop-dialog-inner"><header><div><p class="shop-eyebrow">ACESSO DO CLIENTE</p><h2 id="shop-auth-title">Sua conta CELLF</h2></div><button type="button" data-shop-close aria-label="Fechar acesso">×</button></header><p>Cadastre seu CPF e um PIN de 4 dígitos. Para proteger o histórico antigo, a vinculação depende da aprovação do proprietário.</p><div class="shop-auth-tabs"><button type="button" data-shop-auth-tab="register" aria-selected="true">Criar conta</button><button type="button" data-shop-auth-tab="login" aria-selected="false">Já tenho conta</button></div><form id="shop-register-form" data-mode="register" class="shop-auth-form"><label>Nome completo<input name="name" autocomplete="name" minlength="3" required></label><label>Telefone / WhatsApp<input name="phone" autocomplete="tel" inputmode="tel" required></label><label>CPF<input id="shop-auth-cpf" name="cpf" inputmode="numeric" autocomplete="off" maxlength="14" required></label><label>Crie um PIN de 4 dígitos<input name="pin" type="password" inputmode="numeric" pattern="[0-9]{4}" maxlength="4" autocomplete="new-password" required></label><button class="shop-primary" type="submit">Criar conta segura</button></form><form id="shop-login-form" data-mode="login" class="shop-auth-form" hidden><label>CPF<input name="cpf" inputmode="numeric" autocomplete="username" required></label><label>PIN de 4 dígitos<input name="pin" type="password" inputmode="numeric" pattern="[0-9]{4}" maxlength="4" autocomplete="current-password" required></label><button class="shop-primary" type="submit">Entrar na minha conta</button></form><p id="shop-auth-message" class="shop-form-status" role="status" hidden></p></div></dialog>
    <dialog id="shop-checkout-dialog" class="shop-dialog" aria-labelledby="shop-checkout-title"><div class="shop-dialog-inner"><header><div><p class="shop-eyebrow">FINALIZAR COMPRA</p><h2 id="shop-checkout-title">Entrega ou retirada?</h2></div><button type="button" data-shop-close aria-label="Fechar compra">×</button></header><p id="shop-checkout-items"></p><form id="shop-checkout-form" class="shop-auth-form"><label>Como você prefere receber?<select id="shop-fulfillment" name="fulfillment"><option value="pickup">Retirada na loja · grátis</option><option value="delivery">Entrega no endereço do pedido</option></select></label><div id="shop-delivery-fields" class="shop-delivery-fields" hidden><div class="shop-field-pair"><label>CEP<input name="postalCode" inputmode="numeric" autocomplete="postal-code" maxlength="9"></label><label>UF<input name="state" autocomplete="address-level1" maxlength="2" placeholder="SP"></label></div><label>Rua / avenida<input name="street" autocomplete="address-line1"></label><div class="shop-field-pair"><label>Número<input name="number" autocomplete="address-line2"></label><label>Bairro<input name="neighborhood"></label></div><div class="shop-field-pair"><label>Complemento<input name="complement"></label><label>Cidade<input name="city" autocomplete="address-level2"></label></div><label>Referência<input name="reference"></label><label>Horário disponível<select id="shop-delivery-slot" name="deliverySlotId"></select></label><button class="shop-secondary" id="shop-calculate-freight" type="button">Calcular entrega</button></div><p id="shop-delivery-price" class="shop-delivery-price" role="status"></p><button class="shop-primary" type="submit">Ir para pagamento seguro ↗</button><p id="shop-checkout-message" class="shop-form-status" role="status" hidden></p></form></div></dialog>
    <dialog id="shop-account-dialog" class="shop-dialog shop-account-dialog" aria-labelledby="shop-account-title"><div class="shop-dialog-inner"><header><div><p class="shop-eyebrow">ÁREA DO CLIENTE</p><h2 id="shop-account-title">Minha conta</h2></div><button type="button" data-shop-close aria-label="Fechar minha conta">×</button></header><nav class="shop-account-tabs" aria-label="Minha conta"><button type="button" data-shop-account-tab="purchases" aria-selected="true"><span class="shop-tab-long">Compras e encomendas</span><span class="shop-tab-short">Compras</span></button><button type="button" data-shop-account-tab="orders" aria-selected="false"><span class="shop-tab-long">Ordens e garantias</span><span class="shop-tab-short">Ordens</span></button><button type="button" data-shop-account-tab="report" aria-selected="false">Relatório</button></nav><p id="shop-account-message" class="shop-form-status" role="status" hidden></p><div id="shop-account-body"></div><button id="shop-customer-logout" class="shop-secondary" type="button">Sair da conta do cliente</button></div></dialog>`;
  }
  function bind() {
    document.querySelectorAll('.shop-dialog').forEach(dialog => {
      dialog.querySelectorAll('[data-shop-close]').forEach(button => button.addEventListener('click', () => dialog.close()));
      dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
    });
    $('#shop-cart-button')?.addEventListener('click', () => { renderCart(); show($('#shop-cart-dialog')); });
    $('#shop-account-button')?.addEventListener('click', maybeOpenAccount);
    $('#shop-start-checkout')?.addEventListener('click', () => { $('#shop-cart-dialog')?.close(); checkoutDialog(); });
    $('#shop-products')?.addEventListener('click', event => {
      const button = event.target.closest('[data-shop-add]'); if (!button) return;
      const product = catalog.products.find(entry => entry.id === button.dataset.shopAdd);
      if (!product) return;
      cart.set(product.id, Math.min(product.available, (cart.get(product.id) || 0) + 1));
      renderCart(); toast(`${product.name} adicionado ao carrinho.`);
    });
    $('#shop-cart-items')?.addEventListener('click', event => {
      const button = event.target.closest('[data-shop-quantity]'); if (!button) return;
      const id = button.dataset.shopQuantity, product = catalog.products.find(entry => entry.id === id);
      if (!product) return;
      const next = Math.min(product.available, (cart.get(id) || 0) + Number(button.dataset.delta));
      if (next <= 0) cart.delete(id); else cart.set(id, next);
      renderCart();
    });
    document.querySelectorAll('[data-shop-auth-tab]').forEach(button => button.addEventListener('click', () => {
      const selected = button.dataset.shopAuthTab;
      document.querySelectorAll('[data-shop-auth-tab]').forEach(tab => tab.setAttribute('aria-selected', String(tab === button)));
      $('#shop-register-form').hidden = selected !== 'register'; $('#shop-login-form').hidden = selected !== 'login';
      error('#shop-auth-message', '');
    }));
    $('#shop-register-form')?.addEventListener('submit', submitAuth);
    $('#shop-login-form')?.addEventListener('submit', submitAuth);
    $('#shop-fulfillment')?.addEventListener('change', renderDeliveryFields);
    $('#shop-calculate-freight')?.addEventListener('click', async () => { try { await calculateDelivery($('#shop-checkout-form')); } catch (problem) { error('#shop-delivery-price', problem.message); } });
    $('#shop-checkout-form')?.addEventListener('submit', submitCheckout);
    $('#shop-quote-form')?.addEventListener('submit', submitQuote);
    document.querySelectorAll('[data-shop-account-tab]').forEach(button => button.addEventListener('click', () => { accountTab = button.dataset.shopAccountTab; renderAccount(); }));
    $('#shop-customer-logout')?.addEventListener('click', async () => { try { await post('logout', {}); session = { signedIn: false }; $('#shop-account-dialog')?.close(); renderAccountButton(); } catch (problem) { error('#shop-account-message', problem.message); } });
  }
  async function mount() {
    const root = $('.cellf-public-page'), footer = $('.cellf-public-footer');
    if (!root || !footer || $('#vitrine-online')) return;
    const current = ++mountId;
    footer.insertAdjacentHTML('beforebegin', markup());
    const nav = $('.cellf-public-header nav');
    nav?.insertAdjacentHTML('afterbegin', '<a href="#vitrine-online" class="shop-nav-link">Loja</a><a href="#solicitar-orcamento" class="shop-nav-link">Solicitar orçamento</a><button type="button" id="shop-account-button" class="shop-account-button">Minha conta ↗</button>');
    bind(); renderCart();
    try {
      const [loadedCatalog, loadedSession] = await Promise.all([request('catalog'), request('session')]);
      if (current !== mountId || !$('#shop-products')) return;
      catalog = loadedCatalog; session = loadedSession; productCards(); renderCart(); renderAccountButton();
      if (location.search.includes('shop=success')) {
        const id = new URL(location.href).searchParams.get('session_id');
        try { const result = await request('payment', { query: { session_id: id || '' } }); toast(result.paid ? 'Pagamento confirmado. Acompanhe sua compra em Minha conta.' : 'Pagamento em processamento. Acompanhe em Minha conta.'); cart.clear(); renderCart(); session = await request('session'); maybeOpenAccount(); }
        catch (problem) { toast(problem.message); }
        history.replaceState(null, '', location.pathname + '#minha-conta');
      } else if (location.search.includes('shop=cancel')) { toast('Pagamento cancelado. Seus itens continuam no carrinho nesta visita.'); history.replaceState(null, '', location.pathname + '#vitrine-online'); }
    } catch (problem) { if (current === mountId) { $('#shop-products').innerHTML = '<div class="shop-empty"><h3>Vitrine temporariamente indisponível</h3><p>Tente novamente em instantes.</p></div>'; toast(problem.message); } }
  }
  globalThis.CellfShop = { mount };
})();
