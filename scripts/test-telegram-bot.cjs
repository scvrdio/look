const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const vm = require('node:vm');
function load(file, mocks, context = {}) {
  const module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  vm.runInNewContext(code, { module, exports: module.exports, require: n => mocks[n] ?? require(n), process: { env: { TELEGRAM_BOT_TOKEN: 'test-token' } }, Buffer, Response, AbortSignal, URL, console, ...context });
  return module.exports;
}
function fixture(failSend = false) {
  const calls = [], writes = [];
  const subscriptions = [{ chatId:'123',showId:1,showName:'A & B',lastEpisodeId:1 }];
  const bot = load('src/lib/telegram-bot.ts', {
    './subscriptions': { listSubscriptions:async()=>subscriptions, searchShows:async()=>[], supabase:async(p,o)=>writes.push({p,o}), getShow:async()=>({}) },
    './look-store': { addShow:async()=>{},removeShow:async()=>{} },
    './bot-search': load('src/lib/bot-search.ts', {}),
  }, { fetch: async(url,options)=>{
    calls.push({ url, body: options?.body ? JSON.parse(options.body) : null });
    if(url.includes('tvmaze')) return Response.json([{id:1,season:1,number:1,airdate:'2020-01-01'},{id:2,season:1,number:2,airdate:'2020-01-02'}]);
    if(failSend&&url.endsWith('/sendMessage')) return Response.json({ok:false},{status:403});
    return Response.json({ok:true,result:true});
  }});
  return { bot, calls, writes, subscriptions };
}
test('secret checks fail closed',()=>{
  const {bot}=fixture();
  assert.equal(bot.matchesSecret(null,undefined),false);
  assert.equal(bot.matchesSecret('x','x'),true);
  assert.equal(bot.matchesSecret('x','y'),false);
});
test('original search normalization, typo matching and transliteration',()=>{
  const search = load('src/lib/bot-search.ts', {});
  assert.equal(search.searchScore('Ted Lasso!', 'Ted Lasso'), 1);
  assert.ok(search.searchScore('Ted Laso', 'Ted Lasso') >= .72);
  assert.ok(search.queryVariants('Тед 2020').includes('ted 2020'));
  assert.ok(search.queryVariants('Тед 2020').includes('тед'));
});
test('notification cursor preserves previous bot semantics',()=>{
  const {bot}=fixture(), es=[{id:1},{id:2},{id:3}];
  assert.equal(bot.unseenEpisodes(es,2)[0].id,3);
  assert.equal(bot.unseenEpisodes(es,3).length,0);
  assert.equal(bot.unseenEpisodes(es,null)[0].id,3);
  assert.equal(bot.unseenEpisodes(es,999)[0].id,3);
});
test('dry run never sends notifications or writes cursors',async()=>{
  const {bot,calls,writes,subscriptions}=fixture();
  const result=await bot.checkSubscriptions(subscriptions,true);
  assert.equal(result.pending,1); assert.equal(result.sent,0);
  assert.equal(writes.length,0); assert.equal(calls.filter(c=>c.url.includes('telegram')).length,0);
});
test('confirmed send advances cursor; failed send does not',async()=>{
  const good=fixture(); await good.bot.checkSubscriptions(good.subscriptions);
  assert.equal(JSON.parse(good.writes[0].o.body).last_episode_id,2);
  const bad=fixture(true); const result=await bad.bot.checkSubscriptions(bad.subscriptions);
  assert.equal(result.failed,1); assert.equal(bad.writes.length,0);
});
test('start supplies the original three actions',async()=>{
  const {bot,calls}=fixture();
  await bot.handleUpdate({message:{chat:{id:123,type:'private'},text:'/start'}});
  const rows=calls[0].body.reply_markup.inline_keyboard;
  assert.equal(rows[0][0].web_app.url,'https://look-notify.vercel.app');
  assert.equal(rows[1][0].callback_data,'subscriptions');
  assert.equal(rows[1][1].callback_data,'check_now');
});
test('foreign callbacks and group updates cannot use private subscriptions',async()=>{
  const {bot,calls}=fixture();
  await bot.handleUpdate({callback_query:{id:'q',data:'subscriptions',from:{id:456},message:{chat:{id:123,type:'private'}}}});
  await bot.handleUpdate({message:{chat:{id:-10,type:'group'},text:'/subscriptions'}});
  assert.equal(calls.length,0);
});
test('subscriptions are escaped and use the same storage',async()=>{
  const {bot,calls}=fixture();
  await bot.handleUpdate({message:{chat:{id:123,type:'private'},text:'/subscriptions'}});
  assert.match(calls[0].body.text,/A &amp; B/);
  assert.equal(calls[0].body.reply_markup.inline_keyboard[0][0].callback_data,'status:1');
});
