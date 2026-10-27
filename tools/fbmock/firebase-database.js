// a pretend Realtime Database: every tab keeps a copy and tells the others about each change
// tabs in different browser profiles: the test passes each change to the other tabs
const ch={postMessage:m=>{try{window.__relay&&window.__relay(m);}catch(e){}},onmessage:null};
window.__chIn=m=>{ch.onmessage&&ch.onmessage({data:m});};
let tree={};
const L=[];          // {path,type,cb,start}
const ondc={};       // path -> 1
window.__fbStats={writes:0,bytes:0,denied:0};
const clone=v=>v===undefined?null:JSON.parse(JSON.stringify(v));
function getAt(p){let n=tree;for(const k of p.split('/').filter(Boolean)){if(!n||typeof n!=='object')return null;n=n[k];}return n===undefined?null:n;}
function setAt(p,v){const ks=p.split('/').filter(Boolean);let n=tree;for(let i=0;i<ks.length-1;i++){if(!n[ks[i]]||typeof n[ks[i]]!=='object')n[ks[i]]={};n=n[ks[i]];}
  if(v===null)delete n[ks[ks.length-1]];else n[ks[ks.length-1]]=v;
  // clean empty parents
  for(let d=ks.length-1;d>0;d--){const pp=ks.slice(0,d);const o=getAt(pp.join('/'));if(o&&typeof o==='object'&&!Object.keys(o).length)setAt(pp.join('/'),null);else break;}}
function snap(key,v){return {key:key,val:()=>clone(v),exists:()=>v!==null&&v!==undefined};}
function okStart(l,v){return l.start==null||(v&&typeof v.t==='number'&&v.t>=l.start);}
function apply(p,v,local){
  const ks=p.split('/');const key=ks.pop();const parent=ks.join('/');
  const before=clone(getAt(p));setAt(p,v===null?null:clone(v));
  L.forEach(l=>{
    if(l.path!==parent)return;
    if(v===null){if(before!==null&&l.type==='removed')setTimeout(()=>l.cb(snap(key,before)),0);return;}
    if(before===null&&l.type==='added'&&okStart(l,v))setTimeout(()=>l.cb(snap(key,v)),0);
    if(before!==null&&l.type==='changed')setTimeout(()=>l.cb(snap(key,v)),0);
  });
  if(local)ch.postMessage({op:'set',p:p,v:v});
}
ch.onmessage=e=>{const m=e.data;
  if(m.op==='set')apply(m.p,m.v,false);
  else if(m.op==='hello')ch.postMessage({op:'dump',tree:tree});
  else if(m.op==='dump'){const walk=(o,pre)=>{Object.keys(o||{}).forEach(k=>{const v=o[k];const p=pre?pre+'/'+k:k;const d=p.split('/').length;
      if((p.startsWith('rooms/')&&d===3)||(p.startsWith('msgs/')&&d===3)){if(getAt(p)===null)apply(p,v,false);}else if(v&&typeof v==='object')walk(v,p);});};walk(m.tree,'');}
};
ch.postMessage({op:'hello'});
function uid(){return window.__fbAuth&&window.__fbAuth.currentUser?window.__fbAuth.currentUser.uid:null;}
function allowed(p,v){
  const ks=p.split('/');const u=uid();if(!u)return false;
  if(ks[0]==='rooms'&&ks.length===3)return ks[2].indexOf(u+'_')===0&&(v===null||(typeof v.p==='string'&&v.p.length<=4096&&typeof v.t==='number'&&Object.keys(v).length===2));
  if(ks[0]==='msgs'&&ks.length===3){const cur=getAt(p);if(v===null)return !!cur&&cur.u===u;return !cur&&v.u===u&&typeof v.d==='string'&&v.d.length<=2048&&typeof v.k==='string';}
  if(ks[0]==='webasks'&&ks.length===2){const cur=getAt(p);if(v===null)return !!cur&&cur.u===u;return !cur&&v.u===u&&typeof v.c==='string'&&v.c.indexOf('v1.')===0&&v.c.length<=2000&&typeof v.t==='number'&&Object.keys(v).length===3;}
  return false;
}
function resolveTs(v){if(v&&typeof v==='object'){const o={};Object.keys(v).forEach(k=>{o[k]=(v[k]&&v[k]['.sv']==='timestamp')?Date.now():v[k];});return o;}return v;}
export function getDatabase(){return {};}
export function ref(db,path){const ks=String(path||'').split('/');return {path:String(path||''),key:ks[ks.length-1]};}
export function push(r){const k=Date.now().toString(36)+Math.random().toString(36).slice(2,8);return ref(null,r.path+'/'+k);}
export function serverTimestamp(){return {'.sv':'timestamp'};}
export function set(r,v){if(window.__fbDead)return Promise.resolve();v=resolveTs(v);if(!allowed(r.path,v)){window.__fbStats.denied++;return Promise.reject({code:'PERMISSION_DENIED',message:'permission_denied'});}
  window.__fbStats.writes++;window.__fbStats.bytes+=JSON.stringify(v).length;apply(r.path,v,true);return Promise.resolve();}
export function remove(r){if(window.__fbDead)return Promise.resolve();if(getAt(r.path)===null)return Promise.resolve();if(!allowed(r.path,null)){window.__fbStats.denied++;return Promise.reject({code:'PERMISSION_DENIED'});}apply(r.path,null,true);return Promise.resolve();}
export function get(r){if(window.__fbNoRules)return Promise.reject({code:'PERMISSION_DENIED',message:'Permission denied'});return Promise.resolve(snap(r.key,getAt(r.path)));}
export function orderByChild(c){return {t:'order',c:c};}
export function startAt(v){return {t:'start',v:v};}
export function query(r,...cs){const q={path:r.path,key:r.key,start:null};cs.forEach(c=>{if(c.t==='start')q.start=c.v;});return q;}
function listen(r,type,cb){const l={path:r.path,type:type,cb:cb,start:r.start==null?null:r.start};L.push(l);
  if(type==='added'){const o=getAt(r.path)||{};Object.keys(o).forEach(k=>{if(okStart(l,o[k]))setTimeout(()=>{if(L.indexOf(l)>=0)cb(snap(k,o[k]));},0);});}
  return ()=>{const i=L.indexOf(l);if(i>=0)L.splice(i,1);};}
export function onChildAdded(r,cb){return listen(r,'added',cb);}
export function onChildChanged(r,cb){return listen(r,'changed',cb);}
export function onChildRemoved(r,cb){return listen(r,'removed',cb);}
export function onValue(r,cb){
  if(r.path==='.info/connected'){setTimeout(()=>cb(snap('connected',true)),0);return ()=>{};}
  if(r.path==='.info/serverTimeOffset'){setTimeout(()=>cb(snap('serverTimeOffset',0)),0);return ()=>{};}
  setTimeout(()=>cb(snap(r.key,getAt(r.path))),0);return ()=>{};
}
export function onDisconnect(r){return {remove:()=>{if(!allowed(r.path,null)&&!(r.path.startsWith('rooms/')&&r.path.split('/')[2].indexOf(uid()+'_')===0))return Promise.reject({code:'PERMISSION_DENIED'});ondc[r.path]=1;return Promise.resolve();},cancel:()=>{delete ondc[r.path];return Promise.resolve();}};}
export function goOffline(){}
export function goOnline(){}
// closing the tab (or losing the connection): the server runs the onDisconnect removals
window.__fbDrop=function(){Object.keys(ondc).forEach(p=>{if(getAt(p)!==null)apply(p,null,true);});};
window.addEventListener('pagehide',window.__fbDrop);
window.__fbTree=()=>tree;
