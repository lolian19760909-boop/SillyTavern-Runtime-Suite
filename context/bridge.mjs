// Host transport only: the card owns identities, persistence, viewpoint and compaction.
import { estimateFixed } from './fixed-budget.mjs';
export function createBridge({context,report=()=>{},auxiliary=null,fallback=()=>null,worldInfo=async()=>({}),memoryModes=null}){
  const PROMPT='cxx-context-bridge-v1',types=new Set([undefined,'normal','regenerate','swipe','continue']);
  const ctx=context(),events=ctx.eventTypes,bindings=[];
  let client=null,registered=null,session=null,destroyed=false,serial=0,lastError=null;const requests=new Set();
  const scope=()=>{const c=context();return {character:c.characters?.[c.characterId]?.avatar||null,chat:c.getCurrentChatId(),group:c.groupId||null};};
  const matches=(a,b)=>a&&b&&a.character===b.character&&a.chat===b.chat&&!a.group&&!b.group;
  function capabilities(){const c=context();return {protocol:1,auxiliary:typeof auxiliary==='function'&&c.mainApi==='openai',ready:typeof c.eventSource?.on==='function'&&typeof c.eventSource?.removeListener==='function'&&typeof c.setExtensionPrompt==='function'&&typeof c.stopGeneration==='function'&&['GENERATION_AFTER_COMMANDS','MESSAGE_SENT','MESSAGE_RECEIVED','GENERATION_ENDED','GENERATION_STOPPED','CHAT_CHANGED','WORLDINFO_ENTRIES_LOADED','CHAT_COMPLETION_PROMPT_READY'].every(n=>typeof c.eventTypes?.[n]==='string')};}
  function clear(){context().setExtensionPrompt(PROMPT,'',1,0,false,0);}
  function active(){if(destroyed)return false;const selected=registered&&matches(registered.scope,scope())?registered:fallback();client=selected&&matches(selected.scope,scope())?selected:null;return !!client;}
  function check(s){if(destroyed||session!==s||client!==s.client||!matches(s.scope,scope()))throw Error('生成期间故事或人物服务已变化，请重新发送。');}
  function failure(error){lastError={code:error?.code||'context-bridge',message:error?.message||String(error)};return lastError;}
  async function end(reason){for(const r of requests)r.abort(Error('辅助请求已停止：'+reason));const old=session;session=null;clear();if(old)try{await old.client.finish?.({id:old.id,reason});}catch(e){failure(e);}}
  async function generationEnded(reason){
    // Streaming ST unlocks its UI (and emits ENDED) before MESSAGE_RECEIVED.
    // Keep the generation receipt until its message has actually been indexed.
    const s=session;if(!s||s.error&&!s.intercepted)return end(reason);s.endReason=reason;clear();
    if(reason==='stopped'){for(const r of requests)r.abort(Error('辅助请求已停止：'+reason));try{await s.client.pause?.({id:s.id,reason});}catch(e){failure(e);}}
    if(session===s&&s.received)await end(reason);
  }
  async function request(value){
    if(!active()||!matches(value?.scope,scope())||typeof auxiliary!=='function')throw Error('当前故事没有可用的上下文辅助请求服务。');
    if(value.sessionId!==undefined&&value.sessionId!==session?.id)throw Error('辅助请求对应的回复已结束。');
    const owner=client,captured=scope(),id=value.sessionId,controller=new AbortController(),stop=()=>controller.abort(value.signal?.reason||Error('辅助请求已取消。'));
    if(value.signal?.aborted)stop();else value.signal?.addEventListener('abort',stop,{once:true});requests.add(controller);
    try{controller.signal.throwIfAborted();const result=await auxiliary({...value,signal:controller.signal});controller.signal.throwIfAborted();if(client!==owner||!matches(captured,scope())||id!==undefined&&session?.id!==id)throw Error('辅助请求期间故事已变化。');return result;}
    finally{requests.delete(controller);value.signal?.removeEventListener('abort',stop);}
  }
  async function prepare(type,options,dryRun){
    if(dryRun||!types.has(type)||!active())return;
    if(client.isAuxiliary?.({type,options,context:context()}))return;
    await end('superseded');if(!active())return;
    const s=session={id:++serial,client,scope:scope(),type,error:null,intercepted:false,received:false,deliveries:new Map()};lastError=null;
    try{s.memory=memoryModes?.resolve()||{mode:'summary'};if(s.memory.mode==='database'&&!client.memoryModes?.includes('database'))throw Error('当前卡的上下文适配器需要更新后才能使用数据库模式。');await client.prepare?.({id:s.id,type,scope:s.scope,memory:s.memory,context:context()});check(s);}catch(e){s.error=failure(e);}
  }
  async function message(kind,floor,type){
    if(kind==='assistant'&&!types.has(type))return;
    if(kind==='assistant'&&types.has(type)){clear();if(session)session.finalized=true;}
    if(!active())return;const owner=client,s=session,key=JSON.stringify([kind,floor,type||'normal']);
    if(s?.deliveries.has(key))return s.deliveries.get(key);
    const work=(async()=>{try{
      await owner.message?.({kind,floor,type,scope:scope(),context:context(),memory:s?.memory,session:s?.id??null});
      if(kind==='assistant'&&session===s&&s){s.received=true;if(s.endReason)await end(s.endReason);}
    }catch(e){const error=failure(e);s?.deliveries.delete(key);if(session===s&&s)s.error=error;else report(error.message);}})();
    s?.deliveries.set(key,work);return work;
  }
  async function intercept(rows,contextSize,abort,type){
    if(!types.has(type)||!active())return;
    const s=session;
    try{
      if(!s)throw Error('宿主未执行发送前准备事件，本次上下文处理已停止。');check(s);
      if(s.error)throw Object.assign(Error(s.error.message),{code:s.error.code});
      const result=await s.client.before({id:s.id,type,scope:s.scope,rows,contextSize,memory:s.memory,context:context()});check(s);
      if(!result||!Array.isArray(result.rows)||result.rows.some(row=>!rows.includes(row)))throw Error('卡内策略必须返回本次发送副本中的消息。');
      if(new Set(result.rows).size!==result.rows.length)throw Error('卡内策略返回了重复消息。');
      if(result.rows.some((row,i)=>i>0&&rows.indexOf(row)<rows.indexOf(result.rows[i-1])))throw Error('卡内策略改变了消息顺序。');
      if(result.prompt!==undefined&&typeof result.prompt!=='string')throw Error('上下文摘要格式无效。');
      rows.splice(0,rows.length,...result.rows);clear();if(result.prompt)context().setExtensionPrompt(PROMPT,result.prompt,1,result.rows.filter(row=>!row.is_system).length,true,0);
      s.intercepted=true;
    }catch(e){const error=failure(e);if(s)s.error=error;clear();abort(true);report(error.message);}
  }
  async function worldinfo(payload){
    const s=session;if(!s?.intercepted||s.finalized)return;
    try{check(s);const result=await s.client.worldinfo?.({id:s.id,scope:s.scope,payload});check(s);
      if(result===undefined)return;
      if(!Array.isArray(result.exclude)||result.exclude.some(x=>typeof x?.world!=='string'||!Number.isInteger(x.uid)))throw Error('世界书可见范围格式无效。');
      const hidden=new Set(result.exclude.map(x=>JSON.stringify([x.world,x.uid])));
      for(const key of ['globalLore','characterLore','chatLore','personaLore']){const rows=payload[key];if(Array.isArray(rows))rows.splice(0,rows.length,...rows.filter(row=>!hidden.has(JSON.stringify([row.world,row.uid]))));}
    }catch(e){s.error=failure(e);clear();context().stopGeneration?.();throw e;}
  }
  async function final(payload){const s=session;if(!s?.intercepted||s.finalized)return;try{check(s);if(s.error)throw Object.assign(Error(s.error.message),{code:s.error.code});const handled=await s.client.final?.({id:s.id,scope:s.scope,payload});check(s);if(handled===true){s.finalized=true;clear();}}catch(e){s.error=failure(e);clear();context().stopGeneration?.();throw e;}}
  for(const [name,fn]of [['GENERATION_AFTER_COMMANDS',prepare],['MESSAGE_SENT',(floor)=>message('user',floor)],['MESSAGE_RECEIVED',(floor,type)=>message('assistant',floor,type)],['WORLDINFO_ENTRIES_LOADED',worldinfo],['CHAT_COMPLETION_PROMPT_READY',final],['GENERATION_ENDED',()=>generationEnded('ended')],['GENERATION_STOPPED',()=>generationEnded('stopped')],['CHAT_CHANGED',()=>end('chat-changed')]]){
    if(events?.[name]){ctx.eventSource.on(events[name],fn);bindings.push([events[name],fn]);}
  }
  return {protocol:1,capabilities,intercept,request,
    async fixedBudget(request){return estimateFixed({context,type:request.type,contextSize:request.contextSize,worldInfo:await worldInfo()});},
    connect(value){if(destroyed)throw Error('上下文桥已卸载。');if(!capabilities().ready)throw Error('宿主缺少必要的上下文事件。');if(!matches(value?.scope,scope())||typeof value?.before!=='function')throw Error('卡内上下文服务或故事绑定无效。');if(registered&&matches(registered.scope,scope()))throw Error('当前已有上下文服务，请先解除旧绑定。');if(session)void end('adapter-changed');registered=value;client=value;return()=>{if(registered===value){void end('disconnected');registered=null;client=null;}};},
    status:()=>({protocol:1,receiptLifecycle:1,connected:!!registered,active:!!active(),mode:client===registered&&registered?'card':'native',memory:session?.memory||memoryModes?.status()||{mode:'summary'},session:session?{id:session.id,type:session.type,intercepted:session.intercepted,awaitingMessage:!!session.endReason&&!session.received}:null,error:lastError}),
    destroy(){if(destroyed)return;destroyed=true;void end('destroyed');registered=null;client=null;for(const [name,fn]of bindings)ctx.eventSource.removeListener(name,fn);bindings.length=0;}
  };
}
