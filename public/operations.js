// Operational modules share the authenticated, remote state of the application.
export function installOperations(app) {
  const { esc, brl, uid, isoToday, formatDate, formatDateTime, pageHeading, emptyState, statCard, openModal, closeModal, formActions, apiRequest, toast } = app;
  const labels = { team:'Equipe e permissões', cash:'Caixa e recebimentos', devices:'Aparelhos e vitrine', fiscal:'Documentos fiscais' };
  const moduleLabels = { orders:'Ordens de serviço', customers:'Clientes', products:'Estoque', services:'Serviços', sales:'Vendas', payables:'Contas a pagar', reports:'Relatórios', agenda:'Agenda', deliveries:'Entregas', cash:'Caixa', devices:'Aparelhos' };
  const glyph = id => `<svg viewBox="0 0 24 24" class="nav-icon" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${{team:'<circle cx="9" cy="8" r="3"/><path d="M3 20v-2a6 6 0 0 1 12 0v2M16 5a3 3 0 0 1 0 6m3 9v-2a6 6 0 0 0-2-4"/>',cash:'<rect x="3" y="5" width="18" height="14" rx="3"/><circle cx="12" cy="12" r="3"/><path d="M6 12h.01M18 12h.01"/>',devices:'<rect x="6" y="2" width="12" height="20" rx="3"/><path d="M10 5h4M11 19h2"/>',fiscal:'<path d="M6 3h9l4 4v14H6zM14 3v5h5M9 12h7M9 16h5"/>'}[id]}</svg>`;
  const nav = document.querySelector('.main-nav');
  const section = document.createElement('section');
  section.className = 'nav-group';
  section.innerHTML = `<h2 class="nav-label">GESTÃO DA LOJA</h2>${Object.entries(labels).map(([id,label])=>`<button type="button" class="nav-item" data-view="${id}" aria-controls="app-content">${glyph(id)}<span>${label}</span></button>`).join('')}`;
  nav.append(section);
  let team = [];
  let busy = false;
  let pendingCommit = null;
  const collection = key => Array.isArray(app.state[key]) ? app.state[key] : (app.state[key] = []);
  const button = (action,text,id='',kind='ghost-button')=>`<button type="button" class="${kind}" data-extra="${action}" data-id="${esc(id)}">${text}</button>`;
  const field = (name,label,value='',type='text',extra='')=>`<label class="field"><span>${label}</span><input name="${name}" type="${type}" value="${esc(value)}" ${extra}></label>`;
  async function persist(message,view) {
    app.recordActivity('operation',message);
    app.saveState();
    pendingCommit = async () => {
      await app.flushStateSave();
      pendingCommit = null;
      closeModal();
      if(view) app.navigate(view);
      toast(message);
    };
    await pendingCommit();
  }
  function bindForm(id, callback) {
    document.querySelector(id).addEventListener('submit', async e=>{
      e.preventDefault();
      if(busy) return;
      const form=e.currentTarget;
      if(!form.reportValidity()) return;
      busy=true;
      const submit=form.querySelector('[type=submit]');
      if(submit) submit.disabled=true;
      try { if(pendingCommit) await pendingCommit(); else await callback(Object.fromEntries(new FormData(form)),form); }
      catch(error) { toast(error.message || 'Não foi possível salvar.','error'); }
      finally { busy=false; if(submit?.isConnected) submit.disabled=false; }
    });
  }
  function renderTeam() {
    app.content.innerHTML=pageHeading('ACESSOS',labels.team,'Cada colaborador entra com seu próprio e-mail e senha.',button('new-employee','＋ Novo colaborador','','primary-button')) + '<div id="team-list" class="operation-grid" role="status">Carregando equipe…</div>';
    apiRequest('/api/team').then(result=>{
      team=result.users;
      const list=document.querySelector('#team-list');
      if(!list) return;
      list.innerHTML=team.length ? team.map(u=>`<article class="card operation-card"><span class="status ${u.active?'ready':'waiting'}">${u.active?'Acesso ativo':'Acesso desativado'}</span><h2>${esc(u.name)}</h2><p>${esc(u.email)}</p><p>${u.modules.map(m=>esc(moduleLabels[m] || m)).join(' · ') || 'Nenhum módulo liberado'}</p><small>${u.financial?'Pode visualizar custos e financeiro':'Custos e financeiro protegidos'}</small>${button('edit-employee','Editar acesso',u.id)}</article>`).join('') : emptyState('Nenhum colaborador cadastrado','Adicione sua equipe e defina os módulos de cada pessoa.',button('new-employee','Cadastrar colaborador'));
    }).catch(e=>{const list=document.querySelector('#team-list'); if(list) list.innerHTML=emptyState('Não foi possível carregar a equipe',e.message,button('reload-team','Tentar novamente'));});
  }
  function employeeModal(user={}) {
    openModal(user.id?'Editar acesso':'Novo colaborador','EQUIPE',`<form id="employee-form" class="form-grid">${field('name','Nome *',user.name,'text','required maxlength="120"')}${field('email','E-mail *',user.email,'email','required autocomplete="off"')}${field('password',user.id?'Nova senha (opcional)':'Senha inicial *','','password',`minlength="8" autocomplete="new-password" ${user.id?'':'required'}`)}<label class="checkbox-field"><input type="checkbox" name="active" ${user.active!==false?'checked':''}> Acesso ativo</label><label class="checkbox-field full"><input type="checkbox" name="financial" ${user.financial?'checked':''}> Permitir custos, lucro e módulos financeiros</label><fieldset class="full"><legend>Módulos autorizados</legend><div class="permission-grid">${Object.entries(moduleLabels).map(([key,label])=>`<label><input type="checkbox" name="module-${key}" ${user.modules?.includes(key)?'checked':''}>${esc(label)}</label>`).join('')}</div></fieldset><p class="field-help full">Alterações invalidam as sessões anteriores. Para movimentar peças em OS e vendas, habilite também Estoque. Gerenciamento de equipe e dados da empresa é exclusivo do administrador.</p>${formActions('Salvar acesso')}</form>`);
    bindForm('#employee-form',async data=>{
      await apiRequest('/api/team',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:user.id,name:data.name,email:data.email,password:data.password,active:data.active==='on',financial:data.financial==='on',modules:Object.keys(moduleLabels).filter(k=>data[`module-${k}`]==='on')})});
      closeModal(); renderTeam(); toast('Acesso salvo.');
    });
  }
  function received(order) {
    if(!order.receiptsTracked && order.status==='delivered') return Number(order.value || 0);
    return Math.round(collection('receipts').filter(r=>r.orderId===order.id).reduce((sum,r)=>sum+Number(r.amount),0)*100)/100;
  }
  function renderRelationships() {
    const customers=app.state.customers.filter(c=>c.active!==false && c.birthday?.slice(5,7)===isoToday().slice(5,7));
    if(document.querySelector('#birthday-card')) return;
    app.content.insertAdjacentHTML('beforeend',`<section id="birthday-card" class="card operation-card"><h2>Aniversariantes do mês</h2><p>Contato individual, somente para clientes que autorizaram mensagens promocionais.</p>${customers.length?customers.map(c=>{
      const digits=String(c.phone || '').replace(/\D/g,'');
      const phone=digits.startsWith('55') && digits.length>11?digits:'55'+digits;
      return `<article class="operation-row"><div><strong>${esc(c.name)}</strong><small>${esc(c.birthday.slice(8,10))}/${esc(c.birthday.slice(5,7))}</small></div>${c.marketingConsent && digits.length>=10?`<a class="ghost-button" target="_blank" rel="noopener" href="https://wa.me/${phone}?text=${encodeURIComponent(`Olá, ${c.name}! A equipe CELLF deseja um feliz aniversário!`)}">Preparar mensagem ↗</a>`:'<small>Sem autorização para contato promocional</small>'}</article>`;
    }).join(''):emptyState('Nenhum aniversário informado neste mês','A data de nascimento e a autorização podem ser registradas no cadastro do cliente.')}</section>`);
  }
  function decorateSales(cart) {
    const holder=document.querySelector('.cart-fields');
    if(!holder || document.querySelector('#sale-source-order')) return;
    const orders=app.state.orders.filter(o=>o.status!=='cancelled' && (o.customerId || '')===(cart.customerId || ''));
    holder.insertAdjacentHTML('beforeend',`<label class="field"><span>Vincular produtos a uma OS (opcional)</span><select id="sale-source-order"><option value="">Venda independente</option>${orders.map(o=>`<option value="${esc(o.id)}" ${cart.sourceOrderId===o.id?'selected':''}>${esc(o.id)} · ${esc(o.device)}</option>`).join('')}</select></label>${cart.sourceOrderId && (app.access.admin || app.access.modules.includes('cash'))?`<label class="checkbox-field"><input id="sale-include-service" type="checkbox" ${cart.includeService?'checked':''}> Receber também o saldo do serviço nesta venda</label><small>O desconto se aplica somente aos produtos. O serviço será baixado na OS após a confirmação do pagamento.</small>`:''}`);
    document.querySelector('#sale-source-order').addEventListener('change',e=>{cart.sourceOrderId=e.target.value;cart.includeService=false;app.renderSales();});
    document.querySelector('#sale-include-service')?.addEventListener('change',e=>{cart.includeService=e.target.checked;app.renderSales();});
    const service=app.cartServicePayment();
    if(service) document.querySelector('.cart-summary').insertAdjacentHTML('afterbegin',`<div class="service-checkout-line"><span>Inclui serviço ${esc(service.orderId)}</span><strong>${brl.format(service.amount)}</strong></div>`);
  }
  function decorateCustomer(customer) {
    const sales=app.state.sales.filter(s=>s.customerId===customer.id);
    document.querySelector('#modal-body .customer-detail')?.insertAdjacentHTML('beforeend',`<section class="detail-section"><h3>Histórico de compras</h3>${sales.length?sales.map(s=>`<button class="operation-row text-button" data-action="view-sale" data-id="${esc(s.id)}"><span>${esc(s.id.toUpperCase())} · ${formatDate(s.createdAt)}</span><strong>${brl.format(s.total)}</strong></button>`).join(''):'<p>Nenhuma compra registrada.</p>'}</section>`);
  }
  function recordSaleReceipt(sale) {
    const payment=sale.servicePayment;
    if(!payment || sale.status!=='paid' || collection('receipts').some(r=>r.saleId===sale.id)) return;
    const order=app.state.orders.find(o=>o.id===payment.orderId);
    if(!order) return;
    order.receiptsTracked=true;order.payment=sale.payment;
    collection('receipts').push({id:uid('rec'),orderId:order.id,saleId:sale.id,amount:Number(payment.amount),payment:sale.payment,createdAt:sale.paidAt || sale.createdAt});
  }
  function cashSummary(session) {
    const state=app.state;
    const inPeriod=date=>date >= session.openedAt && (!session.closedAt || date <= session.closedAt);
    const sales=(state.sales || []).filter(s=>s.status==='paid' && s.payment==='cash' && inPeriod(s.paidAt || s.createdAt));
    const receipts=collection('receipts').filter(r=>!r.saleId && r.payment==='cash' && inPeriod(r.createdAt));
    const moves=collection('cashMovements').filter(m=>m.sessionId===session.id);
    const inflow=sales.reduce((s,r)=>s+Number(r.total),0)+receipts.reduce((s,r)=>s+Number(r.amount),0);
    const adjustments=moves.reduce((s,r)=>s+(r.type==='in'?1:-1)*Number(r.amount),0);
    return {inflow,adjustments,expected:Math.round((Number(session.opening)+inflow+adjustments)*100)/100};
  }
  function renderCash() {
    const state=app.state;
    const sessions=collection('cashSessions');
    const open=sessions.find(s=>!s.closedAt);
    const totals=open?cashSummary(open):{inflow:0,adjustments:0,expected:0};
    const receivables=state.orders.filter(o=>o.status!=='cancelled' && Number(o.value)>received(o));
    app.content.innerHTML=pageHeading('FINANCEIRO',labels.cash,'Controle o dinheiro físico e os recebimentos das ordens.',open?button('cash-move','Suprimento / sangria')+button('cash-close','Fechar caixa','','primary-button'):button('cash-open','Abrir caixa','','primary-button'))+`<div class="stats-grid">${statCard('CAIXA',open?'Aberto':'Fechado','◷',open?formatDateTime(open.openedAt):'Abra o caixa para registrar movimentos')}${statCard('DINHEIRO ESPERADO',brl.format(totals.expected),'◇','Abertura + recebimentos + suprimentos − sangrias')}${statCard('RECEBIMENTOS EM DINHEIRO',brl.format(totals.inflow),'↗','Vendas pagas e recebimentos de serviços')}${statCard('A RECEBER',brl.format(receivables.reduce((s,o)=>s+Number(o.value)-received(o),0)),'◷',`${receivables.length} ordens com saldo`)}</div><section class="card operation-card"><h2>Contas a receber</h2>${receivables.length?receivables.map(o=>`<article class="operation-row"><div><strong>${esc(o.id)} · ${esc(o.customer)}</strong><small>${esc(o.device)} · Vence ${formatDate(o.dueAt)} · Recebido ${brl.format(received(o))}</small></div><strong>${brl.format(Number(o.value)-received(o))}</strong>${button('receive-order','Receber',o.id)}</article>`).join(''):emptyState('Nenhum valor pendente','As ordens com orçamento definido aparecerão aqui.')}</section><section class="card operation-card"><h2>Histórico de caixas</h2>${sessions.length?sessions.slice().reverse().map(s=>{const balance=cashSummary(s); return `<article class="operation-row"><div><strong>${formatDateTime(s.openedAt)}</strong><small>${s.closedAt?`Fechado ${formatDateTime(s.closedAt)}`:'Em andamento'} · ${esc(s.operator || '')}</small></div><div><strong>${brl.format(s.closedAt?s.expected:balance.expected)}</strong>${s.closedAt?`<small>Contado ${brl.format(s.counted)} · Diferença ${brl.format(s.difference)}</small>`:''}</div></article>`;}).join(''):emptyState('Nenhuma abertura registrada','Abra o primeiro caixa para iniciar o histórico.')}</section><section class="card operation-card"><h2>Movimentos manuais</h2>${collection('cashMovements').length?collection('cashMovements').slice().reverse().map(m=>`<article class="operation-row"><div><strong>${m.type==='in'?'Suprimento':'Sangria'} · ${esc(m.reason)}</strong><small>${formatDateTime(m.createdAt)}</small></div><strong>${brl.format(m.amount)}</strong></article>`).join(''):emptyState('Sem suprimentos ou sangrias','Os movimentos registrados aparecerão aqui.')}</section>`;
  }
  function cashModal(action,id) {
    const state=app.state;
    const session=collection('cashSessions').find(s=>!s.closedAt);
    if(action!=='cash-open' && action!=='receive-order' && !session) throw new Error('Abra o caixa primeiro.');
    const order=state.orders.find(o=>o.id===id);
    let fields='';
    if(action==='cash-open') fields=field('amount','Fundo de abertura (R$) *',0,'number','min="0" step="0.01" required');
    if(action==='cash-close') fields=`<p class="full">Dinheiro esperado: <strong>${brl.format(cashSummary(session).expected)}</strong>. Informe a contagem física para registrar a diferença.</p>`+field('amount','Dinheiro contado (R$) *','','number','min="0" step="0.01" required');
    if(action==='cash-move') fields='<label class="field"><span>Tipo</span><select name="type"><option value="in">Suprimento</option><option value="out">Sangria</option></select></label>'+field('amount','Valor (R$) *','','number','min="0.01" step="0.01" required');
    if(action==='receive-order') {
      if(!order) throw new Error('Ordem não encontrada.');
      if(state.sales.some(s=>s.status==='pending_payment' && s.servicePayment?.orderId===order.id)) throw new Error('Há uma cobrança Stripe pendente para este serviço. Cancele ou confirme a cobrança antes de receber novamente.');
      const balance=Number(order.value)-received(order);
      fields=`<p class="full">${esc(order.id)} · Saldo: ${brl.format(balance)}</p>`+field('amount','Valor recebido *',balance.toFixed(2),'number',`min="0.01" max="${balance}" step="0.01" required`)+`<label class="field"><span>Pagamento</span><select name="payment"><option value="pix">Pix</option><option value="cash">Dinheiro</option><option value="credit">Crédito</option><option value="debit">Débito</option><option value="transfer">Transferência</option></select></label>`;
    }
    openModal({'cash-open':'Abrir caixa','cash-close':'Fechar caixa','cash-move':'Movimentar caixa','receive-order':'Receber serviço'}[action],'FINANCEIRO',`<form id="cash-form" class="form-grid">${fields}${field('reason','Observação', '', 'text',action==='cash-move'?'required':'')}${formActions('Confirmar registro')}</form>`);
    bindForm('#cash-form',async data=>{
      const amount=Number(data.amount);
      if(!Number.isFinite(amount) || amount<0) throw new Error('Informe um valor válido.');
      const createdAt=new Date().toISOString();
      if(action==='cash-open') {
        if(collection('cashSessions').some(s=>!s.closedAt)) throw new Error('Já existe um caixa aberto.');
        collection('cashSessions').push({id:uid('cx'),opening:amount,openedAt:createdAt,operator:app.access.email || state.settings.managerName,notes:data.reason});
      } else if(action==='cash-close') {
        const expected=cashSummary(session).expected;
        Object.assign(session,{closedAt:createdAt,counted:amount,expected,difference:Math.round((amount-expected)*100)/100,closingNotes:data.reason});
      } else if(action==='cash-move') {
        if(amount<=0) throw new Error('O movimento deve ser maior que zero.');
        if(data.type==='out' && amount>cashSummary(session).expected) throw new Error('A sangria não pode superar o saldo do caixa.');
        collection('cashMovements').push({id:uid('cm'),sessionId:session.id,amount,type:data.type,reason:data.reason,createdAt});
      } else {
        if(amount<=0 || amount>Number(order.value)-received(order)) throw new Error('O valor deve respeitar o saldo da ordem.');
        if(data.payment==='cash' && !session) throw new Error('Abra o caixa antes de receber em dinheiro.');
        order.receiptsTracked=true;
        collection('receipts').push({id:uid('rec'),orderId:order.id,amount,payment:data.payment,notes:data.reason,createdAt});
      }
      await persist('Registro financeiro salvo.','cash');
    });
  }
  function renderDevices() {
    const devices=collection('devices');
    app.content.innerHTML=pageHeading('COMÉRCIO',labels.devices,'Controle condição, procedência, IMEI e divulgação de cada aparelho.',`<a class="ghost-button" href="/vitrine" target="_blank" rel="noopener">Abrir vitrine ↗</a>${button('new-device','＋ Cadastrar aparelho','','primary-button')}`)+`<div class="operation-grid">${devices.length?devices.map(d=>`<article class="card operation-card"><span class="status ${d.status==='available'?'ready':'waiting'}">${d.status==='available'?'Disponível':d.status==='reserved'?'Reservado':'Vendido'}</span><h2>${esc(d.name)}</h2><p>${esc(d.condition)} · ${esc(d.storage)} · ${esc(d.color)}</p><strong>${brl.format(d.price)}</strong><small>IMEI ${esc(d.imei || 'não informado')} · ${d.photos?.length || 0} fotos</small><small>${d.published?'Publicado na vitrine':'Fora da vitrine'}</small><div class="operation-actions">${button('edit-device','Editar',d.id)}${button('device-photo','Fotos',d.id)}${button('publish-device',d.published?'Ocultar da vitrine':'Publicar na vitrine',d.id)}${d.status==='available'?button('sell-device','Vender no PDV',d.id):''}</div></article>`).join(''):emptyState('Cadastre seu primeiro aparelho','Registre aparelhos novos e seminovos com fotos, preço e procedência.',button('new-device','Cadastrar aparelho'))}</div>`;
  }
  function deviceModal(device={}) {
    if(device.productId && !app.access.admin && !app.access.modules.includes('products')) throw new Error('Para editar um aparelho vinculado ao PDV, solicite também acesso ao Estoque.');
    openModal(device.id?'Editar aparelho':'Cadastrar aparelho','APARELHOS',`<form id="device-form" class="form-grid">${field('name','Marca e modelo *',device.name,'text','required')}${field('imei','IMEI',device.imei,'text','inputmode="numeric" pattern="[0-9]{15}" maxlength="15"')}<label class="field"><span>Condição</span><select name="condition">${['Novo lacrado','Seminovo','Recondicionado'].map(s=>`<option ${device.condition===s?'selected':''}>${s}</option>`).join('')}</select></label><label class="field"><span>Disponibilidade</span><select name="status">${[['available','Disponível'],['reserved','Reservado'],['sold','Vendido']].map(([v,t])=>`<option value="${v}" ${(device.status || 'available')===v?'selected':''}>${t}</option>`).join('')}</select></label>${field('storage','Armazenamento',device.storage)}${field('color','Cor',device.color)}${field('battery','Saúde da bateria (%)',device.battery,'number','min="0" max="100"')}${field('price','Preço de venda *',device.price,'number','min="0.01" step="0.01" required')}${app.access.financial?field('purchasePrice','Custo de aquisição',device.purchasePrice,'number','min="0" step="0.01"'):''}${field('provenance','Procedência / fornecedor',device.provenance)}<label class="field full"><span>Descrição para a vitrine</span><textarea name="description" maxlength="2000">${esc(device.description || '')}</textarea></label><p class="field-help full">IMEI, fornecedor e custo são privados. Somente descrição, fotos, características e preço são publicados.</p>${formActions('Salvar aparelho')}</form>`);
    bindForm('#device-form',async data=>{
      if(data.imei && collection('devices').some(d=>d.id!==device.id && d.imei===data.imei)) throw new Error('Já existe um aparelho com este IMEI.');
      const record={...device,...data,id:device.id || uid('device'),price:Number(data.price),purchasePrice:Number(data.purchasePrice || device.purchasePrice || 0),photos:device.photos || [],published:Boolean(device.published),createdAt:device.createdAt || new Date().toISOString()};
      if(record.status!=='available') record.published=false;
      const product=app.state.products.find(p=>p.id===record.productId);
      if(product) Object.assign(product,{name:record.name,price:record.price,stock:record.status==='available'?1:0,...(app.access.financial?{cost:record.purchasePrice}:{})});
      const items=collection('devices');
      const index=items.findIndex(d=>d.id===record.id);
      if(index<0) items.push(record); else items[index]=record;
      await persist('Aparelho salvo.','devices');
    });
  }
  function devicePhoto(device) {
    openModal('Fotos do aparelho',device.name,`<div id="device-photo-list" class="operation-grid"></div><form id="device-photo-form" class="form-grid"><label class="field full"><span>Foto *</span><input name="photo" type="file" accept="image/png,image/jpeg,image/webp" required></label><p class="field-help full">As fotos ficam visíveis aos visitantes quando você publicar este aparelho.</p>${formActions('Enviar foto')}</form>`);
    const holder=document.querySelector('#device-photo-list');
    for(const photo of device.photos || []) app.readCompanyDocument(photo.storageId,'devices').then(url=>{
      if(!holder.isConnected) return;
      const img=document.createElement('img'); img.src=url; img.alt=device.name; img.className='device-photo'; holder.append(img);
    }).catch(e=>toast(e.message,'error'));
    bindForm('#device-photo-form',async (_data,form)=>{
      if((device.photos || []).length>=8) throw new Error('Limite de 8 fotos por aparelho.');
      const file=form.elements.photo.files[0];
      const validation=app.validateCompanyDocument(file);
      if(!validation.valid || !['image/png','image/jpeg','image/webp'].includes(file.type)) throw new Error(validation.error || 'Escolha JPG, PNG ou WebP.');
      const storageId=uid('device-photo');
      await app.saveCompanyDocument(storageId,file,'devices');
      device.photos=[...(device.photos || []),{storageId,filename:file.name}];
      await persist('Foto salva.','devices');
    });
  }
  async function renderShowcase() {
    app.setPublic();
    app.content.innerHTML=`<div class="showcase-page"><header class="showcase-header"><a href="/"><img src="/cellf-logo-brand.svg" width="170" height="52" alt="CELLF"></a><a href="/">Página inicial</a></header><h1>Aparelhos disponíveis</h1><p>Conheça os aparelhos da CELLF e fale com nossa equipe.</p><div id="showcase-list" class="operation-grid" role="status">Carregando aparelhos…</div></div>`;
    try {
      const data=await apiRequest('/api/showcase');
      const phone=String(data.company.phone || '').replace(/\D/g,'');
      const whatsapp=phone.length>=10 ? (phone.startsWith('55')?phone:'55'+phone) : '';
      document.querySelector('#showcase-list').innerHTML=data.devices.length?data.devices.map(d=>`<article class="card operation-card">${d.photos.length?`<img class="device-photo" src="${esc(d.photos[0])}" alt="${esc(d.name)}" loading="lazy">`:'<div class="device-photo-placeholder">Fotos em preparação</div>'}<h2>${esc(d.name)}</h2><p>${esc(d.condition)} · ${esc(d.storage)} · ${esc(d.color)}</p><p>${esc(d.description)}</p><strong>${brl.format(d.price)}</strong>${d.photos.length>1?`<details><summary>Ver todas as fotos</summary><div class="operation-grid">${d.photos.slice(1).map(url=>`<img class="device-photo" src="${esc(url)}" alt="${esc(d.name)}" loading="lazy">`).join('')}</div></details>`:''}${whatsapp?`<a class="primary-button" href="https://wa.me/${whatsapp}?text=${encodeURIComponent(`Olá! Tenho interesse no ${d.name} anunciado por ${brl.format(d.price)} na vitrine CELLF.`)}" target="_blank" rel="noopener">Consultar disponibilidade ↗</a>`:'<p>Consulte a disponibilidade em nossa loja.</p>'}</article>`).join(''):emptyState('Novos aparelhos em breve','Nossa equipe está preparando a vitrine. Conheça também nossos serviços na página inicial.','<a class="ghost-button" href="/">Conhecer a CELLF</a>');
    } catch(e) {document.querySelector('#showcase-list').innerHTML=emptyState('Não foi possível carregar a vitrine',e.message,button('reload-showcase','Tentar novamente'));}
  }
  function signatureMarkup(order) {
    const sig=order.signature;
    if(!sig?.strokes?.length) return '';
    const points=sig.strokes.slice(0,100).map(stroke=>stroke.slice(0,2000).filter(p=>Array.isArray(p) && p.length===2 && p.every(n=>Number.isFinite(n) && n>=0 && n<=1)).map(p=>`${p[0]*600},${p[1]*220}`).join(' '));
    return `<section class="signature-record"><h3>Assinatura no recebimento</h3><svg viewBox="0 0 600 220" style="width:100%;max-width:450px;height:auto" role="img" aria-label="Assinatura registrada">${points.map(p=>`<polyline points="${p}" fill="none" stroke="black" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>`).join('')}</svg><p>${esc(sig.name)} · ${formatDateTime(sig.signedAt)}</p><small>Declaração: ${esc(sig.statement)}</small></section>`;
  }
  function signOrder(order) {
    if(order.signature) { openModal('Assinatura registrada',order.id,signatureMarkup(order)); return; }
    const statement='Conferi as condições do aparelho, acessórios e resultados do checklist registrados no recebimento.';
    openModal('Assinatura do cliente',order.id,`<form id="signature-form" class="form-grid">${field('name','Nome de quem assina *',order.customer,'text','required')}<p class="full">${esc(statement)}</p><canvas id="signature-pad" class="signature-pad full" width="900" height="330" aria-label="Área para assinar com o dedo ou mouse"></canvas>${button('clear-signature','Limpar assinatura')}<label class="checkbox-field full"><input type="checkbox" name="consent" required> Confirmo a declaração acima e autorizo o registro desta assinatura.</label>${formActions('Salvar assinatura')}</form>`);
    const canvas=document.querySelector('#signature-pad');
    const context=canvas.getContext('2d');
    context.lineWidth=3;context.lineCap='round';context.lineJoin='round';
    let strokes=[], active=null;
    const point=e=>{const r=canvas.getBoundingClientRect();return [Math.max(0,Math.min(1,(e.clientX-r.left)/r.width)),Math.max(0,Math.min(1,(e.clientY-r.top)/r.height))];};
    canvas.addEventListener('pointerdown',e=>{if(strokes.length>=100) return;canvas.setPointerCapture(e.pointerId);active=[point(e)];strokes.push(active);});
    canvas.addEventListener('pointermove',e=>{if(!active || active.length>=2000) return;const p=point(e),prev=active.at(-1);context.beginPath();context.moveTo(prev[0]*900,prev[1]*330);context.lineTo(p[0]*900,p[1]*330);context.stroke();active.push(p);});
    for(const event of ['pointerup','pointercancel']) canvas.addEventListener(event,()=>active=null);
    document.querySelector('[data-extra="clear-signature"]').onclick=()=>{strokes=[];context.clearRect(0,0,900,330);};
    bindForm('#signature-form',async data=>{
      if(strokes.flat().length<6) throw new Error('Assine na área indicada antes de salvar.');
      order.signature={name:data.name.trim(),signedAt:new Date().toISOString(),statement,strokes,record:{device:order.device,deviceCondition:order.deviceCondition,accessories:order.accessories,checklist:structuredClone(order.checklist)}};
      await persist('Assinatura salva.','orders');
    });
  }
  function renderFiscal() {
    app.content.innerHTML=pageHeading('DOCUMENTAÇÃO',labels.fiscal,'Prepare os dados para a emissão e acompanhe os documentos da operação.')+`<section class="card operation-card"><h2>Habilitação da emissão fiscal</h2><p>A emissão fiscal ainda não está integrada. A CELLF informou não possuir certificado A1. Para ativar NF-e, NFC-e ou NFS-e, valide o credenciamento e os requisitos aplicáveis com o contador e o serviço emissor escolhido. Recibos e garantias são documentos comerciais e não substituem uma nota fiscal.</p><div class="operation-actions"><button class="primary-button" data-view="settings">Conferir dados da empresa</button>${button('export-accounting','Exportar movimento para o contador')}</div></section><section class="card operation-card"><h2>Documentos comerciais emitidos</h2>${(app.state.issuedDocuments || []).length?app.state.issuedDocuments.map(d=>`<article class="operation-row"><div><strong>${esc(d.type)} · ${esc(d.sourceId)}</strong><small>${esc(d.customer)} · ${formatDateTime(d.createdAt)}</small></div></article>`).join(''):emptyState('Nenhum documento emitido','Abra uma ordem ou venda para emitir orçamento, comprovante, recibo ou garantia.')}</section>`;
  }
  function onModal(title,eyebrow) {
    if(!app.access.financial) document.querySelectorAll('#modal-body input[name="cost"], #modal-body input[name="purchasePrice"]').forEach(input=>{input.closest('.field').hidden=true;});
    if(eyebrow==='DETALHES DA ORDEM') {
      const order=app.state.orders.find(o=>o.id===title);
      if(order) document.querySelector('#modal-body .document-action-grid')?.insertAdjacentHTML('beforeend',button('sign-order',order.signature?'Consultar assinatura':'Assinatura do cliente',order.id));
      const sales=app.state.sales.filter(s=>s.sourceOrderId===order?.id);
      if(sales.length) document.querySelector('#modal-body .order-detail').insertAdjacentHTML('beforeend',`<section class="detail-section"><h3>Vendas vinculadas</h3>${sales.map(s=>`<p>${esc(s.id.toUpperCase())} · ${brl.format(s.total)} · ${esc(s.status==='paid'?'Paga':'Pagamento pendente')}</p>`).join('')}</section>`);
    }
  }
  function onRender(view) {
    if(labels[view]) {
      for(const selector of ['#current-view-label','#topbar-context']) {
        const element=document.querySelector(selector);
        if(element) element.textContent=labels[view];
      }
    }
    // No empty mobile lists: empty results must always explain the next action.
    document.querySelectorAll('.mobile-cards').forEach(el=>{if(!el.innerHTML.trim()) el.innerHTML=emptyState('Nenhum registro','Use o botão de cadastro para adicionar o primeiro registro.');});
    if(!app.access.admin) {
      document.querySelectorAll('[data-action="profile"], .user-card').forEach(el=>el.hidden=true);
      if(!app.access.modules.includes('orders')) document.querySelectorAll('[data-action="new-order"]').forEach(el=>el.hidden=true);
    }
  }
  document.addEventListener('click',async e=>{
    const target=e.target.closest?.('[data-extra]');
    if(!target || busy) return;
    const action=target.dataset.extra,id=target.dataset.id;
    const device=collection('devices').find(d=>d.id===id);
    try {
      if(pendingCommit) {busy=true;await pendingCommit();return;}
      if(['new-employee','edit-employee'].includes(action)) employeeModal(team.find(u=>u.id===id));
      else if(action==='reload-team') renderTeam();
      else if(['cash-open','cash-close','cash-move','receive-order'].includes(action)) cashModal(action,id);
      else if(['new-device','edit-device'].includes(action)) deviceModal(device);
      else if(action==='device-photo' && device) devicePhoto(device);
      else if(action==='reload-showcase') renderShowcase();
      else if(action==='publish-device' && device) {
        if(!device.published && (!device.photos?.length || !device.price || device.status!=='available')) throw new Error('Adicione foto, preço e disponibilidade antes de publicar.');
        busy=true;device.published=!device.published;await persist(device.published?'Aparelho publicado na vitrine.':'Aparelho removido da vitrine.','devices');
      } else if(action==='sell-device' && device) {
        if(!app.access.admin && !['sales','products'].every(m=>app.access.modules.includes(m))) throw new Error('A venda exige permissões de Vendas e Estoque.');
        busy=true;
        let product=app.state.products.find(p=>p.id===device.productId);
        if(!product) {product={id:uid('p'),name:device.name,sku:device.imei || device.id,category:'Aparelhos',stock:1,minimum:0,price:device.price,cost:device.purchasePrice};app.state.products.push(product);device.productId=product.id;}
        await persist('Aparelho disponível no PDV.','sales');
        document.querySelector(`[data-action="add-cart-product"][data-id="${CSS.escape(product.id)}"]`)?.click();
      } else if(action==='sign-order') signOrder(app.state.orders.find(o=>o.id===id));
      else if(action==='export-accounting') app.exportCsv(`cellf-contador-${isoToday()}.csv`,['Tipo','ID','Data','Cliente/Fornecedor','CPF/CNPJ','Valor','Situação'],[
        ...app.state.sales.map(s=>['Venda',s.id,s.createdAt,s.customer,s.customerDocument,s.total,s.status]),
        ...app.state.orders.map(o=>['Serviço',o.id,o.createdAt,o.customer,o.customerDocument,o.value,o.status]),
        ...app.state.payables.map(p=>['Despesa',p.id,p.paidAt || p.dueAt,p.supplier,'',p.amount,p.paid?'Paga':'Aberta'])]);
    } catch(error) {toast(error.message,'error');} finally {busy=false;}
  });
  return {views:{team:renderTeam,cash:renderCash,devices:renderDevices,fiscal:renderFiscal},onRender,onModal,signatureMarkup,renderShowcase,received,renderRelationships,decorateSales,recordSaleReceipt,decorateCustomer};
}
