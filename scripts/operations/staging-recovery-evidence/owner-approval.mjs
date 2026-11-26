import assert from 'node:assert/strict';

export const STAGING_REPOSITORY = 'kohnerbouchard-star/Student-Profile';
export const STAGING_REPOSITORY_ID = 1264495890;
export const STAGING_OWNER_ID = 287640607;
export const STAGING_OWNER_LOGIN = 'kohnerbouchard-star';
export const receiptDigestPattern = /^sha256:[a-f0-9]{64}$/;

export function requireStagingRepository(repository) {
  assert.equal(repository?.id, STAGING_REPOSITORY_ID, 'Staging repository ID mismatch');
  assert.equal(repository.full_name, STAGING_REPOSITORY, 'Staging repository mismatch');
  assert.equal(repository.owner?.id, STAGING_OWNER_ID, 'Staging repository owner changed');
}

export function requireRepositoryOwner(user) {
  assert.equal(user?.id, STAGING_OWNER_ID, 'Repository owner ID required');
  assert.equal(user.type, 'User', 'Repository owner must be a GitHub user');
}
