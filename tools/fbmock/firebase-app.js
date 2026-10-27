const apps=[];
export function initializeApp(cfg,name){const a={cfg:cfg,name:name||'[DEFAULT]'};apps.push(a);return a;}
export function getApps(){return apps.slice();}
