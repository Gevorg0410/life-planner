/* Pure data conversion shared by the planner and tests. No credentials or network. */
(function(root){
'use strict';
const groups=['tasks','projects','goals','events','habits','careDaily','care','notes'];
const text=(v,max=100000)=>{if(v==null)return '';if(typeof v!=='string'||v.length>max)throw Error('Некорректный или слишком длинный текст');return v};
const date=v=>{v=text(v,10);if(v&&!/^\d{4}-\d{2}-\d{2}$/.test(v))throw Error('Некорректная дата');return v};
const number=(v,def=0)=>Number.isFinite(Number(v))?Number(v):def;
function cleanItem(kind,x){
 if(!x||typeof x!=='object'||!Number.isSafeInteger(x.id)||x.id<1)throw Error('Некорректный идентификатор записи');
 const r={id:x.id};
 const fields={tasks:['title'],projects:['title','status','result','next'],goals:['title','horizon','status','why'],events:['title','start','end','kind'],habits:['title','type'],careDaily:['title'],care:['title'],notes:['text','date'],books:['title','status','rating','note'],films:['title','status','rating','note'],quotes:['title','status','rating','note']}[kind];
 if(!fields)throw Error('Неизвестный тип записи');
 for(const key of fields)r[key]=text(x[key]);
 if(['tasks','events'].includes(kind))r.date=date(x.date);
 if(kind==='tasks')r.done=!!x.done;
 if(['tasks','projects','goals'].includes(kind)&&x.sphere!=null)r.sphere=Math.max(0,Math.min(9,Math.trunc(number(x.sphere))));
 if(kind==='projects'){if(x.steps!=null&&!Array.isArray(x.steps))throw Error('Некорректные этапы');r.steps=(x.steps||[]).slice(0,1000).map(s=>({title:text(s.title),done:!!s.done}))}
 if(kind==='habits'){if(x.logs!=null&&!Array.isArray(x.logs))throw Error('Некорректные отметки');r.target=Math.max(1,Math.min(7,number(x.target,3)));r.logs=[...new Set((x.logs||[]).map(date))]}
 return r;
}
function array(kind,value){if(value==null)return [];if(!Array.isArray(value)||value.length>10000)throw Error('Некорректный список '+kind);const items=value.map(x=>cleanItem(kind,x));if(new Set(items.map(x=>x.id)).size!==items.length)throw Error('Повторяются идентификаторы в '+kind);return items}
function empty(){return {tasks:[],projects:[],goals:[],events:[],habits:[],careDaily:[],care:[],notes:[],collections:{books:[],films:[],quotes:[]},sphereData:{},careChecks:{},mode:'Обычный',focus:'',careNotes:''}}
function normalize(x,strict=false){
 if(!x||typeof x!=='object'||Array.isArray(x))throw Error('Ожидается файл резервной копии LIFE');
 if(strict&&!['tasks','projects','habits'].every(k=>Array.isArray(x[k])))throw Error('Это не резервная копия LIFE');
 const r=empty();for(const k of groups)r[k]=array(k,x[k]);
 for(const k of ['books','films','quotes'])r.collections[k]=array(k,x.collections?.[k]);
 for(const k of ['mode','focus','careNotes'])if(x[k]!=null)r[k]=text(x[k]);
 for(let i=0;i<10;i++)if(x.sphereData?.[i]){const v=x.sphereData[i];r.sphereData[i]={vision:text(v.vision),current:text(v.current),notes:text(v.notes)}}
 for(const [k,v] of Object.entries(x.careChecks||{})){date(k);if(!v||typeof v!=='object')throw Error('Некорректный уход');r.careChecks[k]={};for(const [id,done] of Object.entries(v))if(/^\d+$/.test(id))r.careChecks[k][id]=!!done}
 return r;
}
const docId=(kind,key)=>kind+'--'+encodeURIComponent(String(key));
function flatten(value){const x=normalize(value),r={};const put=(kind,key,value)=>{const item={kind,key:String(key),value,deleted:false};if(new TextEncoder().encode(JSON.stringify(item)).length>800000)throw Error('Одна запись слишком большая (больше 800 КБ)');r[docId(kind,key)]=item};
 for(const k of groups)for(const item of x[k])put(k,item.id,item);
 for(const k of ['books','films','quotes'])for(const item of x.collections[k])put(k,item.id,item);
 for(const [k,v] of Object.entries(x.sphereData))put('sphere',k,v);
 for(const [k,v] of Object.entries(x.careChecks))put('checks',k,v);
 for(const k of ['mode','focus','careNotes'])put('setting',k,x[k]);return r;
}
function inflate(records){const r=empty();for(const doc of Object.values(records)){if(!doc||doc.deleted)continue;const {kind,key,value}=doc;if(groups.includes(kind))r[kind].push(value);else if(['books','films','quotes'].includes(kind))r.collections[kind].push(value);else if(kind==='sphere'&&/^\d$/.test(key))r.sphereData[key]=value;else if(kind==='checks')r.careChecks[key]=value;else if(kind==='setting'&&['mode','focus','careNotes'].includes(key))r[key]=value}return normalize(r)}
function diff(previous,next){const changes={};for(const [id,doc] of Object.entries(next))if(JSON.stringify(doc)!==JSON.stringify(previous[id]))changes[id]=doc;for(const [id,doc] of Object.entries(previous))if(!next[id])changes[id]={kind:doc.kind,key:doc.key,deleted:true};return changes}
root.LifeModel={normalize,empty,flatten,inflate,diff};
if(typeof module!=='undefined')module.exports=root.LifeModel;
})(globalThis);
