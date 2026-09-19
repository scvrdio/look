// Run against a development preview WITHOUT Supabase configuration.
import assert from 'node:assert/strict';
const base = 'http://localhost:3000/api';
async function request(path, method = 'GET', body) {
  const response = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: response.status, data: await response.json() };
}
assert.equal((await request('/auth/telegram')).data.demo, true, 'Refusing to mutate non-demo data');
const before = (await request('/bootstrap')).data;
const originalWatched = before.episodesBySeason['169:1'][0].watched;
const originalPaused = before.series.find(s => s.id === '169').paused;
try {
  assert.equal((await request('/episodes/169:1:1', 'PATCH', {watched: !originalWatched})).status, 200);
  assert.equal((await request('/bootstrap')).data.episodesBySeason['169:1'][0].watched, !originalWatched);
  assert.equal((await request('/series/169', 'PATCH', {paused: !originalPaused})).status, 200);
  assert.equal((await request('/series')).data.find(s => s.id === '169').paused, !originalPaused);
  assert.equal((await request('/episodes/169:1:999', 'PATCH', {watched: true})).status, 404);
  assert.equal((await request('/episodes/169:1:1', 'PATCH', {watched: 'yes'})).status, 400);
  assert.equal((await request('/series/999999', 'DELETE')).status, 404);
  console.log('PASS: demo gate, watched persistence, pause persistence, invalid episode, invalid payload, nonmember access');
} finally {
  await request('/episodes/169:1:1', 'PATCH', {watched: originalWatched});
  await request('/series/169', 'PATCH', {paused: originalPaused});
}
