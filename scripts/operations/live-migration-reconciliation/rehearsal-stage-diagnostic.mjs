import assert from 'node:assert/strict';
import {writeFileSync,readFileSync,existsSync} from 'node:fs';
import path from 'node:path';import {fileURLToPath} from 'node:url';
export const REHEARSAL_STAGES=Object.freeze(['source-plan','capture-integrity','local-startup','local-network-isolation','local-authority-preflight','schema-capture','schema-row-boundary','local-schema-reset','local-schema-restore','purge-fixture-authority','purge-fixture-apply','local-prerequisite-install','local-prerequisite-verify','pre-schema-export','pre-catalog-export','ledger-capture','ledger-classification','ledger-prefix-verification','disposable-migration-apply','post-schema-export','post-catalog-export','runtime-catalog-fixture','canonical-schema-comparison','canonical-catalog-comparison','cleanup']);
export function stageDiagnostic(stage){
 return {schemaVersion:1,errorClass:'LOCAL_REHEARSAL_STAGE_FAILED',failureStage:REHEARSAL_STAGES.includes(stage)?stage:'unclassified-local-failure',failedMigration:null,failedVersion:null,failureSqlstate:null};
}
export function writeLocalStage(workDir,stage){
 assert(REHEARSAL_STAGES.includes(stage),'Unknown bounded stage');
 writeFileSync(path.join(workDir,'current-stage.txt'),stage+'\n',{mode:0o600});
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const [stage,destination]=process.argv.slice(2);
 let prior={};try{if(existsSync(destination))prior=JSON.parse(readFileSync(destination,'utf8'));}catch{}
 const bounded=stageDiagnostic(stage);
 const value={...bounded,...prior,failureStage:REHEARSAL_STAGES.includes(prior.failureStage)?prior.failureStage:bounded.failureStage};
 writeFileSync(destination,JSON.stringify(value)+'\n',{mode:0o600});
}
