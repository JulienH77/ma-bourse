const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname,'../docs/provider.js'),'utf8');
function provider(replies) {
  const calls = [];
  const scope = {window:{}, URLSearchParams, AbortSignal, fetch:async(url,options)=>{
    calls.push({url,options});
    return {ok:true,json:async()=>replies.shift()};
  }};
  vm.runInNewContext(source,scope);
  return {api:scope.window.FolioProvider,calls};
}
const bars=(currency,values)=>({meta:{currency},values:values.map(([datetime,close])=>({datetime,close}))});
test('private request pairs exchange rates by date and keeps the key out of URLs',async()=>{
  const {api,calls}=provider([bars('USD',[['2026-01-06',105],['2026-01-05',100]]),bars('',[['2026-01-05',1.1],['2026-01-06',1.05]])]);
  const feed=await api.load('NVDA','USD','private-test-key');
  assert.equal(feed.quotes.NVDA[1].fx,1.05);
  assert.equal(calls.length,2);
  assert.ok(calls.every(c=>!c.url.includes('private-test-key')));
});
test('fails atomically on currency mismatch or missing latest FX',async()=>{
  const stock=bars('USD',[['2026-01-06',105]]);
  await assert.rejects(provider([stock]).api.load('NVDA','EUR','test'),/devise/);
  await assert.rejects(provider([stock,bars('',[['2026-01-05',1.1]])]).api.load('NVDA','USD','test'),/Change indisponible/);
});
