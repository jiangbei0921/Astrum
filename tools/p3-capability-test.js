/**
 * ASTRUM P3 B3 · Capability Resolver 测试
 * 用法：node tools/p3-capability-test.js
 */
'use strict';

var path = require('path');
var ROOT = path.resolve(__dirname, '..');
require(path.join(ROOT, 'core/capability-resolver.js'));

var R = global.AstroCapabilityResolver;
var pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('PASS | ' + name); }
  else { fail++; console.log('FAIL | ' + name + ' | ' + (extra == null ? '' : extra)); }
}

var registry = {
  get: function (id) {
    if (id === 'evidence.search') return { id: id, version: '1.2.0' };
    if (id === 'compose.brief') return { id: id };
    return null;
  }
};

var r1 = R.resolve({ id: 't1', tool: 'evidence.search' }, { registry: registry });
ok('P3-C1-01 工具解析成功', r1.ok === true && r1.kind === 'tool' && r1.toolId === 'evidence.search');
ok('P3-C1-02 Agent 映射 scholar', r1.agentId === 'scholar');
ok('P3-C1-03 工具版本透出', r1.toolVersion === '1.2.0');

var r2 = R.resolve({ id: 't2', tool: 'compose.brief' }, { registry: registry });
ok('P3-C2-01 compose 归 muse', r2.ok === true && r2.agentId === 'muse');

var r3 = R.resolve({ id: 't3', tool: 'no.such' }, { registry: registry });
ok('P3-C2-02 工具缺失', r3.ok === false && r3.code === 'capability_missing' && r3.capability === 'no.such');

var skillLookup = function (id) {
  return id === 'skl_1' ? { version: { versionId: 'ver_2' } } : null;
};
var r4 = R.resolve({ id: 't4', kind: 'skill', skillId: 'skl_1' }, { skillLookup: skillLookup });
ok('P3-C3-01 Skill 解析成功', r4.ok === true && r4.kind === 'skill' && r4.versionId === 'ver_2');
ok('P3-C3-02 Skill 默认 Agent muse', r4.agentId === 'muse');
ok('P3-C3-03 step.agentId 优先', R.resolve({ id: 't5', kind: 'skill', skillId: 'skl_1', agentId: 'critic' },
  { skillLookup: skillLookup }).agentId === 'critic');

var r5 = R.resolve({ id: 't6', kind: 'skill', skillId: 'skl_missing' }, { skillLookup: skillLookup });
ok('P3-C4-01 Skill 未发布', r5.ok === false && r5.code === 'capability_missing');
ok('P3-C4-02 无能力步骤', R.resolve({ id: 't7' }, {}).ok === false);
ok('P3-C4-03 null 步骤', R.resolve(null, {}).ok === false);

/* 同时给出 tool 与 skillId 时优先 tool（P3-03 §4） */
var r6 = R.resolve({ id: 't8', tool: 'evidence.search', skillId: 'skl_1' }, { registry: registry, skillLookup: skillLookup });
ok('P3-C5-01 tool 优先', r6.ok === true && r6.kind === 'tool');

var store = {
  getPublished: function (id) {
    return Promise.resolve(id === 'skl_1' ? { version: { versionId: 'ver_9' } } : null);
  }
};
R.resolveAsync({ id: 't9', kind: 'skill', skillId: 'skl_1' },
  { skillStore: store, principal: { principalType: 'user' } })
  .then(function (r) {
    ok('P3-C6-01 异步 Skill 解析', r.ok === true && r.versionId === 'ver_9');
    return R.resolveAsync({ id: 't10', kind: 'skill', skillId: 'skl_none' },
      { skillStore: store, principal: { principalType: 'user' } });
  })
  .then(function (r) {
    ok('P3-C6-02 异步未发布', r.ok === false);
    console.log('\nRESULT ' + pass + '/' + (pass + fail));
    process.exit(fail ? 1 : 0);
  })
  .catch(function (e) {
    console.log('FAIL | 异步用例异常 | ' + e.message);
    console.log('\nRESULT ' + pass + '/' + (pass + fail + 1));
    process.exit(1);
  });
