// One-time operator helper. Secret values never appear in output or argv.
import fs from 'node:fs';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
const team = 'team_Bd1Jcmk79L79kvSSCZa3r4iI';
const app = 'prj_5qTiYnVsjGybT9AobbPdVQh4HLgF';
const legacy = 'prj_y2pyJvtMyXP0CXbJp2BwIPb0c43r';
const pnpm = '/Users/serezhaivlev/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/fallback/pnpm';
const nodeDir = '/Users/serezhaivlev/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin';
const statePath = '.local-data/consolidation.json';
const origin = 'https://look-notify.vercel.app';
function api(path, method = 'GET', body) {
  const args = ['dlx','vercel@59.23.1','api',path+(path.includes('?')?'&':'?')+'teamId='+team,'--raw','--method',method];
  if (body) args.push('--input','-');
  // Deletion is used only by remove-setup-env for the two keys this helper created.
  if (method === 'DELETE') args.push('--dangerously-skip-permissions');
  const r = spawnSync(pnpm,args,{env:{...process.env,PATH:nodeDir+':'+process.env.PATH},input:body?JSON.stringify(body):undefined,encoding:'utf8',timeout:60000,maxBuffer:10*1024*1024});
  if (r.status !== 0) throw new Error(`Vercel ${method} ${path.split('?')[0]} failed`);
  const result = r.stdout.trim() ? JSON.parse(r.stdout) : {};
  if (result.error) throw new Error('Vercel request rejected: '+(result.error.code??'unknown'));
  return result;
}
const info = d => ({id:d.id??d.uid,url:d.url,state:d.readyState??d.state,target:d.target,commit:d.meta?.githubCommitSha,crons:d.crons});
function state() { return JSON.parse(fs.readFileSync(statePath,'utf8')); }
async function request(path, key, body) {
  const keys = state();
  const headers = {'Content-Type':'application/json'};
  if (key === 'TELEGRAM_WEBHOOK_SECRET') headers['x-telegram-bot-api-secret-token'] = keys[key];
  else if (key) headers.Authorization = 'Bearer '+keys[key];
  const r = await fetch(origin+path,{method:body === undefined?'GET':'POST',headers,body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(120000)});
  const result = await r.text();
  console.log(JSON.stringify({path,status:r.status,result:result.slice(0,1500)}));
  if (!r.ok) throw new Error('Application verification failed');
}
try {
  const mode = process.argv[2];
  if (mode === 'configure') {
    if (!fs.existsSync(statePath)) {
      fs.mkdirSync('.local-data',{recursive:true});
      fs.writeFileSync(statePath,JSON.stringify(Object.fromEntries(['TELEGRAM_WEBHOOK_SECRET','CRON_SECRET','TELEGRAM_SETUP_SECRET'].map(k=>[k,crypto.randomBytes(32).toString('hex')]))),{mode:0o600,flag:'wx'});
    }
    const keys = {...state(), TELEGRAM_SETUP_EXPIRES: String(Date.now()+60*60*1000)}, envs = api('/v9/projects/'+app+'/env').envs;
    for (const [key,value] of Object.entries(keys)) {
      const existing = envs.find(e=>e.key===key && e.target?.includes('production') && !e.gitBranch);
      if (existing) api('/v9/projects/'+app+'/env/'+existing.id,'PATCH',{value,type:'sensitive'});
      else api('/v10/projects/'+app+'/env','POST',{key,value,type:'sensitive',target:['production']});
      console.log(JSON.stringify({configured:key}));
    }
  } else if (mode === 'projects') {
    for (const p of [app,legacy]) {
      const d=api('/v9/projects/'+p);
      console.log(JSON.stringify({id:d.id,name:d.name,crons:d.crons,paused:d.paused,link:d.link?{type:d.link.type,repo:d.link.repo,repoId:d.link.repoId,productionBranch:d.link.productionBranch}:null}));
    }
  } else if (mode === 'list') {
    console.log(JSON.stringify(api('/v6/deployments?projectId='+app+'&limit=8').deployments.map(info)));
  } else if (mode === 'status') {
    const id=process.argv[3]; if (!/^dpl_[a-zA-Z0-9]+$/.test(id??'')) throw new Error('Invalid deployment');
    console.log(JSON.stringify(info(api('/v13/deployments/'+id))));
  } else if (mode === 'deploy') {
    const id=process.argv[3]; if (!/^dpl_[a-zA-Z0-9]+$/.test(id??'')) throw new Error('Invalid source deployment');
    const source=api('/v13/deployments/'+id);
    if (source.projectId!==app || source.readyState!=='READY') throw new Error('Source must be a ready Look deployment');
    console.log(JSON.stringify(info(api('/v13/deployments','POST',{name:'look-notify',project:app,deploymentId:id,target:'production'}))));
  } else if (mode === 'dry-run') await request('/api/check?dryRun=1','CRON_SECRET');
  else if (mode === 'connect') await request('/api/telegram/setup','TELEGRAM_SETUP_SECRET',{});
  else if (mode === 'verify-webhook') await request('/api/telegram','TELEGRAM_WEBHOOK_SECRET',{});
  else if (mode === 'test-start') await request('/api/telegram','TELEGRAM_WEBHOOK_SECRET',{message:{chat:{id:367592308,type:'private'},text:'/start'}});
  else if (mode === 'test-subscriptions') await request('/api/telegram','TELEGRAM_WEBHOOK_SECRET',{message:{chat:{id:367592308,type:'private'},text:'/subscriptions'}});
  else if (mode === 'remove-setup-env') {
    const envs=api('/v9/projects/'+app+'/env').envs;
    for(const e of envs.filter(e=>['TELEGRAM_SETUP_SECRET','TELEGRAM_SETUP_EXPIRES'].includes(e.key))) api('/v9/projects/'+app+'/env/'+e.id,'DELETE');
    console.log(JSON.stringify({removedTemporarySetupEnv:true}));
  } else throw new Error('Unknown operation');
} catch(e) {
  console.error(e instanceof Error ? e.message : 'Operation failed');
  process.exitCode=1;
}
