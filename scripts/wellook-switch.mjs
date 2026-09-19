// Operator helper: never logs tokens or raw Vercel/Telegram responses.
import fs from 'node:fs';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
const team = 'team_Bd1Jcmk79L79kvSSCZa3r4iI';
const app = 'prj_5qTiYnVsjGybT9AobbPdVQh4HLgF';
const bot = 'prj_y2pyJvtMyXP0CXbJp2BwIPb0c43r';
const pnpm = '/Users/serezhaivlev/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/fallback/pnpm';
const nodeDir = '/Users/serezhaivlev/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin';
const source = fs.readFileSync('.env.telegram-switch.local', 'utf8');
const token = source.match(/^TELEGRAM_BOT_TOKEN\s*=\s*(.+)$/m)?.[1].trim().replace(/^["']|["']$/g, '');
if (!token) throw new Error('Local token is missing');
const secret = crypto.createHmac('sha256', token).update('wellook-webhook-migration-v1').digest('hex');
function api(path, method='GET', body) {
  const args=['dlx','vercel@59.23.1','api',path+(path.includes('?')?'&':'?')+'teamId='+team,'--raw','--method',method];
  if(body) args.push('--input','-');
  const r=spawnSync(pnpm,args,{env:{...process.env,PATH:nodeDir+':'+process.env.PATH},input:body?JSON.stringify(body):undefined,encoding:'utf8',timeout:60000,maxBuffer:10*1024*1024});
  if(r.status!==0) throw new Error('Vercel request failed: '+method+' '+path.split('?')[0]);
  const parsed=JSON.parse(r.stdout);
  if(parsed.error) throw new Error('Vercel API rejected request: '+(parsed.error.code??'unknown'));
  return parsed;
}
async function telegram(method, body={}) {
  const r=await fetch('https://api.telegram.org/bot'+token+'/'+method,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(20000)});
  const j=await r.json();
  if(!j.ok) throw new Error('Telegram '+method+' failed: HTTP '+r.status);
  return j.result;
}
async function identity() {
  const me=await telegram('getMe');
  if(me.username!=='wellook_bot') throw new Error('Refusing to switch: token is not wellook_bot');
  console.log(JSON.stringify({verifiedBot:me.username}));
}
function envs(project) { return api('/v9/projects/'+project+'/env').envs; }
function update(project, key, value, type) {
  const matches=envs(project).filter(e=>e.key===key && (Array.isArray(e.target)?e.target:[e.target]).some(t=>['production','preview'].includes(t)) && !e.gitBranch);
  if(!matches.length) throw new Error('Expected variable missing: '+key);
  for(const e of matches) api('/v9/projects/'+project+'/env/'+e.id,'PATCH',{value,type});
  console.log(JSON.stringify({updated:key,project,entries:matches.length}));
}
function deployment(d) { return {id:d.id,url:d.url,state:d.readyState??d.state,target:d.target,commit:d.meta?.githubCommitSha,crons:d.crons}; }
try {
  await identity();
  const mode=process.argv[2];
  if(mode==='inspect') {
    const w=await telegram('getWebhookInfo');
    console.log(JSON.stringify({webhookUrl:w.url,pending:w.pending_update_count,lastError:w.last_error_message}));
    for(const p of [app,bot]) console.log(JSON.stringify({project:p,envs:envs(p).map(e=>({key:e.key,id:e.id,target:e.target,type:e.type}))}));
  } else if(mode==='configure') {
    update(app,'TELEGRAM_BOT_TOKEN',token,'sensitive');
    update(bot,'TELEGRAM_BOT_TOKEN',token,'sensitive');
    update(bot,'TELEGRAM_WEBHOOK_SECRET',secret,'sensitive');
    update(bot,'MINI_APP_URL','https://look-notify.vercel.app','encrypted');
  } else if(mode==='deploy-app') {
    console.log(JSON.stringify(deployment(api('/v13/deployments','POST',{name:'look-notify',project:app,deploymentId:'dpl_AmWBxGD48m49Vx8nFrUmd3zPvmxg',target:'production'}))));
  } else if(mode==='deploy-bot') {
    console.log(JSON.stringify(deployment(api('/v13/deployments','POST',{name:'scvrdio',project:bot,deploymentId:'dpl_8DuGfMKNYhAmDT1eDVsj17SqBP18',target:'production'}))));
  } else if(mode==='status') {
    const id=process.argv[3];
    if(!/^dpl_[a-zA-Z0-9]+$/.test(id??'')) throw new Error('Invalid deployment id');
    console.log(JSON.stringify(deployment(api('/v13/deployments/'+id))));
  } else if(mode==='verify-app') {
    const chatId=Number(process.argv[3]);
    if(!Number.isSafeInteger(chatId)||chatId<=0) throw new Error('Invalid test account');
    const chat=await telegram('getChat',{chat_id:chatId});
    if(chat.type!=='private'||chat.id!==chatId) throw new Error('Expected private Telegram account');
    const params=new URLSearchParams({auth_date:String(Math.floor(Date.now()/1000)),user:JSON.stringify({id:chatId,first_name:chat.first_name??'User'})});
    const secretKey=crypto.createHmac('sha256','WebAppData').update(token).digest();
    const check=[...params].sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>`${k}=${v}`).join('\n');
    params.set('hash',crypto.createHmac('sha256',secretKey).update(check).digest('hex'));
    const origin='https://look-notify.vercel.app';
    const login=await fetch(origin+'/api/auth/telegram',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({initData:params.toString()}),signal:AbortSignal.timeout(20000)});
    console.log(JSON.stringify({serverAuthTest:login.status}));
    if(!login.ok) throw new Error('Server auth test failed');
    const cookie=login.headers.getSetCookie().find(c=>c.startsWith('tg_chat_id='))?.split(';')[0];
    if(!cookie) throw new Error('Session cookie missing');
    const library=await fetch(origin+'/api/bootstrap',{headers:{Cookie:cookie},signal:AbortSignal.timeout(60000)});
    if(!library.ok) throw new Error('Library test failed: HTTP '+library.status);
    const data=await library.json();
    console.log(JSON.stringify({libraryStatus:library.status,subscriptions:data.series.length,titles:data.series.map(s=>s.title)}));
    const anon=await fetch(origin+'/api/series',{signal:AbortSignal.timeout(20000)});
    console.log(JSON.stringify({anonymousLibraryStatus:anon.status}));
    if(data.series.length!==9||anon.status!==401) throw new Error('Unexpected library/access result');
  } else if(mode==='user-menu') {
    const chatId=Number(process.argv[3]);
    if(!Number.isSafeInteger(chatId)||chatId<=0) throw new Error('Invalid test account');
    console.log(JSON.stringify({userMenuSet:await telegram('setChatMenuButton',{chat_id:chatId,menu_button:{type:'web_app',text:'Look!',web_app:{url:'https://look-notify.vercel.app'}}})}));
    const menu=await telegram('getChatMenuButton',{chat_id:chatId});
    console.log(JSON.stringify({menuType:menu.type,menuUrl:menu.web_app?.url}));
    if(menu.web_app?.url?.replace(/\/$/,'')!=='https://look-notify.vercel.app') throw new Error('Menu URL mismatch');
  } else if(mode==='test-start') {
    const chatId=Number(process.argv[3]);
    if(!Number.isSafeInteger(chatId)||chatId<=0) throw new Error('Invalid test account');
    const chat=await telegram('getChat',{chat_id:chatId});
    if(chat.type!=='private'||chat.id!==chatId) throw new Error('Expected private Telegram account');
    const response=await fetch('https://scvrdio.vercel.app/api/telegram',{method:'POST',headers:{'Content-Type':'application/json','x-telegram-bot-api-secret-token':secret},body:JSON.stringify({message:{chat:{id:chatId,type:'private'},text:'/start'}}),signal:AbortSignal.timeout(20000)});
    console.log(JSON.stringify({testStartMenuStatus:response.status}));
    if(!response.ok) throw new Error('Start menu test failed');
    const menu=await telegram('getChatMenuButton',{chat_id:chatId});
    console.log(JSON.stringify({menuType:menu.type,menuUrl:menu.web_app?.url}));
    const w=await telegram('getWebhookInfo');
    console.log(JSON.stringify({webhookUrl:w.url,pending:w.pending_update_count,lastError:w.last_error_message}));
  } else if(mode==='verify-bot') {
    const response=await fetch('https://scvrdio.vercel.app/api/telegram',{method:'POST',headers:{'Content-Type':'application/json','x-telegram-bot-api-secret-token':secret},body:'{}',signal:AbortSignal.timeout(20000)});
    console.log(JSON.stringify({emptyWebhookTest:response.status}));
    if(!response.ok) throw new Error('Webhook handler test failed');
    const denied=await fetch('https://scvrdio.vercel.app/api/telegram',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}',signal:AbortSignal.timeout(20000)});
    console.log(JSON.stringify({unauthenticatedWebhookStatus:denied.status}));
    if(denied.status!==401) throw new Error('Webhook access test failed');
  } else if(mode==='connect') {
    // No drop_pending_updates: preserve commands users have already sent.
    console.log(JSON.stringify({webhookSet:await telegram('setWebhook',{url:'https://scvrdio.vercel.app/api/telegram',secret_token:secret,allowed_updates:['message','callback_query']})}));
    console.log(JSON.stringify({menuSet:await telegram('setChatMenuButton',{menu_button:{type:'web_app',text:'Look!',web_app:{url:'https://look-notify.vercel.app'}}})}));
    console.log(JSON.stringify({commandsSet:await telegram('setMyCommands',{commands:[{command:'start',description:'Открыть меню'},{command:'subscriptions',description:'Мои подписки'},{command:'search',description:'Найти сериал'},{command:'check_now',description:'Проверить новые серии'}]})}));
    const w=await telegram('getWebhookInfo');
    console.log(JSON.stringify({webhookUrl:w.url,pending:w.pending_update_count,lastError:w.last_error_message}));
  } else throw new Error('Unknown operation');
} catch(e) {
  const message=e instanceof Error?e.message:'Operation failed';
  console.error(message.includes(token)?'Operation failed (details hidden)':message);
  process.exitCode=1;
}
