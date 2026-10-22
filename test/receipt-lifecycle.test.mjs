import test from 'node:test';
import assert from 'node:assert/strict';
import {createBridge} from '../context/bridge.mjs';
test('stream and nonstream receipt ordering preserves each variable mode and ignores duplicate delivery',async()=>{
 for(const streamed of [false,true])for(const mode of ['main','extra']){
  const handlers=new Map(),events=['GENERATION_AFTER_COMMANDS','MESSAGE_SENT','MESSAGE_RECEIVED','GENERATION_ENDED','GENERATION_STOPPED','CHAT_CHANGED','WORLDINFO_ENTRIES_LOADED','CHAT_COMPLETION_PROMPT_READY'];
  const context={characters:[{avatar:'fixture.png'}],characterId:0,getCurrentChatId:()=> 'fixture',eventTypes:Object.fromEntries(events.map(n=>[n,n])),eventSource:{on:(n,f)=>handlers.set(n,f),removeListener:n=>handlers.delete(n)},setExtensionPrompt(){},stopGeneration(){}};
  const bridge=createBridge({context:()=>context});let delivered=0,finished=0;
  let auxiliary=false,prepared=0;bridge.connect({scope:{character:'fixture.png',chat:'fixture',group:null},isAuxiliary:()=>auxiliary,prepare:async()=>{prepared++;},before:async request=>({rows:request.rows}),message:async request=>{assert(request.session);delivered++;},finish(){finished++;}});
  await handlers.get('GENERATION_AFTER_COMMANDS')('swipe',{},false);
  const primary=bridge.status().session.id;auxiliary=true;await handlers.get('GENERATION_AFTER_COMMANDS')('normal',{},false);auxiliary=false;assert.equal(bridge.status().session.id,primary);assert.equal(prepared,1);
  if(streamed){await handlers.get('GENERATION_ENDED')();assert(bridge.status().session.awaitingMessage);}
  await Promise.all([handlers.get('MESSAGE_RECEIVED')(3,'swipe'),handlers.get('MESSAGE_RECEIVED')(3,'swipe')]);
  if(!streamed)await handlers.get('GENERATION_ENDED')();
  assert.equal(delivered,1,mode);assert.equal(finished,1);assert.equal(bridge.status().session,null);bridge.destroy();
 }
});

test('continuation receipts normalize appendFinal only for the active continuation',async()=>{
 const handlers=new Map(),names=['GENERATION_AFTER_COMMANDS','MESSAGE_RECEIVED','GENERATION_ENDED'];
 const context={characters:[{avatar:'fixture.png'}],characterId:0,getCurrentChatId:()=> 'fixture',eventTypes:Object.fromEntries(names.map(n=>[n,n])),eventSource:{on:(n,f)=>handlers.set(n,f),removeListener:n=>handlers.delete(n)},setExtensionPrompt(){},stopGeneration(){}};
 // Supply the same capability surface as the real host.
 for(const n of ['MESSAGE_SENT','GENERATION_STOPPED','CHAT_CHANGED','WORLDINFO_ENTRIES_LOADED','CHAT_COMPLETION_PROMPT_READY'])context.eventTypes[n]=n;
 const bridge=createBridge({context:()=>context});const delivered=[];let finished=0;
 bridge.connect({scope:{character:'fixture.png',chat:'fixture',group:null},before:async r=>({rows:r.rows}),message:r=>delivered.push(r.type),finish(){finished++;}});
 for(const receipt of ['appendFinal','append','continue']){await handlers.get('GENERATION_AFTER_COMMANDS')('continue',{},false);await handlers.get('GENERATION_ENDED')();await handlers.get('MESSAGE_RECEIVED')(3,receipt);assert.equal(bridge.status().session,null);}
 assert.deepEqual(delivered,['continue','continue','continue']);assert.equal(finished,3);
 await handlers.get('GENERATION_AFTER_COMMANDS')('normal',{},false);await handlers.get('MESSAGE_RECEIVED')(3,'appendFinal');assert.equal(delivered.length,3);bridge.destroy();
});
