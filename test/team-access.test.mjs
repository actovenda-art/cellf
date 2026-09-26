import test from 'node:test';
import assert from 'node:assert/strict';
import { stateForAccess, mergeEmployeeState, accessFor, passwordMatches } from '../api/access.mjs';
import { hashPassword, issueSession, requireAuthenticatedSession } from '../api/supabase.mjs';
import teamHandler from '../api/team.mjs';
import stateHandler from '../api/state.mjs';
import showcaseHandler from '../api/showcase.mjs';
import sessionHandler from '../api/session.mjs';
const employee={id:'e493b8d8-505b-4c85-83d6-34323582a466',email:'tech@example.test',name:'Técnico',version:1,active:true,modules:['orders','products'],financial:false};
const state={operationalDataVersion:'test',settings:{companyName:'CELLF',document:'123',managerName:'Owner',dailyRevenueGoal:1000},products:[{id:'p1',name:'Peça',cost:37,price:90,stock:2}],services:[],orders:[{id:'o1',value:130,serviceCost:37,parts:[{productId:'p1',cost:37,quantity:1}]}],sales:[{id:'s1',total:999}],payables:[{id:'bill',amount:800}],companyDocuments:[{id:'private'}],devices:[{id:'d1',published:true,status:'available',name:'Telefone',price:1200,purchasePrice:500,imei:'123456789012345',provenance:'Confidencial',photos:[]},{id:'d2',published:false,status:'available',name:'Oculto',price:99}]};
function configure(t) {
  const names=['SUPABASE_URL','SUPABASE_SECRET_KEY','CELLF_ADMIN_EMAIL','CELLF_APP_PASSWORD','CELLF_APP_PASSWORD_HASH','CELLF_AUTH_SECRET'];
  const previous=Object.fromEntries(names.map(n=>[n,process.env[n]]));
  Object.assign(process.env,{SUPABASE_URL:'https://test.supabase.co',SUPABASE_SECRET_KEY:'sb_secret_fake_test',CELLF_ADMIN_EMAIL:'owner@example.test',CELLF_APP_PASSWORD:'test-password-123',CELLF_AUTH_SECRET:'test-only-authentication-secret-with-more-than-32-characters'});
  delete process.env.CELLF_APP_PASSWORD_HASH;
  t.after(()=>{for(const n of names) if(previous[n]===undefined) delete process.env[n];else process.env[n]=previous[n];});
}
function request(method='GET') {return {method,url:'/api/state',headers:{host:'cellf.test',cookie:`cellf_session=${issueSession(employee.email,employee).token}`}};}
function response() {return {headers:{},setHeader(k,v){this.headers[k]=v;},status(v){this.statusCode=v;return this;},json(v){this.payload=v;return this;}};}
test('permissão remove custos e coleções financeiras antes de enviar ao funcionário',()=>{
  const data=stateForAccess(state,{...employee,admin:false});
  assert.equal(data.orders[0].parts[0].cost,undefined);
  assert.equal(data.products[0].cost,undefined);
  assert.equal(data.settings.dailyRevenueGoal,undefined);
  assert.deepEqual(data.sales,[]);assert.deepEqual(data.companyDocuments,[]);
});
test('escrita de funcionário preserva custos e ignora alteração de módulos não autorizados',()=>{
  const data=stateForAccess(state,{...employee,admin:false});
  data.orders[0].value=140;data.orders[0].parts[0].cost=0;data.settings.companyName='Inválido';data.sales=[{id:'hack'}];
  const merged=mergeEmployeeState(state,data,employee);
  assert.equal(merged.orders[0].value,140);assert.equal(merged.orders[0].parts[0].cost,37);
  assert.equal(merged.settings.companyName,'CELLF');assert.deepEqual(merged.sales,state.sales);
});
test('senha de colaborador usa hash e rejeita senha incorreta',()=>{
  const hash=hashPassword('teste-seguro-123');
  assert.equal(passwordMatches('teste-seguro-123',hash),true);
  assert.equal(passwordMatches('senha-errada',hash),false);
});
test('sessão de funcionário não autoriza APIs exclusivas do dono',async t=>{
  configure(t);
  assert.throws(()=>requireAuthenticatedSession(request()),e=>e.status===403);
  const res=response();await teamHandler(request(),res);assert.equal(res.statusCode,403);
});
test('desativar usuário ou alterar sua versão invalida sessão existente imediatamente',async t=>{
  configure(t);
  t.mock.method(globalThis,'fetch',async()=>({ok:true,json:async()=>[{state:{users:[{...employee,version:2}]}}]}));
  await assert.rejects(accessFor(request()),e=>e.status===401);
});
test('estado desatualizado é recusado sem sobrescrever outra edição',async t=>{
  configure(t);let writes=0;
  t.mock.method(globalThis,'fetch',async(url,options)=>{if(options.method!=='GET')writes++;return {ok:true,json:async()=>[{state,updated_at:'2026-09-25T12:00:00.000Z'}]};});
  const req={method:'PUT',headers:{cookie:`cellf_session=${issueSession().token}`},body:{state,updatedAt:'2026-09-25T11:00:00.000Z'}};
  const res=response();await stateHandler(req,res);assert.equal(res.statusCode,409);assert.equal(writes,0);
});
test('vitrine publica somente aparelhos escolhidos e não expõe IMEI, custo ou procedência',async t=>{
  configure(t);
  t.mock.method(globalThis,'fetch',async()=>({ok:true,json:async()=>[{state}]}));
  const res=response();await showcaseHandler({method:'GET'},res);
  assert.equal(res.statusCode,200);assert.equal(res.payload.devices.length,1);
  assert.equal(res.payload.devices[0].imei,undefined);assert.equal(res.payload.devices[0].purchasePrice,undefined);assert.equal(res.payload.devices[0].provenance,undefined);
  assert.equal(res.payload.company.document,undefined);
});
test('administrador cria usuário, login real assina sessão e API filtra os dados',async t=>{
  configure(t);
  const records=new Map();
  t.mock.method(globalThis,'fetch',async (input,options)=>{
    const url=new URL(input), id=url.searchParams.get('id')?.replace(/^eq\./,'');
    let rows=[];
    if(options.method==='POST') {
      const body=JSON.parse(options.body);records.set(body.id,body);rows=[body];
    } else if(options.method==='PATCH') {
      const current=records.get(id), patch=JSON.parse(options.body);
      if(current?.updated_at===url.searchParams.get('updated_at')?.replace(/^eq\./,'')) {records.set(id,{...current,...patch});rows=[records.get(id)];}
    } else if(id?.endsWith('-team')) rows=records.has(id)?[records.get(id)]:[];
    else rows=[{state,updated_at:'2026-09-25T12:00:00.000Z'}];
    return {ok:true,json:async()=>rows};
  });
  const res=response();
  await teamHandler({method:'POST',headers:{cookie:`cellf_session=${issueSession().token}`},body:{name:'QA Técnico',email:'qa@example.test',password:'test-password-789',modules:['orders','products','reports'],financial:false}},res);
  assert.equal(res.statusCode,200);assert.equal(res.payload.users[0].passwordHash,undefined);
  assert.deepEqual(res.payload.users[0].modules,['orders','products']);
  const login=response();await sessionHandler({method:'POST',headers:{host:'cellf.test'},body:{email:'qa@example.test',password:'test-password-789'}},login);
  assert.equal(login.statusCode,200);assert.equal(login.payload.authenticated,true);
  const cookie=String(login.headers['Set-Cookie']).split(';')[0];
  const data=response();await stateHandler({method:'GET',headers:{cookie}},data);
  assert.equal(data.statusCode,200);assert.equal(data.payload.access.admin,false);
  assert.equal(data.payload.state.products[0].cost,undefined);assert.deepEqual(data.payload.state.payables,[]);
  const edit=response();await teamHandler({method:'POST',headers:{cookie:`cellf_session=${issueSession().token}`},body:{...res.payload.users[0],active:false}},edit);
  assert.equal(edit.statusCode,200);
  const denied=response();await stateHandler({method:'GET',headers:{cookie}},denied);assert.equal(denied.statusCode,401);
});
test('custo da OS é recalculado no servidor ao alterar quantidade de peças sem acesso financeiro',()=>{
  const current={...state,orders:[{...state.orders[0],serviceId:'s1',serviceBaseCost:10,serviceCost:47}]};
  const submitted=stateForAccess(current,employee);submitted.orders[0].parts[0].quantity=2;
  const result=mergeEmployeeState(current,submitted,employee);assert.equal(result.orders[0].serviceCost,84);
});
test('vitrine omite aparelho sem estoque após pagamento',async t=>{
  configure(t);
  t.mock.method(globalThis,'fetch',async()=>({ok:true,json:async()=>[{state:{...state,devices:[{...state.devices[0],productId:'p1'}],products:[{id:'p1',stock:0}]}}]}));
  const res=response();await showcaseHandler({method:'GET'},res);assert.equal(res.statusCode,200);assert.deepEqual(res.payload.devices,[]);
});
