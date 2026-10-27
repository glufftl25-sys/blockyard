const auths={};
function tell(a){a.subs.forEach(f=>setTimeout(()=>f(a.currentUser),0));}
export function getAuth(app){const n=app&&app.name||'[DEFAULT]';if(!auths[n]){auths[n]={currentUser:null,subs:[],name:n,authStateReady:()=>Promise.resolve()};if(n==='net')window.__fbAuth=auths[n];}return auths[n];}
export function signInAnonymously(auth){
  if(window.__fbNoAnon)return Promise.reject({code:'auth/admin-restricted-operation'});
  auth.currentUser={uid:'anon'+Math.random().toString(36).slice(2,10),isAnonymous:true};tell(auth);
  window.__fbSignIns=(window.__fbSignIns||0)+1;
  return Promise.resolve({user:auth.currentUser});
}
export function onAuthStateChanged(a,f){a.subs.push(f);setTimeout(()=>f(a.currentUser),0);return ()=>{};}
export function signOut(a){a.currentUser=null;tell(a);return Promise.resolve();}
export function createUserWithEmailAndPassword(){return Promise.reject({code:'auth/operation-not-allowed'});}
export function signInWithEmailAndPassword(){return Promise.reject({code:'auth/operation-not-allowed'});}
export function sendPasswordResetEmail(){return Promise.resolve();}
export function sendEmailVerification(){return Promise.resolve();}
export function updateProfile(){return Promise.resolve();}
