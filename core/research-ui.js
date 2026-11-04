/* ASTRUM · Research Report UI（V1.1）
 *
 * 只负责把 answer.research 渲染成可折叠的报告卡片。
 * 外部论文标题/摘要/URL 一律转义；链接只允许 http(s) 且 noopener。
 * 不修改 sections，不依赖 DOM 之外的状态。
 */
(function (root) {
  'use strict';

  var doc = root.document;

  function L(s) {
    return root.I18N && root.I18N.t ? root.I18N.t(s) : s;
  }
  function T(s, a, b) {
    if (root.I18N && root.I18N.tpl) return root.I18N.tpl(s, a, b);
    return String(s).replace('{0}', a == null ? '' : a).replace('{1}', b == null ? '' : b);
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function node(tag, cls, html) {
    var n = doc.createElement(tag);
    if (cls) n.className = cls;
    if (html !== undefined) n.innerHTML = html;
    return n;
  }
  /* 外部数据（论文标题/摘要/URL/结论）一律走 textContent，不进入 innerHTML。 */
  function textNode(tag, cls, text) {
    var n = doc.createElement(tag);
    if (cls) n.className = cls;
    n.textContent = text == null ? '' : String(text);
    return n;
  }
  function safeHttp(u) {
    var s = String(u == null ? '' : u).trim();
    return /^https?:\/\/[^\s<>"']+$/i.test(s) ? s : '';
  }
  function levelLabel(level) {
    return { verified: L('已验证'), inferred: L('推断'), unknown: L('未证实') }[level] || L('未证实');
  }

  function kv(rows) {
    var box = node('div', 'kv kv-meta');
    rows.forEach(function (r) {
      box.appendChild(node('div', 'k', esc(r.label)));
      box.appendChild(node('div', 'v', esc(r.value)));
    });
    return box;
  }

  function block(title, inner) {
    var box = node('div', 'research-block');
    box.appendChild(node('div', 'sec-title', esc(title)));
    box.appendChild(inner);
    return box;
  }

  function rows(items) {
    var box = node('div', 'rows');
    items.forEach(function (it) {
      var row = node('div', 'row-item');
      var top = node('div', 'top');
      top.appendChild(textNode('span', 'n', it.name));
      top.appendChild(textNode('span', 'mt', it.meta || ''));
      row.appendChild(top);
      if (it.text) row.appendChild(textNode('div', 'tx', it.text));
      var href = safeHttp(it.url);
      if (href) {
        var a = textNode('a', 'research-link', L('查看原文'));
        a.href = href;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        row.appendChild(a);
      }
      box.appendChild(row);
    });
    return box;
  }

  function mapRows(list, fn) {
    return rows((list || []).map(fn));
  }

  function render(rep) {
    if (!rep || typeof rep !== 'object' || !doc) return null;
    var rootEl = node('details', 'research-panel');
    /* 保持既有可折叠行为：默认展开，用户可收起。 */
    rootEl.open = true;
    var sum = node('summary', 'research-summary');
    sum.appendChild(textNode('span', 'ic', '◎'));
    sum.appendChild(textNode('span', '', L('科研依据')));
    sum.appendChild(textNode('span', 'mt', T('{0} 篇论文', (rep.papers || []).length)));
    rootEl.appendChild(sum);

    var body = node('div', 'research-body');
    body.appendChild(block(L('研究概览'), kv([
      { label: L('研究问题'), value: rep.question || '—' },
      { label: L('研究主题'), value: (rep.subject && rep.subject.names || []).join('、') || '—' },
      { label: L('检索时间'), value: rep.retrievedAt || '—' },
      { label: L('数据覆盖'), value: [
        'SIMBAD ' + (rep.coverage && rep.coverage.hasSimbad ? '✓' : L('未获取')),
        L('论文') + ' ' + ((rep.papers || []).length || L('未获取')),
        (rep.paperStats ? L('全文') + ' ' + rep.paperStats.fulltext + ' / ' + L('仅摘要') + ' ' + rep.paperStats.abstractOnly : ''),
        L('观测') + ' ' + ((rep.observations || []).length || L('未获取'))
      ].filter(Boolean).join(' · ') }
    ])));

    if ((rep.conclusions || []).length) {
      body.appendChild(block(L('核心研究结论'), mapRows(rep.conclusions.slice(0, 8), function (c) {
        return {
          name: levelLabel(c.level) + ' · ' + String(c.text || '').slice(0, 180),
          meta: [c.rule || '', c.evidenceScope || ''].filter(Boolean).join(' · '),
          text: (c.evidenceRefs || []).join('、')
        };
      })));
    }

    if ((rep.parameters || []).length) {
      body.appendChild(block(L('天体基础参数'), mapRows(rep.parameters.slice(0, 8), function (p) {
        return {
          name: p.label,
          meta: p.distanceLy ? p.distanceLy + ' ly' : '',
          text: (p.value || '') + ((p.evidenceRefs || []).length ? ' · ' + p.evidenceRefs.join('、') : '')
        };
      })));
    }

    if ((rep.papers || []).length) {
      /* V1.10：论文条目的标题/摘要统一交给动态内容国际化层。
       * 中文模式中文优先并保留英文原文；英文模式显示原文。 */
      if (root.AstroContentI18n && typeof root.AstroContentI18n.renderCard === 'function') {
        var pbox = node('div', 'paper-list');
        rep.papers.slice(0, 6).forEach(function (p) {
          pbox.appendChild(root.AstroContentI18n.renderCard({
            originalTitle: p.title, originalAbstract: p.excerpt || '',
            authors: p.authors, date: p.date, doi: p.doi, arxivId: p.arxivId,
            url: p.url, version: p.version, source: p.fulltextAvailable ? null : 'abstract',
            fulltextAvailable: p.fulltextAvailable, pageCount: p.pageCount,
            sections: p.sections, abstractOnly: p.abstractOnly
          }, {
            variant: 'research',
            deferTranslation: true,
            onAsk: function (paper) {
              if (root.__astrum && typeof root.__astrum.ask === 'function') {
                root.__astrum.ask('介绍并核对「' + (paper.originalTitle || paper.title || '') + '」的研究结果');
              }
            }
          }));
        });
        /* 折叠面板默认展开时立即翻译可见论文；用户收起后再展开时按需补译。 */
        function translateCards() {
          pbox.querySelectorAll('.paper-card').forEach(function (card) {
            if (typeof card._astrumTranslate === 'function') {
              var fn = card._astrumTranslate;
              card._astrumTranslate = null;
              fn();
            }
          });
        }
        rootEl.ontoggle = function () {
          if (rootEl.open) translateCards();
        };
        var pblock = block(L('相关论文'), pbox);
        pblock.classList.add('paper-block');
        body.appendChild(pblock);
        if (rootEl.open) translateCards();
      } else {
        var pblock2 = block(L('相关论文'), mapRows(rep.papers.slice(0, 6), function (p) {
          return {
            name: p.title,
            meta: [(p.authors || []).slice(0, 3).join('、'), p.date || '', p.doi ? 'DOI ' + p.doi : '',
              p.fulltextAvailable ? L('全文') + (p.pageCount ? ' · ' + p.pageCount + L('页') : '') : L('仅摘要')]
              .filter(Boolean).join(' · '),
            text: [p.excerpt || '', p.fulltextAvailable && (p.sections || []).length
              ? L('全文范围') + '：' + p.sections.slice(0, 4).join('、') : ''].filter(Boolean).join(' · '),
            url: p.url
          };
        }));
        pblock2.classList.add('paper-block');
        body.appendChild(pblock2);
      }
    }

    if ((rep.observations || []).length) {
      body.appendChild(block(L('观测数据'), mapRows(rep.observations.slice(0, 4), function (o) {
        return {
          name: o.fileName,
          meta: [o.hduCount ? o.hduCount + ' HDU' : '', o.telescope || '', o.instrument || ''].filter(Boolean).join(' · '),
          text: [o.summary, (o.warnings || []).join('；')].filter(Boolean).join(' · ')
        };
      })));
    }

    if ((rep.evidence || []).length) {
      body.appendChild(block(L('证据验证'), mapRows(rep.evidence.slice(0, 10), function (e) {
        return {
          name: e.title || e.evidenceId,
          meta: [e.sourceType || '', e.trust && e.trust.level ? e.trust.level : '',
            e.abstractOnly ? L('仅摘要') : ''].filter(Boolean).join(' · '),
          text: [e.evidenceId, e.uri || ''].filter(Boolean).join(' · '),
          url: e.uri
        };
      })));
    }

    if ((rep.conflicts || []).length) {
      body.appendChild(block(L('冲突与不确定性'), mapRows(rep.conflicts, function (c) {
        return {
          name: (c.family || '') + (c.spread == null ? '' : ' · ' + c.spread + '%'),
          meta: L('冲突'),
          text: (c.values || []).map(function (v) { return v.raw + (v.host ? ' (' + v.host + ')' : ''); }).join(' / ')
        };
      })));
    }

    var limits = (rep.gaps || []).slice();
    if ((rep.limitations || []).length) limits = limits.concat(rep.limitations);
    if ((rep.uncertainties || []).length) {
      limits = limits.concat((rep.uncertainties || []).slice(0, 5).map(function (u) {
        return (u.text || '') + (u.claimId ? ' · ' + u.claimId : '');
      }));
    }
    if (limits.length) {
      var limitBox = node('div', 'boundary',
        '<span class="lbl">' + esc(L('未获取')) + '</span>' + esc(limits.join('；')));
      body.appendChild(block(L('研究局限'), limitBox));
    }
    if (rep.disclaimer) body.appendChild(node('div', 'sec-note', esc(rep.disclaimer)));

    /* 论文优先：科研依据先给可直接阅读的论文列表，
     * 概览/参数/证据验证/冲突/局限收进二级折叠，不再与论文混排。 */
    var paperBlock = body.querySelector('.paper-block');
    if (paperBlock) {
      var detail = node('details', 'research-detail');
      detail.appendChild(node('summary', '', esc(L('科研详情（结论 / 参数 / 证据 / 局限）'))));
      var metaBody = node('div', 'research-detail-body');
      Array.prototype.slice.call(body.children).forEach(function (ch) {
        if (ch !== paperBlock) metaBody.appendChild(ch);
      });
      detail.appendChild(metaBody);
      body.insertBefore(paperBlock, body.firstChild);
      body.appendChild(detail);
    }
    rootEl.appendChild(body);
    return rootEl;
  }

  root.AstroResearchUI = { render: render, version: '1.1.0' };
})(typeof window !== 'undefined' ? window : global);
