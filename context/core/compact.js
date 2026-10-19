/* Pure source-addressed compaction. Neither source history nor numeric state is mutated. */
(function(root,factory){const local=typeof module==='object'&&module.exports,api=factory(local?require('./data-clone.js'):root.TavernContextDataCloneCore,local?require('./requests.js'):root.TavernContextRequestsCore);if(local)module.exports=api;else root.TavernContextCompactCore=api;})(globalThis,function(Clone,Requests){
  'use strict';
  const copy=v=>Clone.clone(v),same=(a,b)=>JSON.stringify(a)===JSON.stringify(b),kinds=['已发生','计划','传闻','不确定','未结事项'];
  const defaults={recentTurns:6,trigger:0.8,target:0.6,margin:0.1,responseTokens:2048,maxCalls:2};
  function fail(code,message){throw Object.assign(Error(message),{code});}
  const key=ref=>JSON.stringify([ref?.messageId,ref?.variantId,ref?.digest,ref?.ancestry]);
  // Encode macro/template delimiters only inside JSON strings. The original records
  // remain readable data; prompt-time ST/EJS scans cannot execute copied prose.
  const promptJSON=value=>JSON.stringify(value).replace(/"(?:\\.|[^"\\])*"/g,s=>s.replace(/[{}<>]/g,c=>'\\u'+c.charCodeAt(0).toString(16).padStart(4,'0')));
  function budget({contextSize,responseTokens,settings={}}){const p={...defaults,...settings};if(!Number.isFinite(contextSize)||!Number.isFinite(responseTokens)||contextSize<=responseTokens||responseTokens<0)fail('compact-budget','模型上下文或输出预算无效。');const margin=Math.ceil(contextSize*p.margin),input=Math.floor(contextSize-responseTokens-margin);if(input<=0)fail('compact-budget','当前模型没有可用于输入的上下文预算。');return {window:contextSize,output:responseTokens,margin,input,trigger:Math.floor(input*p.trigger),target:Math.floor(input*p.target)};}
  function valid(record,{actorId,rows,validSource,projectionVersion=0}){if(record?.schema!==1||(record.projectionVersion||0)!==projectionVersion||record.viewpointActorId!==actorId||record.status!=='ready'||!Array.isArray(record.sources)||!record.sources.length||!Array.isArray(record.items))return false;const available=new Map(rows.map(r=>[r.ref?.messageId,r.ref]));return record.sources.every(s=>{const current=available.get(s.messageId);return current&&current.variantId===s.variantId&&current.digest===s.digest&&validSource(s);});}
  function select(records,options){const taken=new Set(),usable=[],current=new Map(options.rows.map(r=>[r.ref?.messageId,r.ref]));for(const record of records||[]){if(!valid(record,options))continue;const rebased=record.sources.map(s=>copy(current.get(s.messageId)));if(rebased.some(s=>taken.has(key(s))))continue;usable.push({...copy(record),sources:rebased});rebased.forEach(s=>taken.add(key(s)));}const order=new Map(options.rows.map((r,i)=>[key(r.ref),i]));usable.sort((a,b)=>order.get(key(a.sources[0]))-order.get(key(b.sources[0])));return {records:usable,covered:taken};}
  function groups(rows){const result=[];let group=[];for(const row of rows){if(row.role==='user'&&group.length){result.push(group);group=[];}group.push(row);}if(group.length)result.push(group);return result;}
  function eligible(rows,{covered=new Set(),recentTurns=6}={}){
    const units=groups(rows);let cutoff=0,left=recentTurns;
    for(let i=units.length-1;i>=0;i--)if(units[i].some(r=>r.role==='assistant'&&!r.pending)&&--left===0){cutoff=i;break;}
    const stable=units.slice(0,cutoff);
    return stable.filter(unit=>unit.every(r=>r.ref&&!r.pending&&!covered.has(key(r.ref)))&&unit.some(r=>r.role==='assistant'));
  }
  function messages({actorId,rows,pinned=[]}){
    return [{role:'system',content:'你是对话的后台记忆整理器。只归纳所给的当前视角记录，不续写剧情、不扮演玩家、不发数值指令。每条信息区分已发生、计划、传闻、不确定、未结事项；保留否定、承诺条件、未完成事项、人物及时间顺序。表里的怀疑或误解是人物的看法，不能纠正成客观真相。不要猜缺失事实。只输出 JSON：{"covered":[全部输入 sourceId，按原顺序],"items":[{"kind":"已发生|计划|传闻|不确定|未结事项","text":"简短归纳","sourceIds":[依据 sourceId]}]}。不得增加其他字段。关键未结事项由程序另行保留，摘要不能替它们标记完成。'},
      {role:'user',content:JSON.stringify({viewpointActorId:actorId,messages:rows.map(r=>({sourceId:r.ref.variantId,role:r.role,body:r.text})),pinned})}];
  }
  function parse(text,{rows,actorId,id,createdAt,scope,projectionVersion=0}){
    const data=Requests.json(text),ids=rows.map(r=>r.ref.variantId),allowed=new Set(ids);
    if(!data||Object.keys(data).some(k=>!['covered','items'].includes(k))||!same(data.covered,ids)||!Array.isArray(data.items)||!data.items.length||data.items.length>100)fail('compact-shape','摘要覆盖范围或记录格式不正确，本次保留原文。');
    const items=data.items.map(item=>{if(!item||Object.keys(item).some(k=>!['kind','text','sourceIds'].includes(k))||!kinds.includes(item.kind)||typeof item.text!=='string'||!item.text.trim()||item.text.length>2000||!Array.isArray(item.sourceIds)||!item.sourceIds.length||new Set(item.sourceIds).size!==item.sourceIds.length||item.sourceIds.some(s=>!allowed.has(s)))fail('compact-source','摘要含有无效来源或字段，本次保留原文。');return {kind:item.kind,text:item.text.trim(),sourceIds:copy(item.sourceIds)};});
    return {schema:1,id,scope:copy(scope),viewpointActorId:actorId,projectionVersion,status:'ready',createdAt,sources:rows.map(r=>copy(r.ref)),items};
  }
  function render(records,pinned=[]){if(!records.length)return '';const covered=new Set(records.flatMap(r=>r.sources.map(key))),retained=pinned.filter(p=>covered.has(key(p.ref))).map(({id,kind,text})=>({id,kind,text}));return '【较早对话的归纳】以下为当前人物视角的历史记录。计划、传闻及未结事项不是已经发生的结果。数值以本轮正式状态为准。\n'+promptJSON({segments:records.map(r=>({id:r.id,items:r.items})),retained});}
  function create({source,store,requests,countTokens,project,now=()=>Date.now(),settings={}}={}){
    const config={...defaults,...settings};let running=null,lastError='',lastCode='',lastRun=null;
    const measure=async text=>{const n=await countTokens(text);if(!Number.isFinite(n)||n<0)fail('compact-tokenizer','宿主暂时无法估算输入长度，本次保留原文。');return Math.ceil(n);};
    async function run(input){
      const {rows,actorId,contextSize,outputTokens,fixedTokens=0,sessionId,pinned=[],projectionVersion=0,projection={}}=input,epoch=copy(source.capture());
      const check=()=>{if(!same(epoch,source.capture()))fail('compact-stale','压缩期间前文或人物已变化，本次结果未采用。');};
      check();const state=store.read();if(state.schema!==1)fail('compact-version','上下文压缩记录版本不匹配。');
      if(state.enabled===false){lastRun={disabled:true,projection:copy(projection)};return {rows:input.nativeRows,prompt:'',disabled:true};}
      const allRefs=[...rows.map(r=>r.ref),...(state.compactions||[]).flatMap(r=>r.sources||[]),...pinned.map(p=>p.ref)],checks=source.validSources?source.validSources(allRefs):allRefs.map(source.validSource),validity=new Map(allRefs.map((ref,i)=>[ref,checks[i]])),validRef=ref=>validity.get(ref)===true;
      if(rows.some(r=>!validRef(r.ref)))fail('compact-stale','压缩期间前文或人物已变化，本次结果未采用。');
      const b=budget({contextSize,responseTokens:outputTokens,settings:config}),selection=select(state.compactions,{actorId,rows,validSource:validRef,projectionVersion});
      const currentRefs=new Map(rows.map(r=>[r.ref.messageId,r.ref])),excluded=new Set((state.compactions||[]).filter(r=>r.status==='excluded'&&r.viewpointActorId===actorId).flatMap(r=>(r.sources||[]).filter(validRef).map(s=>currentRefs.get(s.messageId)).filter(Boolean).map(key)));
      const keptPins=pinned.filter(p=>validRef(p.ref)&&currentRefs.has(p.ref.messageId)).map(p=>({...p,ref:copy(currentRefs.get(p.ref.messageId))}));
      let selected=selection.records,covered=selection.covered,calls=0;
      const estimate=async()=>fixedTokens+await measure(JSON.stringify(rows.filter(r=>!covered.has(key(r.ref))).map(r=>({role:r.role,content:r.text})))+'\n'+render(selected,keptPins));
      const before=await estimate();check();let after=before;
      const notes=[];
      if(before>=b.trigger){
        while(after>b.target&&calls<config.maxCalls){
          const available=eligible(rows,{covered,recentTurns:config.recentTurns}).filter(unit=>unit.every(r=>!excluded.has(key(r.ref))));if(!available.length){notes.push('保留近期完整对话及停用摘要对应的原文，已无可归纳的旧段落。');break;}
          const chunk=[],auxBudget=Math.max(0,b.window-config.responseTokens-b.margin);
          for(const unit of available){const trial=[...chunk,...unit],size=await measure(JSON.stringify(messages({actorId,rows:trial,pinned:keptPins})));check();if(size>auxBudget){if(!chunk.length)notes.push('最早的完整对话轮次超过整理窗口，原文保留。');break;}chunk.push(...unit);}
          if(!chunk.length)break;
          const sourceKey=key(chunk[0].ref)+'|'+key(chunk.at(-1).ref)+(projectionVersion?'|projection:'+projectionVersion:''),retryRevision=state.retryRevision||0,prior=(store.read().receipts||[]).filter(r=>r.purpose==='compact'&&r.actorId===actorId&&r.sourceKey===sourceKey&&(r.retryRevision||0)===retryRevision);
          if(prior.some(r=>r.status==='no-gain')){notes.push('这段前文的摘要未缩短输入，保留原文；没有重复调用。');break;}
          if(prior.filter(r=>r.status==='failed'&&r.attempts>0).length>=2)fail('compact-retry-required','同一段前文已连续整理失败两次，自动尝试已停止。修正连接后，可在压缩页点击“允许重新整理”。');
          const id='compact_'+now()+'_'+chunk[0].ref.variantId,oldTokens=await measure(JSON.stringify(chunk.map(r=>({role:r.role,content:r.text}))));check();
          const response=await requests.run({purpose:'compact',actorId,messages:messages({actorId,rows:chunk,pinned:keptPins}),responseTokens:config.responseTokens,sessionId,sourceKey,retryRevision,validate:text=>parse(text,{rows:chunk,actorId,id,createdAt:now(),scope:epoch.scope,projectionVersion})});calls++;check();
          const candidate=response.value,newTokens=await measure(render([candidate],keptPins));check();
          const receipt={...response.receipt,kind:'compact',purpose:'compact',actorId,sourceKey,retryRevision,compactId:id,beforeTokens:oldTokens,afterTokens:newTokens,tokenSource:'host-estimate',viewpointActorId:actorId};
          if(newTokens>=oldTokens){await store.update(v=>{v.receipts.push({...receipt,status:'no-gain'});});notes.push('摘要没有缩短输入，本次保留原文。');break;}
          candidate.measurement={before:oldTokens,after:newTokens,source:'host-estimate'};
          await store.update(v=>{if(v.compactions.some(r=>r.id===candidate.id))fail('compact-duplicate','摘要编号已存在。');v.compactions.push(copy(candidate));v.receipts.push(receipt);});check();
          selected.push(candidate);selected.sort((a,b)=>rows.findIndex(r=>key(r.ref)===key(a.sources[0]))-rows.findIndex(r=>key(r.ref)===key(b.sources[0])));candidate.sources.forEach(s=>covered.add(key(s)));after=await estimate();check();
        }
      }
      const native=rows.filter(r=>!covered.has(key(r.ref))).map(r=>r.native),result={rows:native,prompt:render(selected,keptPins),compactionIds:selected.map(r=>r.id),beforeTokens:before,afterTokens:after,tokenSource:'host-estimate',budget:b,calls,notes,projection:copy(projection)};
      lastRun=copy({...result,rows:undefined,prompt:undefined});return result;
    }
    async function before(request){if(running)fail('compact-busy','上一轮上下文整理尚未结束。');lastError='';lastCode='';running=(async()=>{try{return await run(await project(request));}catch(e){lastError=e.message;lastCode=e.code||'';throw e;}finally{running=null;}})();return running;}
    return {before,status:()=>({busy:!!running,error:lastError,errorCode:lastCode,lastRun:copy(lastRun)}),records:()=>copy(store.read().compactions||[])};
  }
  return {defaults,key,budget,valid,select,groups,eligible,messages,parse,render,create};
});
