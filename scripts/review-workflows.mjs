// Isolated browser flow fixtures; never logs in to or writes production data.
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.CELLF_PLAYWRIGHT_PATH || 'playwright');
const browser=await chromium.launch({headless:true});
let saved=null, failNext=false;
const errors=[];
let activePage;
try {
  const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true,reducedMotion:'reduce'});
  activePage=page;
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/api/state',async route=>{
    if(route.request().method()==='PUT') {
      if(failNext) {failNext=false;return route.fulfill({status:503,json:{message:'Falha simulada de rede'}});}
      saved=route.request().postDataJSON().state;
    }
    await route.fulfill({json:{state:saved,updatedAt:new Date().toISOString(),access:{admin:true,financial:true,modules:[]}}});
  });
  await page.route('**/api/team',route=>route.fulfill({json:{users:[]}}));
  await page.goto('http://localhost:4173');
  await page.locator('.page-title').waitFor();
  saved.orders=[{id:'OS-QA',customer:'Cliente sem identificação',phone:'',device:'Aparelho QA',issue:'Teste isolado',status:'ready',quoteStatus:'approved',value:200,createdAt:'2026-09-25',dueAt:'2026-09-26',checklist:{screen:'attention',wifi:'ok'},parts:[],photos:[],receiptsTracked:true}];
  await page.reload();await page.locator('.page-title').waitFor();
  async function navigate(view) {
    await page.locator('#menu-button').click();
    await page.locator(`.nav-item[data-view="${view}"]`).click();
  }
  async function action(name) {await page.locator(`#app-content [data-extra="${name}"]`).first().click();}
  async function submit(form) {await page.locator(`${form} [type=submit]`).click();}
  async function closed() {await page.locator('#modal-backdrop').waitFor({state:'hidden'});}
  await navigate('cash');await action('cash-open');
  await page.locator('#cash-form [name=amount]').fill('200');await submit('#cash-form');await closed();
  assert.equal(saved.cashSessions.length,1);
  await action('cash-move');await page.locator('#cash-form [name=type]').selectOption('out');
  await page.locator('#cash-form [name=amount]').fill('50');await page.locator('#cash-form [name=reason]').fill('Retirada QA');
  await submit('#cash-form');await closed();assert.equal(saved.cashMovements[0].amount,50);
  await action('receive-order');await page.locator('#cash-form [name=amount]').fill('50');
  await submit('#cash-form');await closed();assert.equal(saved.receipts.length,1);
  await action('receive-order');await page.locator('#cash-form [name=amount]').fill('25');failNext=true;
  await submit('#cash-form');await page.getByRole('alert').filter({hasText:'Falha simulada de rede'}).first().waitFor();
  await submit('#cash-form');await closed();assert.equal(saved.receipts.length,2,'Retry must not duplicate receipt');
  await action('cash-close');await page.locator('#cash-form [name=amount]').fill('150');
  await submit('#cash-form');await closed();assert.equal(saved.cashSessions[0].difference,0);
  await navigate('devices');await action('new-device');
  await page.locator('#device-form [name=name]').fill('Telefone QA');await page.locator('#device-form [name=price]').fill('1000');
  await page.locator('#device-form [name=purchasePrice]').fill('600');await submit('#device-form');await closed();
  assert.equal(saved.devices.length,1);
  await action('sell-device');await page.locator('[data-action="complete-sale"]').waitFor();
  await page.locator('#sale-source-order').selectOption('OS-QA');
  await page.locator('#sale-include-service').check();
  await page.locator('#sale-discount').fill('10');
  await page.locator('#sale-discount').blur();
  assert.match(await page.locator('.cart-total').innerText(),/1\.115,00/);
  await page.locator('[data-action="complete-sale"]').click();
  await page.waitForFunction(()=>document.querySelector('.pos-cart').textContent.includes('Sua venda começa aqui'));
  await page.waitForTimeout(700);
  assert.equal(saved.devices[0].status,'sold');assert.equal(saved.products.find(p=>p.id===saved.devices[0].productId).stock,0);
  assert.equal(saved.sales[0].servicePayment.amount,125);
  assert.equal(saved.sales[0].total,1115);
  await navigate('orders');await page.locator('[data-action="view-order"]:visible').first().click();
  await page.locator('[data-extra="sign-order"]').click();
  const canvas=page.locator('#signature-pad'), box=await canvas.boundingBox();
  await page.mouse.move(box.x+20,box.y+50);await page.mouse.down();
  await page.mouse.move(box.x+box.width-25,box.y+100,{steps:20});await page.mouse.up();
  await page.locator('#signature-form [name=consent]').check();await submit('#signature-form');await closed();
  assert.ok(saved.orders[0].signature.strokes[0].length>=6);
  await page.reload();await page.locator('.page-title').waitFor();
  assert.equal(saved.receipts.reduce((sum,r)=>sum+r.amount,0),200);
  assert.equal(saved.orders[0].signature.record.checklist.screen,'attention');
  assert.deepEqual(errors,[]);
  console.log('PASS: open/move/close cash, partial receipts, failed-save retry without duplication, device→PDV→stock, signature and reload. No browser exceptions.');
} catch(error) {
  console.error((await activePage?.locator('#modal-backdrop').innerText()) || 'No modal');
  console.error(await activePage?.locator('.toast-region').innerText());
  throw error;
} finally {await browser.close();}
