(function(){
'use strict';
const install=document.getElementById('installApp');let promptEvent=null;
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();promptEvent=e;install.hidden=false});
install.onclick=async()=>{if(!promptEvent)return;await promptEvent.prompt();await promptEvent.userChoice;promptEvent=null;install.hidden=true};
window.addEventListener('appinstalled',()=>{install.hidden=true});
if(!('serviceWorker' in navigator)||!['https:','http:'].includes(location.protocol))return;
navigator.serviceWorker.register('./sw.js',{scope:'./'}).then(reg=>{
 const show=()=>{if(reg.waiting&&navigator.serviceWorker.controller)document.getElementById('updateNotice').hidden=false};show();
 reg.addEventListener('updatefound',()=>{const worker=reg.installing;worker?.addEventListener('statechange',()=>{if(worker.state==='installed')show()})});
 document.getElementById('applyUpdate').onclick=()=>{
  if(!confirm('Несохранённый текст в форме может пропасть после обновления. Обновить?'))return;
  reg.waiting?.postMessage({type:'SKIP_WAITING'});
 };
 let reloading=false,controllerWasPresent=!!navigator.serviceWorker.controller;navigator.serviceWorker.addEventListener('controllerchange',()=>{if(controllerWasPresent&&!reloading){reloading=true;location.reload()}controllerWasPresent=true});
}).catch(()=>{document.getElementById('syncStatus').textContent+=' Установка офлайн-версии не удалась; проверьте HTTPS и наличие sw.js.'});
})();
