// Migration to the original Look project. Never prints credentials or API bodies.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import crypto from 'node:crypto';
const team='team_Bd1Jcmk79L79kvSSCZa3r4iI';
const target='prj_1fVYqaZ3M1RIxGfsJY99aGa8IaAo';
const nodeDir='/Users/serezhaivlev/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin';
const pnpm='/Users/serezhaivlev/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/fallback/pnpm';
const statePath='.local-data/original-cutover.json';
const origin='https://look-green.vercel.app';
function api(path,method='GET',body) {
  const args=['dlx','vercel@59.23.1','api',path+(path.includes('?')?'&':'?')+'teamId='+team,'--raw','--method',method];
  if(body)args.push('--input','-');
  const r=spawnSync(pnpm,args,{env:{...process.env,PATH:nodeDir+':'+process.env.PATH},input:body?JSON.stringify(body):undefined,encoding:'utf8',timeout:60000,maxBuffer:10*1024*1024});
  if(r.status!==0)throw new Error('Vercel request failed: '+method+' '+path.split('?')[0]+(r.stderr?.includes('confirmation')?' (CLI confirmation required)':''));
  const d=JSON.parse(r.stdout);
  if(d.error)throw new Error('Vercel request rejected');
  return d;
}
async function botToken() {
  const envs=api('/v9/projects/'+target+'/env').envs;
  const item=envs.find(e=>e.key==='TELEGRAM_BOT_TOKEN'&&e.target.includes('production'));
  if(!item||item.type==='sensitive')throw new Error('Existing token is not readable');
  const env=api('/v1/projects/'+target+'/env/'+item.id);
  if(!env.value)throw new Error('Existing token unavailable');
  return env.value;
}
async function telegram(token,method,body={}) {
  let r;
  try {r=await fetch('https://api.telegram.org/bot'+token+'/'+method,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(20000)});}
  catch {throw new Error('Telegram connection failed');}
  const data=await r.json();
  if(!data.ok)throw new Error('Telegram '+method+' rejected request');
  return data.result;
}
async function verifiedToken() {
  const token=await botToken();
  const me=await telegram(token,'getMe');
  if(me.username!=='wellook_bot')throw new Error('Wrong bot identity');
  return token;
}
try {
  const mode=process.argv[2];
  if(mode==='inspect-token') {
    const envs=api('/v9/projects/'+target+'/env').envs;
    const item=envs.find(e=>e.key==='TELEGRAM_BOT_TOKEN'&&e.target.includes('production'));
    if(!item||item.type==='sensitive')throw new Error('Existing token is not readable');
    const env=api('/v1/projects/'+target+'/env/'+item.id+'?decrypt=true');
    if(!env.value)throw new Error('Existing token unavailable');
    const r=await fetch('https://api.telegram.org/bot'+env.value+'/getMe',{signal:AbortSignal.timeout(15000)});
    const d=await r.json();
    console.log(JSON.stringify({tokenValid:d.ok===true,bot:d.ok?d.result.username:null}));
  } else if(mode==='configure') {
    if(!fs.existsSync(statePath)) {
      fs.mkdirSync('.local-data',{recursive:true});
      fs.writeFileSync(statePath,JSON.stringify({TELEGRAM_WEBHOOK_SECRET:crypto.randomBytes(32).toString('hex'),CRON_SECRET:crypto.randomBytes(32).toString('hex')}),{mode:0o600,flag:'wx'});
    }
    const keys={...JSON.parse(fs.readFileSync(statePath,'utf8')),SUPABASE_URL:'https://aarbxzaofhpreyrqqyso.supabase.co',MINI_APP_URL:'https://look-green.vercel.app'};
    const envs=api('/v9/projects/'+target+'/env').envs;
    for(const [key,value]of Object.entries(keys)) {
      const type=key.endsWith('SECRET')?'sensitive':'encrypted';
      const current=envs.find(e=>e.key===key&&e.target.includes('production')&&!e.gitBranch);
      if(current)api('/v9/projects/'+target+'/env/'+current.id,'PATCH',{value,type});
      else api('/v10/projects/'+target+'/env','POST',{key,value,type,target:['production']});
      console.log(JSON.stringify({configured:key,project:'look'}));
    }
  } else if(mode==='readiness') {
    const envs=api('/v9/projects/'+target+'/env').envs;
    const names=new Set(envs.filter(e=>e.target.includes('production')&&!e.gitBranch).map(e=>e.key));
    const missing=['TELEGRAM_BOT_TOKEN','SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','TELEGRAM_WEBHOOK_SECRET','CRON_SECRET','MINI_APP_URL'].filter(k=>!names.has(k));
    console.log(JSON.stringify({project:'look',missing}));
    if(missing.length)process.exitCode=1;
  } else if(mode==='verify') {
    const token=await verifiedToken();
    const chat=await telegram(token,'getChat',{chat_id:367592308});
    if(chat.id!==367592308||chat.type!=='private')throw new Error('Wrong test account');
    const p=new URLSearchParams({auth_date:String(Math.floor(Date.now()/1000)),user:JSON.stringify({id:chat.id,first_name:chat.first_name??'User'})});
    const key=crypto.createHmac('sha256','WebAppData').update(token).digest();
    const check=[...p].sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>`${k}=${v}`).join('\n');
    p.set('hash',crypto.createHmac('sha256',key).update(check).digest('hex'));
    const login=await fetch(origin+'/api/auth/telegram',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({initData:p.toString()}),signal:AbortSignal.timeout(20000)});
    if(!login.ok)throw new Error('Telegram login failed: '+login.status);
    const cookie=login.headers.getSetCookie().find(c=>c.startsWith('tg_chat_id='))?.split(';')[0];
    if(!cookie)throw new Error('Session missing');
    const library=await fetch(origin+'/api/bootstrap',{headers:{Cookie:cookie},signal:AbortSignal.timeout(90000)});
    if(!library.ok)throw new Error('Library request failed: '+library.status);
    const d=await library.json();
    console.log(JSON.stringify({origin,loginStatus:login.status,libraryStatus:library.status,count:d.series.length,titles:d.series.map(s=>s.title)}));
    if(d.series.length!==9)throw new Error('Expected nine preserved subscriptions');
  } else if(mode==='dry-run') {
    const keys=JSON.parse(fs.readFileSync(statePath,'utf8'));
    const r=await fetch(origin+'/api/check?dryRun=1',{headers:{Authorization:'Bearer '+keys.CRON_SECRET},signal:AbortSignal.timeout(120000)});
    if(!r.ok)throw new Error('Dry run failed: '+r.status);
    const d=await r.json(); console.log(JSON.stringify(d));
    if(d.checked!==9||d.failed!==0||d.sent!==0)throw new Error('Unexpected notification result');
  } else if(mode==='connect') {
    const token=await verifiedToken();
    const keys=JSON.parse(fs.readFileSync(statePath,'utf8'));
    await telegram(token,'setWebhook',{url:origin+'/api/telegram',secret_token:keys.TELEGRAM_WEBHOOK_SECRET,allowed_updates:['message','callback_query']});
    const menu_button={type:'web_app',text:'Look!',web_app:{url:origin}};
    await telegram(token,'setChatMenuButton',{menu_button});
    await telegram(token,'setChatMenuButton',{chat_id:367592308,menu_button});
    const w=await telegram(token,'getWebhookInfo');
    const menu=await telegram(token,'getChatMenuButton',{chat_id:367592308});
    console.log(JSON.stringify({webhook:w.url,pending:w.pending_update_count,userMenu:menu.web_app?.url}));
    if(w.url!==origin+'/api/telegram'||menu.web_app?.url!==origin)throw new Error('Cutover mismatch');
  } else if(mode==='test-menu') {
    const keys=JSON.parse(fs.readFileSync(statePath,'utf8'));
    const r=await fetch(origin+'/api/telegram',{method:'POST',headers:{'Content-Type':'application/json','x-telegram-bot-api-secret-token':keys.TELEGRAM_WEBHOOK_SECRET},body:JSON.stringify({message:{chat:{id:367592308,type:'private'},text:'/start'}}),signal:AbortSignal.timeout(20000)});
    console.log(JSON.stringify({menuTestStatus:r.status}));if(!r.ok)throw new Error('Menu test failed');
  } else if(mode==='deployments') {
    const d=api('/v6/deployments?projectId='+target+'&limit=4');
    console.log(JSON.stringify(d.deployments.map(x=>({id:x.uid,url:x.url,state:x.state,commit:x.meta?.githubCommitSha,target:x.target}))));
  } else if(mode==='project') {
    const p=api('/v9/projects/'+target);
    console.log(JSON.stringify({id:p.id,name:p.name,buildCommand:p.buildCommand,installCommand:p.installCommand,rootDirectory:p.rootDirectory,framework:p.framework,crons:p.crons}));
  } else throw new Error('Unknown operation');
} catch(e) {console.error(e instanceof Error && !e.message.includes('https:') ? e.message : 'Operation failed; credential details withheld');process.exitCode=1;}
