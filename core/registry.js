/* ASTRUM · Tool Registry（B6）
 *
 * 依据：docs/architecture/P0-01-目标架构总蓝图.md §5.1/§5.2/§5.3
 *       docs/architecture/15-架构接口与数据契约统一规范.md §7.1
 *       docs/architecture/07-技术选型与接口规范.md §4.2
 *
 * 只负责注册、查找、参数 Schema、依赖检查；不调度、不合并。
 * 12 项工具基线不扩张；compose.* 通过 Compose Adapter 复用旧业务能力。
 */
(function (root) {
  'use strict';

  var DEP_GLOBALS = {
    astro: ['Astro'],
    knowledge: ['KNOWLEDGE'],
    catalog: ['CATALOG'],
    agents: ['AgentCore'],
    gear: ['GEAR'],
    fit: ['FIT'],
    obsplan: ['OBSPLAN'],
    solarsystem: ['SolarView', 'SOLAR'],
    sources: ['Sources'],
    research: ['Research'],
    simbad: ['Simbad'],
    attachments: ['Attachments']
  };

  var PLACE_SCHEMA = {
    type: 'object',
    required: ['lat', 'lon'],
    properties: {
      lat: { type: 'number', min: -90, max: 90 },
      lon: { type: 'number', min: -180, max: 180 }
    }
  };

  var SPECS = [
    {
      id: 'kepler.ephemeris', version: '1.0.0', caps: ['compute'],
      argsSchema: {
        type: 'object',
        required: ['target', 'jd', 'place'],
        properties: {
          target: { type: 'string' },
          jd: { type: 'number', min: 2000000, max: 3000000 },
          place: PLACE_SCHEMA
        }
      },
      returns: 'CalcRecord[]', timeoutMs: 2000,
      cost: { ms: 10, tokens: 0, searches: 0 },
      permissions: { canProduceNumbers: true },
      idempotent: true, ttlMs: null, retry: { allowed: true, max: 1 }, deps: ['astro', 'agents'],
      run: runKeplerEphemeris
    },
    {
      id: 'kepler.visibility', version: '1.0.0', caps: ['compute'],
      argsSchema: {
        type: 'object',
        required: ['targets', 'jd', 'place'],
        properties: {
          targets: { type: 'array', items: { type: 'string' } },
          jd: { type: 'number', min: 2000000, max: 3000000 },
          place: PLACE_SCHEMA
        }
      },
      returns: 'CalcRecord[]', timeoutMs: 800,
      cost: { ms: 15, tokens: 0, searches: 0 },
      permissions: { canProduceNumbers: true },
      idempotent: true, ttlMs: null, retry: { allowed: true, max: 1 }, deps: ['astro', 'agents'],
      run: runVisibility
    },
    {
      id: 'kb.lookup', version: '1.0.0', caps: ['local'],
      argsSchema: {
        type: 'object', required: ['query'],
        properties: { query: { type: 'string' }, targets: { type: 'array', items: { type: 'string' } } }
      },
      returns: 'Target[]', timeoutMs: 300,
      cost: { ms: 5, tokens: 0, searches: 0 },
      permissions: { canProduceNumbers: false },
      idempotent: true, ttlMs: null, retry: { allowed: false, max: 0 }, deps: ['knowledge', 'catalog', 'agents'],
      run: runKbLookup
    },
    {
      id: 'evidence.search', version: '1.1.0', caps: ['search'],
      argsSchema: {
        type: 'object', required: ['query'],
        properties: {
          query: { type: 'string' },
          direction: { type: 'string', enum: ['positive', 'negative', 'counter'] }
        }
      },
      returns: 'EvidenceItem[]', timeoutMs: 12000,
      cost: { ms: 2500, tokens: 0, searches: 1 },
      permissions: { canProduceNumbers: false },
      idempotent: false, ttlMs: 0, retry: { allowed: false, max: 0 }, deps: ['research', 'sources'],
      run: runEvidenceSearch
    },
    {
      id: 'simbad.tap', version: '1.1.0', caps: ['search'],
      argsSchema: { type: 'object', required: ['query'], properties: { query: { type: 'string' } } },
      returns: 'EvidenceItem[]', timeoutMs: 10000,
      cost: { ms: 2000, tokens: 0, searches: 0 },
      permissions: { canProduceNumbers: false, canProduceIdentifiers: true },
      idempotent: true, ttlMs: 604800000, retry: { allowed: true, max: 1 }, deps: ['simbad'],
      run: runSimbadTap
    },
    {
      id: 'paper.search', version: '1.2.0', caps: ['search'],
      argsSchema: {
        type: 'object', required: ['query'],
        properties: {
          query: { type: 'string' },
          fulltext: { type: 'boolean' },
          maxFulltext: { type: 'number', min: 0, max: 6 },
          fulltextItems: { type: 'number', min: 1, max: 3 }
        }
      },
      returns: 'EvidenceItem[]', timeoutMs: 45000,
      cost: { ms: 3000, tokens: 0, searches: 1 },
      permissions: { canProduceNumbers: false },
      idempotent: false, ttlMs: 0, retry: { allowed: false, max: 0 }, deps: ['sources'],
      run: runPaperSearch
    },
    {
      id: 'llm.compose', version: '1.0.0', caps: ['llm'],
      argsSchema: { type: 'object', required: ['query'], properties: { query: { type: 'string' } } },
      returns: 'Answer', timeoutMs: 30000,
      cost: { ms: 3000, tokens: 1200, searches: 0 },
      permissions: { canProduceNumbers: false },
      idempotent: false, ttlMs: 0, retry: { allowed: false, max: 0 }, deps: ['sources'],
      run: runCompose
    },
    {
      id: 'fits.parse', version: '1.1.0', caps: ['local'],
      argsSchema: {
        type: 'object',
        properties: {
          text: { type: 'string' },
          base64: { type: 'string' },
          bytes: { type: 'array', items: { type: 'number', min: 0, max: 255 } }
        }
      },
      returns: 'FitsProduct', timeoutMs: 2000,
      cost: { ms: 5, tokens: 0, searches: 0 },
      permissions: { canProduceNumbers: true, localOnly: true },
      idempotent: true, ttlMs: null, retry: { allowed: false, max: 0 }, deps: ['attachments'],
      run: runFitsParse
    },
    {
      id: 'compare.curate', version: '1.0.0', caps: ['local'],
      argsSchema: { type: 'object', required: ['items'], properties: { items: { type: 'array' } } },
      returns: 'CuratedItem[]', timeoutMs: 500,
      cost: { ms: 5, tokens: 0, searches: 0 },
      permissions: { canProduceNumbers: false },
      idempotent: true, ttlMs: null, retry: { allowed: false, max: 0 }, deps: ['agents'],
      run: runCurate
    },
    {
      id: 'compose.target', version: '1.0.0', caps: ['compose'],
      argsSchema: { type: 'object', required: ['query'], properties: { query: { type: 'string' }, intent: { type: 'string' } } },
      returns: 'Answer', timeoutMs: 30000,
      cost: { ms: 0, tokens: 0, searches: 0 },
      permissions: { canProduceNumbers: false },
      idempotent: true, ttlMs: null, retry: { allowed: false, max: 0 }, deps: ['agents', 'astro', 'knowledge', 'catalog'],
      run: runCompose
    },
    {
      id: 'compose.domain', version: '1.0.0', caps: ['compose'],
      argsSchema: { type: 'object', required: ['query'], properties: { query: { type: 'string' }, intent: { type: 'string' } } },
      returns: 'Answer', timeoutMs: 30000,
      cost: { ms: 0, tokens: 0, searches: 0 },
      permissions: { canProduceNumbers: false },
      idempotent: true, ttlMs: null, retry: { allowed: false, max: 0 }, deps: ['agents', 'astro', 'knowledge', 'catalog', 'gear', 'fit', 'obsplan', 'solarsystem'],
      run: runCompose
    },
    {
      id: 'compose.simple', version: '1.0.0', caps: ['compose'],
      argsSchema: { type: 'object', required: ['query'], properties: { query: { type: 'string' }, intent: { type: 'string' } } },
      returns: 'Answer', timeoutMs: 30000,
      cost: { ms: 0, tokens: 0, searches: 0 },
      permissions: { canProduceNumbers: false },
      idempotent: true, ttlMs: null, retry: { allowed: false, max: 0 }, deps: ['agents', 'astro', 'catalog', 'solarsystem'],
      run: runCompose
    }
  ];

  var adapterRef = null;
  var AC = null;
  /* 浏览器默认允许外部检索；Node 测试默认离线，需显式 network:true。
   * 离线时真实工具返回 empty + network:'disabled'，不伪造证据。 */
  var networkEnabled = (typeof window !== 'undefined');

  function setRuntime(options) {
    options = options || {};
    adapterRef = options.adapter || null;
    AC = options.agentCore || root.AgentCore || null;
    if (options.network != null) networkEnabled = !!options.network;
  }

  function toolName(item) {
    if (!item) return '';
    var n = AC && AC.nameOf ? AC.nameOf(item) : null;
    return n || item.cn || item.en || item.id || item.key || '';
  }

  function resolveOne(name) {
    if (!AC || !AC.resolveTargets) return null;
    var hits = AC.resolveTargets(name);
    return hits && hits.length ? hits[0].item : null;
  }

  function calcFor(name, jd, place, ctx) {
    var item = resolveOne(name);
    var A = root.Astro;
    if (!item || !A) return null;
    var rec = { target: name, jd: jd, epoch: 'J2000', frame: 'topocentric', place: place };
    var ra = null, dec = null;
    if (item.kind === 'star' || item.kind === 'dso') {
      ra = item.ra; dec = item.dec;
    } else if (item.kind === 'planet' && A.planet) {
      var p = A.planet(item.key, jd);
      ra = p.ra; dec = p.dec;
    } else if (item.kind === 'moon' && A.moonPhase) {
      var m = A.moonPhase(jd);
      ra = m.ra; dec = m.dec;
    } else if (item.kind === 'sun' && A.sun) {
      var s = A.sun(jd);
      ra = s.ra; dec = s.dec;
    } else if (item.kind === 'kb' && item.entry) {
      /* KB 条目常以 entry.visual 指向星表 DSO；这里只做坐标归一，
       * 不复制 composeTarget 的展示逻辑。 */
      var CAT = root.CATALOG;
      var entry = item.entry;
      if (CAT && entry.visual) {
        var dso = CAT.dso.filter(function (d) { return d.k === entry.visual; })[0];
        if (dso) { ra = dso.ra; dec = dso.dec; }
      }
      if (ra == null && CAT && entry.type === 'constellation' && entry.abbr) {
        var con = CAT.constellations.filter(function (c) { return c.abbr === entry.abbr; })[0];
        if (con) {
          var memKey = con.lines.reduce(function (a, x) { return a.concat(x); }, [])
            .map(function (k) { return CAT.stars.filter(function (x) { return x.k === k; })[0]; })
            .filter(Boolean).sort(function (a, b) { return a.mag - b.mag; })[0];
          if (memKey) { ra = memKey.ra; dec = memKey.dec; }
        }
      }
      if (ra == null && CAT && entry.cn) {
        var st = CAT.stars.filter(function (x) { return x.cn === entry.cn; })[0];
        if (st) { ra = st.ra; dec = st.dec; }
      }
    }
    if (ra == null || dec == null) return rec;

    rec.ra = ra; rec.dec = dec;

    /* B8：优先用旧 Agent 的 ephemFor 生成完整星历形状，
     * 供 composeTarget/Tonight/Photo 直接复用，避免二次等价计算。 */
    if (ctx && AC && AC.ephemFor) {
      rec.ephem = AC.ephemFor(ra, dec, ctx);
    }
    if (rec.ephem && rec.ephem.now) {
      rec.alt = rec.ephem.now.alt;
      rec.az = rec.ephem.now.az;
    } else {
      var sky = A.altAz(ra, dec, jd, place.lat, place.lon);
      rec.alt = sky.alt; rec.az = sky.az;
    }
    return rec;
  }

  function runKeplerEphemeris(args, ctx) {
    var rec = calcFor(args.target, args.jd, args.place, ctx);
    if (!rec) return { ok: false, reason: 'target_not_found', retriable: false };
    return { ok: true, records: [rec] };
  }

  function runVisibility(args, ctx) {
    var records = [], i;
    for (i = 0; i < (args.targets || []).length; i++) {
      var rec = calcFor(args.targets[i], args.jd, args.place, ctx);
      if (rec) records.push(rec);
    }
    if (!records.length) return { ok: false, reason: 'target_not_found', retriable: false };
    return { ok: true, records: records };
  }

  function runKbLookup(args) {
    if (!AC || !AC.resolveTargets) return { ok: false, reason: 'agent_core_missing', retriable: false };
    var hits = AC.resolveTargets(args.query);
    return { ok: true, targets: hits, names: hits.map(function (h) { return toolName(h.item); }) };
  }

  function offlineResult(spec, args) {
    return {
      ok: true, items: [], evidenceIds: [], empty: true, network: 'disabled',
      note: 'offline registry：未执行外部检索，未伪造证据',
      provenance: {
        tool: spec && spec.id, query: args && args.query,
        network: 'disabled', retrievedAt: new Date().toISOString()
      }
    };
  }

  function searchResult(spec, args, res, direction) {
    var E = root.AstroEvidence;
    var meta = {
      tool: spec.id,
      query: args.query,
      direction: direction || '',
      retrievedAt: new Date().toISOString()
    };
    var items = [], seen = {};
    (res.items || []).forEach(function (it) {
      var ev = E && E.fromSourceItem ? E.fromSourceItem(it, meta) : null;
      if (!ev || seen[ev.evidenceId]) return;
      seen[ev.evidenceId] = 1;
      items.push(ev);
    });
    return {
      ok: true,
      items: items,
      evidenceIds: items.map(function (x) { return x.evidenceId; }),
      empty: items.length === 0,
      calls: res.calls || 0,
      errors: (res.errors || []).map(function (e) {
        return { name: e.name || 'endpoint', msg: e.msg || String(e), kind: e.kind || 'unknown' };
      }),
      provenance: {
        tool: spec.id, query: args.query, direction: direction || '',
        retrievedAt: meta.retrievedAt,
        endpoints: (res.providers || []),
        network: 'enabled'
      }
    };
  }

  function runSimbadTap(args, ctx, spec, cfg, depResults, runtime) {
    if (!networkEnabled) return offlineResult(spec, args);
    if (!root.Simbad || typeof root.Simbad.lookup !== 'function') {
      return { ok: false, reason: 'simbad_module_missing', kind: 'tool_error', retriable: false };
    }
    var query = String(args && args.query || '').trim();
    if (!query) return { ok: false, reason: 'empty_query', kind: 'args_invalid', retriable: false };
    return root.Simbad.lookup(query, { signal: runtime && runtime.signal }).then(function (res) {
      if (!res || res.ok !== true) {
        var reason = (res && res.reason) || 'unknown';
        if (reason === 'not-found' || reason === 'empty') {
          return {
            ok: true, items: [], evidenceIds: [], empty: true,
            reason: 'not-found',
            provenance: { tool: spec.id, query: query, network: 'enabled', retrievedAt: new Date().toISOString() }
          };
        }
        var kind = reason === 'timeout' ? 'timeout' : (reason === 'cancelled' ? 'cancelled' : 'network');
        return {
          ok: false, reason: reason, kind: kind,
          retriable: kind === 'timeout' || kind === 'network',
          pendingAbort: kind === 'cancelled'
        };
      }
      var info = res.info || {};
      var uri = 'https://simbad.cds.unistra.fr/simbad/sim-id?Ident=' + encodeURIComponent(query);
      var ev = root.AstroEvidence && root.AstroEvidence.fromSimbad
        ? root.AstroEvidence.fromSimbad(info, {
          query: query, uri: uri, from: res.from || 'network',
          host: res.host || '', retrievedAt: new Date().toISOString()
        }) : null;
      return {
        ok: true,
        items: ev ? [ev] : [],
        evidenceIds: ev ? [ev.evidenceId] : [],
        empty: !ev,
        raw: info,
        provenance: {
          tool: spec.id, query: query, service: 'SIMBAD TAP',
          from: res.from || 'network', host: res.host || '',
          retrievedAt: new Date().toISOString()
        }
      };
    }, function (e) {
      return { ok: false, reason: e && e.message ? e.message : String(e), kind: 'network', retriable: true };
    });
  }

  function runPaperSearch(args, ctx, spec, cfg, depResults, runtime) {
    if (!networkEnabled) return offlineResult(spec, args);
    if (!root.Sources || typeof root.Sources.searchMany !== 'function') {
      return { ok: false, reason: 'sources_module_missing', kind: 'tool_error', retriable: false };
    }
    var query = String(args && args.query || '').trim();
    if (!query) return { ok: false, reason: 'empty_query', kind: 'args_invalid', retriable: false };
    return root.Sources.searchMany([query], { types: ['paper'], maxCalls: 2, budgetMs: 10000 })
      .then(function (res) {
        var out = searchResult(spec, args, res, '');
        if (args.fulltext !== true || !out.items.length) return out;
        if (!root.AstroPaperFulltext) {
          out.fulltexts = [];
          out.fulltextErrors = [{ paperId: '', code: 'fulltext_module_missing', reason: '全文模块未加载' }];
          return out;
        }
        var tries = Math.min(3, Math.max(1, args.fulltextItems || 1));
        var items = out.items.slice(0, tries);
        var fulltexts = [], errors = [];
        function tryAt(i) {
          if (i >= items.length) {
            out.fulltexts = fulltexts;
            out.fulltextErrors = errors;
            return out;
          }
          return root.AstroPaperFulltext.get(items[i], {
            signal: runtime && runtime.signal,
            maxEvidenceChunks: args.maxFulltext || 4
          }).then(function (ft) {
            if (ft && ft.ok) {
              fulltexts.push({ paperId: ft.paperId, url: ft.url, evidence: ft.evidence, chunks: ft.chunks, parse: ft.parse });
              out.fulltexts = fulltexts;
              out.fulltextErrors = errors;
              return out;
            }
            errors.push({ paperId: ft && ft.paperId || '', code: ft && ft.code || 'fulltext_failed', reason: ft && ft.reason || '全文获取失败' });
            return tryAt(i + 1);
          });
        }
        return tryAt(0);
      })
      .catch(function (e) {
        return { ok: false, reason: e && e.message ? e.message : String(e), kind: 'network', retriable: true };
      });
  }

  function runEvidenceSearch(args, ctx, spec, cfg, depResults, runtime) {
    if (!networkEnabled) return offlineResult(spec, args);
    if (!root.Sources || typeof root.Sources.searchMany !== 'function') {
      return { ok: false, reason: 'sources_module_missing', kind: 'tool_error', retriable: false };
    }
    var query = String(args && args.query || '').trim();
    if (!query) return { ok: false, reason: 'empty_query', kind: 'args_invalid', retriable: false };
    return root.Sources.searchMany([query], {
      types: ['paper', 'encyclopedia', 'database'], maxCalls: 3, budgetMs: 10000
    }).then(function (res) {
      return searchResult(spec, args, res, args.direction || '');
    }).catch(function (e) {
      return { ok: false, reason: e && e.message ? e.message : String(e), kind: 'network', retriable: true };
    });
  }

  function runCompose(args, ctx, spec, cfg, depResults) {
    if (!adapterRef || !adapterRef.compose) {
      return { ok: false, reason: 'compose_adapter_missing', retriable: false };
    }
    var r = adapterRef.compose(args, ctx, cfg, depResults);
    return r;
  }

  function runFitsParse(args) {
    if (!root.AstroFits || typeof root.AstroFits.parse !== 'function') {
      return { ok: false, reason: 'fits_module_missing', kind: 'tool_error', retriable: false };
    }
    args = args || {};
    var input = null;
    if (typeof args.base64 === 'string' && args.base64) input = { base64: args.base64 };
    else if (Array.isArray(args.bytes) && args.bytes.length) input = { bytes: args.bytes };
    else if (typeof args.text === 'string' && args.text) input = { text: args.text };
    if (!input) return { ok: false, reason: 'fits_input_missing', kind: 'args_invalid', retriable: false };

    var product = root.AstroFits.parse(input);
    if (!product || product.ok !== true) {
      return {
        ok: false, reason: (product && product.errors && product.errors[0]) || 'fits_parse_failed',
        kind: 'parse', retriable: false, product: product || null
      };
    }
    var ev = root.AstroEvidence && root.AstroEvidence.fromFits
      ? root.AstroEvidence.fromFits(product, {
        retrievedAt: new Date().toISOString(), fileName: product.fileName || '',
        size: product.fileSize || 0
      }) : null;
    return {
      ok: true, product: product,
      items: ev ? [ev] : [], evidenceIds: ev ? [ev.evidenceId] : [],
      provenance: { tool: 'fits.parse', localOnly: true, retrievedAt: new Date().toISOString() }
    };
  }

  function runCurate(args) {
    if (!AC || !AC.curate) return { ok: false, reason: 'curate_missing', retriable: false };
    return { ok: true, items: AC.curate(args.items || []) };
  }

  function RegistryError(code, message) {
    var e = new Error(message);
    e.name = 'AstroRegistryError';
    e.code = code;
    return e;
  }

  function create(options) {
    setRuntime(options);
    var tools = {};

    function register(spec) {
      if (!spec || typeof spec !== 'object') throw RegistryError('E_TOOL_SHAPE', 'ToolSpec 必须是对象');
      if (typeof spec.id !== 'string' || !spec.id) throw RegistryError('E_TOOL_ID', 'ToolSpec.id 必须非空');
      if (tools[spec.id]) throw RegistryError('E_TOOL_DUPLICATE', '工具重复注册: ' + spec.id);
      if (!Array.isArray(spec.caps) || !spec.caps.length) throw RegistryError('E_TOOL_CAPS', spec.id + ' 缺少 caps');
      if (!spec.argsSchema || typeof spec.argsSchema !== 'object') throw RegistryError('E_TOOL_SCHEMA', spec.id + ' 缺少 argsSchema');
      if (typeof spec.timeoutMs !== 'number' || spec.timeoutMs <= 0) throw RegistryError('E_TOOL_TIMEOUT', spec.id + ' 缺少 timeoutMs');
      if (typeof spec.run !== 'function') throw RegistryError('E_TOOL_RUN', spec.id + ' 缺少 run');
      if (!Array.isArray(spec.deps)) throw RegistryError('E_TOOL_DEPS', spec.id + ' 缺少 deps');
      tools[spec.id] = spec;
      return registry;
    }

    function get(id) {
      return tools[id] || null;
    }

    function has(id) {
      return !!tools[id];
    }

    function list() {
      return Object.keys(tools).map(function (id) {
        var s = tools[id];
        return {
          id: s.id, version: s.version, caps: s.caps.slice(),
          argsSchema: s.argsSchema, cost: s.cost, timeoutMs: s.timeoutMs,
          deps: s.deps.slice(), idempotent: s.idempotent, ttlMs: s.ttlMs,
          retry: s.retry ? { allowed: !!s.retry.allowed, max: s.retry.max || 0 } : { allowed: false, max: 0 },
          permissions: s.permissions
        };
      });
    }

    function validateArgs(id, args) {
      var spec = get(id);
      if (!spec) return { ok: false, errors: [{ path: '$', reason: '工具未注册: ' + id }] };
      var S = root.AstroSchema;
      if (!S || !S.validate) return { ok: true, errors: [] };
      return S.validate(args, spec.argsSchema, '$');
    }

    function depLoaded(dep) {
      var names = DEP_GLOBALS[dep] || [dep];
      for (var i = 0; i < names.length; i++) {
        if (typeof root[names[i]] !== 'undefined') return true;
      }
      return false;
    }

    function checkDeps(id) {
      var spec = get(id);
      if (!spec) return { ok: false, reason: '工具未注册: ' + id };
      var missing = (spec.deps || []).filter(function (d) { return !depLoaded(d); });
      return missing.length
        ? { ok: false, reason: '缺少依赖: ' + missing.join(',') }
        : { ok: true };
    }

    var registry = {
      register: register,
      get: get,
      has: has,
      list: list,
      validateArgs: validateArgs,
      checkDeps: checkDeps,
      setRuntime: setRuntime
    };
    return registry;
  }

  function createDefault(options) {
    var r = create(options);
    SPECS.forEach(function (spec) { r.register(spec); });
    return r;
  }

  root.AstroRegistry = {
    SPECS: SPECS,
    DEP_GLOBALS: DEP_GLOBALS,
    create: create,
    createDefault: createDefault,
    RegistryError: RegistryError,
    setNetwork: function (on) { networkEnabled = !!on; },
    networkEnabled: function () { return networkEnabled; }
  };
})(typeof window !== 'undefined' ? window : global);
