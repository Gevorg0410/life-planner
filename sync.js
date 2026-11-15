/* LIFE account isolation + durable per-record outbox. Firebase credentials are in firebase-config.js. */
(function(){
'use strict';
const $=id=>document.getElementById(id),M=window.LifeModel,app=window.lifeApp;
const cfg=window.LIFE_FIREBASE_CONFIG||{};
const configured=['apiKey','projectId','appId','authDomain'].every(k=>typeof cfg[k]==='string'&&cfg[k]&&!/[А-Яа-яЁё]/.test(cfg[k])&&!cfg[k].includes('YOUR_'));
const prefix='life_v03:'+new URL('./',location.href).pathname+':'+(configured?cfg.projectId:'local')+':';
let auth=null,db=null,packet=null,scope=null,base={},stop=null,epoch=0,releaseLock=null,flushing=false,flushTimer=null,serverSeen=false,lastError='';
const clone=x=>JSON.parse(JSON.stringify(x));
function message(text,error=false){$('accessMessage').textContent=text;$('accessMessage').classList.toggle('error',error)}
function status(){
 if(!scope)return;
 const count=Object.keys(packet.pending).length;
 $('retrySync').hidden=!lastError||scope==='local';
 let text=scope==='local'?'Сохранено только в этом браузере. Облачная синхронизация выключена.':lastError?lastError:!navigator.onLine?'Нет интернета. '+(count?count+' изменений ждут отправки.':'Открыта сохранённая копия.') :count?'Сохранено на устройстве. Отправка в облако: '+count:!serverSeen?'Открыта копия на устройстве. Проверяем облако…':'Сохранено в облаке';
 $('syncStatus').textContent=text;
}
function write(p){localStorage.setItem(prefix+scope,JSON.stringify(p))}
function read(key){const raw=localStorage.getItem(prefix+key);if(!raw)return null;const p=JSON.parse(raw);if(p.version!==1||!p.records||!p.pending||typeof p.ready!=='boolean')throw Error('Повреждена локальная копия. Не очищайте браузер; сначала сохраните её.');M.inflate(p.records);return p}
function freshPacket(local=false){return {version:1,records:local?M.flatten(app.empty()):{},pending:{},ready:local}}
function effective(p=packet){const records={...p.records};for(const [id,item] of Object.entries(p.pending))records[id]=item.doc;return records}
function redraw(){const data=M.inflate(effective());base=M.flatten(data);if(JSON.stringify(data)!==JSON.stringify(app.get()))app.set(data)}
function reveal(){ $('accessGate').hidden=true;$('plannerApp').hidden=false;$('plannerApp').inert=false;$('accountLabel').textContent=scope==='local'?'На этом устройстве':auth.currentUser?.email||'Личный аккаунт';$('leaveAccount').textContent=scope==='local'?'Войти в аккаунт':'Выйти';status()}
function lockGate(){ $('plannerApp').hidden=true;$('plannerApp').inert=true;$('accessGate').hidden=false; }
function deactivate(){epoch++;if(stop){stop();stop=null}clearTimeout(flushTimer);if(releaseLock){releaseLock();releaseLock=null}scope=null;packet=null;base={};serverSeen=false;lastError='';app.clearDrafts();document.querySelectorAll('#plannerApp input:not([type=checkbox]):not([type=file]),#plannerApp textarea').forEach(el=>{if(el.type!=='number')el.value=''});app.set(M.empty());lockGate()}
async function lockAccount(key,token){
 if(!navigator.locks)return true;
 return new Promise((resolve,reject)=>{navigator.locks.request(prefix+key,{ifAvailable:true},lock=>{if(!lock){resolve(false);return}if(token!==epoch){resolve(false);return}return new Promise(release=>{releaseLock=release;resolve(true)})}).catch(reject)});
}
function save(value){
 if(!scope||!packet?.ready)throw Error('Сначала дождитесь загрузки аккаунта.');
 const next=M.flatten(value),changes=M.diff(base,next),p=clone(packet);
 for(const [id,doc] of Object.entries(changes))if(scope==='local')p.records[id]=doc;else p.pending[id]={doc,mutation:crypto.randomUUID()};
 write(p);packet=p;base=next;status();clearTimeout(flushTimer);flushTimer=setTimeout(flush,350);
}
window.lifeStorage={save,replace:save,backupBeforeImport(){if(!scope)throw Error('Нет открытого аккаунта');localStorage.setItem(prefix+scope+':before-import',JSON.stringify(app.get()))}};
function errorText(error){
 const code=error?.code||'';
 if(code.includes('permission-denied'))return 'Нет доступа к Firestore. Проверьте опубликованные Rules и проект в firebase-config.js. Изменения остаются на устройстве.';
 if(code.includes('resource-exhausted'))return 'Исчерпана квота Firebase. Изменения остаются на устройстве; повторите позже.';
 if(code.includes('unauthenticated'))return 'Сессия истекла. Выйдите и войдите снова; очередь изменений сохранена на устройстве.';
 return 'Не удалось связаться с Firestore. Копия и очередь изменений остаются на устройстве. '+(error?.message||'');
}
function authError(error){const c=error?.code||'';return c.includes('invalid-credential')||c.includes('wrong-password')||c.includes('user-not-found')?'Не удалось войти. Проверьте почту и пароль планера.':c.includes('too-many-requests')?'Слишком много попыток. Попробуйте позже.':c.includes('operation-not-allowed')?'Включите Email/Password в Firebase → Authentication → Sign-in method.':c.includes('network-request-failed')?'Нет связи с Firebase. Для первого входа нужен интернет.':c.includes('invalid-api-key')?'Проверьте apiKey в firebase-config.js.':'Ошибка входа: '+(error?.message||c)}
async function flush(){
 if(flushing||!db||!scope||scope==='local'||!packet?.ready||!serverSeen||!navigator.onLine)return;
 const token=epoch,uid=scope;flushing=true;
 try{
  while(token===epoch&&Object.keys(packet.pending).length){
   const [id,item]=Object.entries(packet.pending)[0];
   await db.collection('users').doc(uid).collection('records').doc(id).set({...item.doc,mutation:item.mutation,updatedAt:firebase.firestore.FieldValue.serverTimestamp()});
   if(token!==epoch)break;
   const p=clone(packet);p.records[id]=item.doc;if(p.pending[id]?.mutation===item.mutation)delete p.pending[id];write(p);packet=p;lastError='';status();
  }
 }catch(error){if(token===epoch){lastError=errorText(error);status()}}
 finally{flushing=false;if(token!==epoch&&scope&&scope!=='local')flush()}
}
function listen(token){
 if(stop)stop();
 stop=db.collection('users').doc(scope).collection('records').onSnapshot({includeMetadataChanges:true},snapshot=>{
  if(token!==epoch)return;
  try{
   if(snapshot.metadata.fromCache&&!packet.ready)return;
   const p=clone(packet),records={};
   for(const doc of snapshot.docs){const v=doc.data();if(typeof v.kind!=='string'||typeof v.key!=='string')continue;records[doc.id]={kind:v.kind,key:v.key,deleted:!!v.deleted,...(!v.deleted?{value:v.value}:{})}}
   // An empty/stale cache must never remove the account's last known server records.
   if(!snapshot.metadata.fromCache)p.records=records;
   else p.records={...p.records,...records};
   if(!snapshot.metadata.fromCache){serverSeen=true;p.ready=true}
   M.inflate(effective(p));write(p);packet=p;lastError='';redraw();if(packet.ready)reveal();
   // Seed only generic care entries, once the empty server has actually answered.
   if(!snapshot.metadata.fromCache&&snapshot.docs.length===0&&Object.keys(packet.pending).length===0){app.set(app.empty());base={};save(app.get())}
   status();flush();
  }catch(error){lastError='Не удалось прочитать или сохранить копию: '+error.message;status();if(!packet?.ready)message(lastError,true)}
 },error=>{if(token!==epoch)return;lastError=errorText(error);status();if(!packet.ready)message(lastError,true)});
}
async function activate(key){
 deactivate();const token=epoch;
 try{
  const acquired=await lockAccount(key,token);if(token!==epoch)return;
  if(!acquired){message('Этот режим уже открыт в другой вкладке. Закройте её и обновите эту страницу.',true);return}
  scope=key;packet=read(key)||freshPacket(key==='local');
  if(packet.ready){redraw();reveal()}else message('Загружаем данные из Firestore. Для первого открытия нужен интернет…');
  if(key==='local'){write(packet);return}
  listen(token);
  setTimeout(()=>{if(token===epoch&&!packet.ready)message('База пока не ответила. Проверьте интернет, создание Firestore и правила доступа. Можно выйти и повторить вход.',true)},12000);
 }catch(error){message(error.message,true);if(scope){lastError=error.message;status()}}
}
function loadScript(path){return new Promise((resolve,reject)=>{const s=document.createElement('script');s.src=path;s.onload=resolve;s.onerror=()=>reject(Error('Не удалось загрузить '+path));document.head.append(s)})}
$('loginForm').addEventListener('submit',async e=>{e.preventDefault();if(!auth){message(configured?'Firebase ещё загружается или не удалось его подключить. Обновите страницу.':'Сначала заполните firebase-config.js.',true);return}$('loginSubmit').disabled=true;message('Входим…');try{await auth.signInWithEmailAndPassword($('loginEmail').value.trim(),$('loginPassword').value);$('loginPassword').value=''}catch(error){message(authError(error),true)}finally{$('loginSubmit').disabled=false}});
$('resetPassword').onclick=async()=>{if(!auth){message('Сначала настройте подключение Firebase.',true);return}const email=$('loginEmail').value.trim();if(!email||!$('loginEmail').checkValidity()){message('Введите вашу почту в поле выше.',true);return}try{await auth.sendPasswordResetEmail(email);message('Запрос отправлен. Если аккаунт существует, на почту придёт письмо для смены пароля.')}catch(error){message(authError(error),true)}};
$('localMode').onclick=()=>activate('local');
$('gateSignOut').onclick=()=>auth?.signOut().catch(error=>message(authError(error),true));
$('leaveAccount').onclick=async()=>{if(scope!=='local'&&Object.keys(packet?.pending||{}).length&&!confirm('Есть изменения, ещё не отправленные в облако. Они останутся в этом браузере для следующего входа. Выйти?'))return;if(scope!=='local'&&auth){try{await auth.signOut()}catch(error){alert(authError(error))}}else{deactivate();message(configured?'Войдите в аккаунт или выберите локальный режим.':'Заполните firebase-config.js для синхронизации.')}};
$('retrySync').onclick=()=>{if(!scope||scope==='local')return;lastError='';serverSeen=false;listen(epoch);status()};
window.addEventListener('online',()=>{lastError='';status();flush()});window.addEventListener('offline',status);
window.addEventListener('pageshow',e=>{if(e.persisted)location.reload()});
window.addEventListener('pagehide',()=>{if(releaseLock){releaseLock();releaseLock=null}});
// Export old storage without automatically mixing it into an account.
try{const raw=localStorage.getItem('life_app_v02')||localStorage.getItem('life_app_v01');if(raw){$('migrationNotice').hidden=false;$('downloadLegacy').onclick=()=>{try{const parsed=JSON.parse(raw);downloadJSON(parsed,'LIFE_legacy_backup.json')}catch{alert('Старая копия повреждена.')}}}}catch{}
(async()=>{
 $('setupNotice').hidden=configured;$('loginSubmit').disabled=!configured;$('resetPassword').hidden=!configured;
 if(!configured){message('Можно открыть локальный режим или сначала настроить Firebase.');return}
 message('Подключаем Firebase…');
 try{
  for(const name of ['app','auth','firestore'])await loadScript('./firebase-'+name+'-compat.js');
  firebase.initializeApp(cfg);auth=firebase.auth();db=firebase.firestore();
  // SDK cache is intentionally memory-only. The account-scoped outbox above is the durable offline store.
  // This avoids leaving a second persistent copy of private records after signing out.
  await auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);
  auth.onAuthStateChanged(user=>{$('gateSignOut').hidden=!user;if(user){$('localMode').hidden=true;activate(user.uid)}else{$('localMode').hidden=false;if(scope!=='local')deactivate();message('Войдите почтой и паролем из Firebase Authentication.')}},error=>message(authError(error),true));
 }catch(error){message('Подключение не удалось. Проверьте firebase-config.js и интернет. '+error.message,true);$('localMode').hidden=false}
})();
})();
