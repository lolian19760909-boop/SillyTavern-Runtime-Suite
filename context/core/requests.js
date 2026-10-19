/* Serial auxiliary calls. No chat messages, MVU commands or memory rows are written here. */
(function(root,factory){const api=factory(typeof module==='object'&&module.exports?require('./data-clone.js'):root.TavernContextDataCloneCore);if(typeof module==='object'&&module.exports)module.exports=api;else root.TavernContextRequestsCore=api;})(globalThis,function(Clone){
  'use strict';
  const copy=v=>Clone.clone(v),same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
  function fail(code,message){throw Object.assign(Error(message),{code});}
  function cancellable(promise,signal){return new Promise((resolve,reject)=>{const cancel=()=>{cleanup();reject(signal.reason||Error('请求已取消。'));},cleanup=()=>signal.removeEventListener('abort',cancel);if(signal.aborted)return cancel();signal.addEventListener('abort',cancel,{once:true});Promise.resolve(promise).then(v=>{cleanup();resolve(v);},e=>{cleanup();reject(e);});});}
  function create({bridge,capture,countTokens,now=()=>Date.now(),timeoutMs=120000,onRecord=()=>{}}={}){
    let queue=Promise.resolve(),disposed=false,next=0,active=null;const records=[],pending=new Set();
    const publish=record=>{try{onRecord(copy(record));}catch{}};
    function check(expected,signal){signal.throwIfAborted();if(disposed||!same(capture(),expected))fail('context-stale','故事、人物或前文已变化，这次整理结果未采用。');}
    function run({purpose,actorId,messages,responseTokens=2048,sessionId,sourceKey=null,retryRevision=0,validate=value=>value,signal}={}){
      if(!['compact','private-actor','visibility'].includes(purpose)||typeof actorId!=='string'||!actorId)fail('request-purpose','辅助请求用途或人物编号无效。');
      if(disposed)fail('request-closed','上下文请求服务已经关闭。');
      const expected=copy(capture()),input=copy(messages),controller=new AbortController(),createdAt=now();
      const record={id:'request_'+createdAt+'_'+(++next),purpose,actorId,scope:copy(expected.scope),sourceKey,retryRevision,status:'queued',stage:'queue',createdAt,inputChars:JSON.stringify(input).length,outputChars:0,inputEstimate:null,estimateSource:'unavailable',usage:null,attempts:0};
      const stop=()=>controller.abort(Object.assign(Error('辅助请求已取消。'),{code:'request-cancelled'}));
      if(signal?.aborted)stop();else signal?.addEventListener('abort',stop,{once:true});pending.add(controller);records.push(record);if(records.length>100)records.shift();publish(record);
      const task=async()=>{
        let timer;try{
          check(expected,controller.signal);active=record;record.status='running';record.stage='count';record.startedAt=now();publish(record);
          timer=setTimeout(()=>controller.abort(Object.assign(Error('上下文辅助请求超时，可重新尝试。'),{code:'request-timeout'})),timeoutMs);
          if(countTokens){try{const count=await cancellable(countTokens(JSON.stringify(input)),controller.signal);if(Number.isFinite(count)&&count>=0){record.inputEstimate=Math.ceil(count);record.estimateSource='host-estimate';}}catch(e){if(controller.signal.aborted)throw e;}}
          check(expected,controller.signal);const transport=bridge();
          if(!transport?.capabilities?.().auxiliary||typeof transport.request!=='function')fail('request-bridge','请启用 0.2.0 或更新的上下文桥及 Chat Completion 连接。');
          record.stage='request';record.attempts=1;publish(record);
          const response=await cancellable(transport.request({scope:copy(expected.scope),sessionId,messages:input,responseTokens,signal:controller.signal}),controller.signal);
          check(expected,controller.signal);record.outputChars=response.text.length;record.usage=copy(response.usage);record.model=response.model;record.provider=response.provider;record.stage='validate';
          const value=await validate(response.text);check(expected,controller.signal);record.status='complete';record.stage='complete';
          return {value,receipt:copy({...record,finishedAt:now(),durationMs:now()-record.startedAt})};
        }catch(e){record.status=controller.signal.aborted?'cancelled':'failed';record.errorCode=e.code||'request-failed';throw e;}
        finally{clearTimeout(timer);record.finishedAt=now();record.durationMs=record.startedAt===undefined?0:record.finishedAt-record.startedAt;pending.delete(controller);signal?.removeEventListener('abort',stop);if(active===record)active=null;publish(record);}
      };
      const result=queue.then(task);queue=result.catch(()=>{});return result;
    }
    function cancel(){for(const controller of pending)controller.abort(Object.assign(Error('辅助请求已取消。'),{code:'request-cancelled'}));}
    return {run,cancel,status:()=>({busy:!!active,pending:pending.size,active:active?copy(active):null,records:copy(records)}),destroy(){disposed=true;cancel();}};
  }
  function json(text){const raw=String(text).trim().replace(/^```(?:json)?\s*\n?/i,'').replace(/\n?```$/,'').trim();try{return JSON.parse(raw);}catch{fail('result-json','整理结果不是完整 JSON，本次未采用，可重试。');}}
  return {create,json};
});
