import assert from 'node:assert/strict';
import { readPlayerBusinessRoutePath } from '../../backend/src/domains/business/api/playerBusinessRoutePaths.ts';
import { createEmptyReadModels } from '../src/data/empty-read-models.js';
import { PlayerApi } from '../src/api/player-api.js';
import { createStudentProfileApiCall } from '../src/integrations/student-profile-api-call.js';
import { PLAYER_ENDPOINTS } from '../src/api/endpoints.js';
import { WRITE_INVALIDATIONS, IDEMPOTENT_WRITE_ENDPOINTS } from '../src/api/resource-plan.js';

for (const [key, endpoint] of Object.entries(PLAYER_ENDPOINTS)) {
  if (endpoint.method === 'GET') continue;
  assert.ok(Object.hasOwn(WRITE_INVALIDATIONS, key), `${key} requires an explicit refresh policy (including an intentional empty one)`);
  assert.ok(IDEMPOTENT_WRITE_ENDPOINTS.has(key), `${key} requires an explicit idempotency policy`);
}
const formationId = `bfp_${'a'.repeat(32)}`;
const cases = [
  ['businessFormationPropose', {legalName:'Test partnership', entityType:'partnership', industryCode:'general', owners:[{playerIdentifier:'PLAYER-A',ownershipBasisPoints:10000,capitalContribution:10}]}, {}, '/players/me/business/formations', ['business']],
  ['businessFormationRespond', {decision:'approve'}, {formationId}, `/players/me/business/formations/${formationId}/respond`, ['business']],
  ['businessFormationActivate', {}, {formationId}, `/players/me/business/formations/${formationId}/activate`, ['dashboard','business','banking','businessTreasury']],
];
for (const [endpoint, payload, params, path, invalidations] of cases) {
  const requests = [];
  const reads = [];
  const route = readPlayerBusinessRoutePath(path);
  assert.equal(route?.kind, 'businessCreate');
  assert.equal(route?.operation, endpoint.replace('businessFormation', 'formation'));
  if (params.formationId) assert.equal(route.formationKey, formationId);
  const api = new PlayerApi({authenticated:true, csrfToken:'C'.repeat(43), gameSessionId:'synthetic-game', writeCooldownMs:0,
    apiCall:createStudentProfileApiCall({request:async request => {
      if (request.method === 'GET') { reads.push(request.path); return {ok:true,data:{...createEmptyReadModels().business,configured:false,storeSales:{businessKey:"",currencyCode:"",sales:[],activity:[],recentReceiptCount:0,recentQuantitySold:0,recentGrossRevenue:0,recentCostOfGoodsSold:0,recentGrossMargin:0}}}; }
      requests.push(request);
      if (requests.length === 1) return {ok:false,status:503,error:{code:'service_unavailable',message:'Synthetic transient failure'}};
      return {ok:true,data:{accepted:true}};
    }})});
  await api.request('business');
  await api.request('business');
  assert.equal(reads.length, 1, 'second read must use actual cache');
  const generation = api.currentReadGeneration('business');
  await assert.rejects(api.execute(endpoint, payload, params));
  assert.equal(requests.length, 1, 'transport must not automatically retry mutation');
  assert.equal(api.currentReadGeneration('business'), generation);
  await api.request('business');
  assert.equal(reads.length, 1, 'failed mutation preserves cache');
  const result = await api.execute(endpoint, payload, params);
  assert.equal(requests.length, 2);
  assert.equal(requests[1].path, path);
  assert.ok(result.idempotencyKey);
  for (const request of requests) {
    assert.equal(request.payload.idempotencyKey, result.idempotencyKey);
    assert.equal(request.headers['idempotency-key'], result.idempotencyKey);
    assert.equal(request.headers['x-idempotency-key'], result.idempotencyKey);
  }
  assert.deepEqual(result.invalidatedResources, invalidations);
  assert.equal(api.currentReadGeneration('business'), generation + 1);
  await api.request('business');
  assert.equal(reads.length, 2, 'successful mutation evicts business cache and subsequent read refetches');
  const next = await api.execute(endpoint, payload, params);
  assert.notEqual(next.idempotencyKey, result.idempotencyKey, 'successful operation must retire retry key');
  if (params.formationId) {
    const other = await api.execute(endpoint, payload, {formationId:`bfp_${'b'.repeat(32)}`});
    assert.notEqual(other.idempotencyKey, result.idempotencyKey);
    assert.match(requests.at(-1).path, new RegExp(`bfp_${'b'.repeat(32)}`));
  }
}
console.log('Business formation: real PlayerApi → adapter → request sink; stable retry keys, header/body parity and explicit refresh policies pass.');
