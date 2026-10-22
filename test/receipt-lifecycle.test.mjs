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
