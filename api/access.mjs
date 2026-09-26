import { scryptSync, timingSafeEqual, randomUUID } from 'node:crypto';
import { ApiError, getSupabaseConfig, supabaseRequest, requireAuthenticatedSession } from './supabase.mjs';

export const MODULES = ['orders', 'customers', 'products', 'services', 'sales', 'payables', 'reports', 'agenda', 'deliveries', 'cash', 'devices'];
export async function readRecord(id = getSupabaseConfig().stateId) {
  const rows = await supabaseRequest('/rest/v1/cellf_app_state?select=state,updated_at&id=eq.' + encodeURIComponent(id) + '&limit=1');
  return rows?.[0] || null;
}
export async function writeRecord(id, state, previous) {
  const updatedAt = new Date(Math.max(Date.now(), (Date.parse(previous?.updated_at) || 0) + 1)).toISOString();
  if (previous?.updated_at) {
    const rows = await supabaseRequest('/rest/v1/cellf_app_state?id=eq.' + encodeURIComponent(id) + '&updated_at=eq.' + encodeURIComponent(previous.updated_at), {
      method: 'PATCH', headers: { Prefer: 'return=representation' }, body: { state, updated_at: updatedAt }
    });
    if (!rows?.length) throw new ApiError(409, 'STATE_CONFLICT', 'Outro dispositivo atualizou estes dados. Recarregue antes de salvar novamente.');
  } else {
    await supabaseRequest('/rest/v1/cellf_app_state?on_conflict=id', { method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates,return=representation' }, body: { id, state, updated_at: updatedAt } }).then(rows => {
      if (!rows?.length) throw new ApiError(409, 'STATE_CONFLICT', 'Os dados foram criados em outro dispositivo. Recarregue a página.');
    });
  }
  return updatedAt;
}
export const teamId = () => getSupabaseConfig().stateId + '-team';
export async function readTeam() { return readRecord(teamId()); }
export function passwordMatches(password, encoded) {
  if (typeof password !== 'string' || password.length > 1024) return false;
  const match = /^scrypt:([A-Za-z0-9_-]{16,128}):([A-Za-z0-9_-]{43})$/.exec(encoded || '');
  if (!match) return false;
  return timingSafeEqual(scryptSync(password, match[1], 32), Buffer.from(match[2], 'base64url'));
}
export async function accessFor(request) {
  const session = requireAuthenticatedSession(request, { allowEmployee: true });
  if (session.sub === 'cellf-admin') return { admin: true, email: session.email, modules: MODULES, financial: true };
  const record = await readTeam();
  const user = record?.state?.users?.find(u => u.id === session.sub && u.active && u.email === session.email && u.version === session.version);
  if (!user) throw new ApiError(401, 'SESSION_REVOKED', 'Seu acesso foi alterado. Entre novamente.');
  return { admin: false, id: user.id, name: user.name, email: user.email, modules: user.modules || [], financial: Boolean(user.financial) };
}
export function requireModule(access, module) {
  if (!access.admin && !access.modules.includes(module)) throw new ApiError(403, 'ACCESS_DENIED', 'Seu usuário não tem permissão para esta operação.');
}
const collections = { orders: ['orders'], customers: ['customers'], products: ['products','stockMovements'], services: ['services'], sales: ['sales'], payables: ['payables'], agenda: ['appointments'], deliveries: ['deliveries'], cash: ['cashSessions','cashMovements','receipts'], devices: ['devices'] };
const allCollections = [...new Set(Object.values(collections).flat()), 'companyDocuments', 'activity', 'issuedDocuments'];
const moneyKeys = new Set(['cost','serviceCost','serviceBaseCost','dailyRevenueGoal','purchasePrice']);
function redact(value) {
  if (Array.isArray(value)) return value.map(redact);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).filter(([k]) => !moneyKeys.has(k)).map(([k,v]) => [k,redact(v)]));
}
export function stateForAccess(state, access) {
  if (access.admin || !state) return state;
  const readable = new Set(access.modules.flatMap(m => collections[m] || []));
  if (access.modules.some(m => ['orders','sales'].includes(m))) for (const k of ['products','services','customers']) readable.add(k);
  if (access.modules.includes('reports') && access.financial) for (const k of ['orders','sales','payables','products','services']) readable.add(k);
  if (access.modules.includes('cash')) for (const k of ['orders','sales','payables']) readable.add(k);
  if (access.modules.includes('orders')) readable.add('receipts');
  const visible = Object.fromEntries(allCollections.map(k => [k, readable.has(k) ? state[k] || [] : []]));
  visible.issuedDocuments=(state.issuedDocuments || []).filter(d=>(access.modules.includes('orders') && state.orders?.some(o=>o.id===d.sourceId)) || (access.modules.includes('sales') && state.sales?.some(s=>s.id===d.sourceId)));
  visible.operationalDataVersion = state.operationalDataVersion;
  const settings = state.settings || {};
  visible.settings = Object.fromEntries(['companyName','slogan','legalName','document','phone','email','address','city','postalCode','openingTime','closingTime','warrantyDays','defaultDeadlineDays','orderNotes','googleReviewUrl'].map(k=>[k,settings[k]]));
  visible.settings.managerName = access.name;
  visible.settings.managerRole = 'Colaborador';
  return access.financial ? visible : redact(visible);
}
// Preserve hidden costs recursively, including newly reserved pieces/sales.
function restoreCosts(value, old, catalog) {
  if (Array.isArray(value)) return value.map(v => restoreCosts(v, Array.isArray(old) ? old.find(o => (o.id && o.id === v.id) || (o.productId && o.productId === v.productId)) : null, catalog));
  if (!value || typeof value !== 'object') return value;
  const restored = Object.fromEntries(Object.entries(value).filter(([k]) => !moneyKeys.has(k)).map(([k,v]) => [k,restoreCosts(v,old?.[k],catalog)]));
  for (const key of moneyKeys) if (old && Object.hasOwn(old,key)) restored[key] = old[key];
  if (value.productId && !old) restored.cost = Number(catalog.products?.find(p => p.id === value.productId)?.cost || 0);
  if (value.serviceId) {
    restored.serviceBaseCost = old?.serviceId === value.serviceId ? old.serviceBaseCost : catalog.services?.find(s => s.id === value.serviceId)?.cost ?? null;
    restored.serviceCost = restored.serviceBaseCost == null && !restored.parts?.length ? null : Number(restored.serviceBaseCost || 0) + (restored.parts || []).reduce((s,p) => s + p.cost * p.quantity, 0);
  }
  return restored;
}
export function mergeEmployeeState(current, submitted, access) {
  const next = structuredClone(current);
  for (const key of new Set(access.modules.flatMap(m => collections[m] || []))) {
    if (Array.isArray(submitted[key])) next[key] = access.financial ? submitted[key] : restoreCosts(submitted[key], current[key], current);
  }
  // Cash operators may update receipt tracking, not alter the OS budget or identity.
  if(access.modules.includes('cash') && !access.modules.includes('orders')) {
    for(const order of next.orders || []) if((submitted.receipts || []).some(r=>r.orderId===order.id)) order.receiptsTracked=true;
  }
  // Inventory sales remove linked devices from the storefront regardless of role.
  for(const device of next.devices || []) if(device.productId && Number(next.products?.find(p=>p.id===device.productId)?.stock)<=0) {
    device.status='sold';device.published=false;
  }
  for(const doc of submitted.issuedDocuments || []) {
    const allowed=(access.modules.includes('orders') && next.orders?.some(o=>o.id===doc.sourceId)) || (access.modules.includes('sales') && next.sales?.some(s=>s.id===doc.sourceId));
    if(allowed && doc.id && !(next.issuedDocuments || []).some(d=>d.id===doc.id)) {
      next.issuedDocuments ||= [];
      next.issuedDocuments.push({...doc,issuedBy:access.id});
    }
  }
  // Changes in one module cannot mutate another module's collections.
  // Stock-changing OS/PDV operations require inventory permission as well.
  for (const key of ['orders','sales']) if (access.modules.includes(key) && !access.modules.includes('products')) {
    const reservations = rows => JSON.stringify((rows || []).filter(r=>key==='orders'?r.partsReserved:r.status==='paid' || r.status==='pending_payment').map(r=>[r.id,(key==='orders'?r.parts:r.items || []).map(p=>[p.productId,p.quantity])]).filter(([,parts])=>parts.length).sort((a,b)=>String(a[0]).localeCompare(String(b[0]))));
    const old = reservations(current[key]);
    const incoming = reservations(next[key]);
    if (old !== incoming) throw new ApiError(403,'INVENTORY_PERMISSION_REQUIRED','Esta alteração exige também permissão de estoque. Peça ao administrador.');
  }
  next.activity = [{ id: randomUUID(), kind: 'team', description: `${access.name} atualizou ${access.modules.join(', ')}`, createdAt: new Date().toISOString() }, ...(current.activity || [])].slice(0,80);
  return next;
}
