import test from 'node:test';
import assert from 'node:assert/strict';
import { estimateFixed } from '../context/fixed-budget.mjs';
test('first reserve counts enabled preset, current card, persona, extension, prefill and native WI cap', async () => {
 const c={characterId:0,characters:[{avatar:'a',data:{description:'card'}}],getCurrentChatId:()=> 'chat',
  chatCompletionSettings:{openai_max_context:16000,prompts:[{identifier:'yes',content:'active'},{identifier:'no',content:'DISABLED'},{identifier:'continue',content:'continue',injection_trigger:['continue']}],prompt_order:[{character_id:100001,order:[{identifier:'yes',enabled:true},{identifier:'no',enabled:false},{identifier:'continue',enabled:true}]}],assistant_prefill:'PREFILL'},
  powerUserSettings:{persona_description:'persona'},extensionPrompts:{test:{value:'extension'},'cxx-context-bridge-v1':{value:'OLD_SUMMARY'}},getTokenCountAsync:async text=>text.length};
 const options={context:()=>c,contextSize:14000,worldInfo:{world_info_budget:25,world_info_budget_cap:1000}};
 const first=await estimateFixed(options);
 assert.equal(first.loreReserve,1000);assert.equal(first.promptTokens,'active\ncard\npersona\nextension\nPREFILL'.length);
 const next=await estimateFixed({...options,type:'continue'});
 assert(next.promptTokens>first.promptTokens);assert.notEqual(first.key,next.key);
 c.chatCompletionSettings.prompts[0].content='changed preset';
 assert.notEqual((await estimateFixed(options)).key,first.key);
});
