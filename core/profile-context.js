/* ASTRUM · P0 可信档案上下文
 *
 * 唯一职责：向安全层提供「当前档案 + 本次页面会话」的可信快照。
 * 不提供任何 setter：profileId 只能来自 Profile.currentId()，
 * 业务调用方、Agent、工具参数都无法写入。
 */
(function (root) {
  'use strict';

  var SESSION_ID = 's' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

  function profileId() {
    return (root.Profile && root.Profile.currentId) ? root.Profile.currentId() : null;
  }

  function capture() {
    var pid = profileId();
    if (!pid) return null;
    return Object.freeze({
      profileId: pid,
      sessionId: SESSION_ID,
      capturedAt: Date.now()
    });
  }

  function current() { return capture(); }

  /* 页面刷新或档案切换后 SESSION_ID/档案必然变化；旧异步任务由此失效。 */
  function sameSession(snapshot) {
    return !!(snapshot &&
      snapshot.sessionId === SESSION_ID &&
      snapshot.profileId === profileId());
  }

  root.ProfileContext = {
    capture: capture,
    current: current,
    sameSession: sameSession,
    profileId: profileId,
    sessionId: function () { return SESSION_ID; },
    version: '1.0.0'
  };
})(typeof window !== 'undefined' ? window : global);
