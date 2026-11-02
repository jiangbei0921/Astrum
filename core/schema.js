/* ASTRUM · Schema 校验层（P0-02）
 *
 * 对应冻结契约：
 *   docs/architecture/07-技术选型与接口规范.md §4.3（轻量 JSON Schema 子集）
 *   docs/architecture/P0-01-目标架构总蓝图.md §10.1（15 intent ↔ 12 kind）
 *   docs/architecture/15-架构接口与数据契约统一规范.md（唯一权威）
 *
 * 只做两件事：
 *   1) 一个零依赖的 JSON Schema 子集校验器（type/required/properties/items/enum/min/max）
 *   2) 固定的 15 intent 与 12 Schema kind 映射；smalltalk/unknown 走规则专属路径
 *
 * 不扩充 kind，不改现有业务输出格式，不参与 LLM 调用。
 */
(function (root) {
  'use strict';

  /* 07 §4.3 / P0-01 §10.1：LLM 可产出的 12 个 kind。
   * smalltalk / unknown 不在其中——它们是规则专属，LLM 不得产出。 */
  var SCHEMA_KINDS = [
    'tonight', 'target', 'event', 'cosmos', 'nova', 'helios',
    'photo', 'gear', 'gear-fit', 'chart', 'system-view', 'research'
  ];

  /* 代码侧 detectIntent 的 15 个 intent（P0-01 §10.1 逐行） */
  var INTENTS = [
    'smalltalk', 'tonight', 'cosmos', 'nova', 'helios', 'event',
    'system-view', 'chart', 'gear', 'gear-fit',
    'photo-target', 'observe-target', 'knowledge-target', 'intro-target', 'unknown'
  ];

  /* 冻结映射：photo-target → photo；observe/knowledge/intro-target → target。 */
  var INTENT_TO_KIND = {
    'tonight': 'tonight',
    'cosmos': 'cosmos',
    'nova': 'nova',
    'helios': 'helios',
    'event': 'event',
    'system-view': 'system-view',
    'chart': 'chart',
    'gear': 'gear',
    'gear-fit': 'gear-fit',
    'photo-target': 'photo',
    'observe-target': 'target',
    'knowledge-target': 'target',
    'intro-target': 'target'
  };

  var RULE_ONLY_INTENTS = ['smalltalk', 'unknown'];

  /* 07 §4.3 的 Muse 结构化输出 Schema，kind 枚举不扩不缩 */
  var INTENT_SCHEMA = {
    type: 'object',
    required: ['tasks', 'entities', 'complexity'],
    properties: {
      tasks: {
        type: 'array',
        items: {
          type: 'object',
          required: ['kind', 'confidence'],
          properties: {
            kind: { type: 'string', enum: SCHEMA_KINDS },
            confidence: { type: 'number', min: 0, max: 1 }
          }
        }
      },
      entities: {
        type: 'array',
        items: { type: 'string' }
      },
      complexity: { type: 'integer', min: 1, max: 4 }
    }
  };

  function isArray(v) {
    return Object.prototype.toString.call(v) === '[object Array]';
  }

  function isPlainObject(v) {
    return v !== null && typeof v === 'object' && !isArray(v);
  }

  function typeOk(value, type) {
    switch (type) {
      case 'object': return isPlainObject(value);
      case 'array': return isArray(value);
      case 'string': return typeof value === 'string';
      case 'number': return typeof value === 'number' && isFinite(value);
      case 'integer': return typeof value === 'number' && isFinite(value) && Math.floor(value) === value;
      case 'boolean': return typeof value === 'boolean';
      case 'null': return value === null;
      default: return true;
    }
  }

  function enumOk(value, list) {
    var i;
    for (i = 0; i < list.length; i++) {
      if (value === list[i]) return true;
      if (value && typeof value === 'object' && JSON.stringify(value) === JSON.stringify(list[i])) return true;
    }
    return false;
  }

  function joinPath(path, key) {
    if (/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key)) return path + '.' + key;
    return path + '["' + key + '"]';
  }

  function validate(value, schema, path) {
    var errors = [];
    walk(value, schema || {}, path || '$', errors);
    return { ok: errors.length === 0, errors: errors };
  }

  function pushError(errors, path, reason) {
    errors.push({ path: path, reason: reason });
  }

  function walk(value, schema, path, errors) {
    if (!schema || typeof schema !== 'object') return;
    var i, key, child;

    if (schema.type && !typeOk(value, schema.type)) {
      pushError(errors, path, '类型应为 ' + schema.type);
      return;
    }

    if (schema.enum && !enumOk(value, schema.enum)) {
      pushError(errors, path, '不在枚举范围');
    }

    if (typeof value === 'string') {
      if (schema.minLength != null && value.length < schema.minLength) {
        pushError(errors, path, '长度小于 ' + schema.minLength);
      }
      if (schema.maxLength != null && value.length > schema.maxLength) {
        pushError(errors, path, '长度大于 ' + schema.maxLength);
      }
    }

    if (typeof value === 'number' && isFinite(value)) {
      var min = schema.min != null ? schema.min : schema.minimum;
      var max = schema.max != null ? schema.max : schema.maximum;
      if (min != null && value < min) pushError(errors, path, '小于最小值 ' + min);
      if (max != null && value > max) pushError(errors, path, '大于最大值 ' + max);
    }

    if (isPlainObject(value)) {
      if (isArray(schema.required)) {
        for (i = 0; i < schema.required.length; i++) {
          key = schema.required[i];
          if (!Object.prototype.hasOwnProperty.call(value, key)) {
            pushError(errors, joinPath(path, key), '缺少必填字段');
          }
        }
      }
      if (isPlainObject(schema.properties)) {
        for (key in schema.properties) {
          if (Object.prototype.hasOwnProperty.call(schema.properties, key) &&
              Object.prototype.hasOwnProperty.call(value, key)) {
            child = schema.properties[key];
            walk(value[key], child, joinPath(path, key), errors);
          }
        }
      }
    }

    if (isArray(value) && schema.items) {
      for (i = 0; i < value.length; i++) {
        walk(value[i], schema.items, path + '[' + i + ']', errors);
      }
    }
  }

  function validateIntent(input) {
    return validate(input, INTENT_SCHEMA, '$');
  }

  function isRuleOnly(intent) {
    return RULE_ONLY_INTENTS.indexOf(intent) >= 0;
  }

  function kindForIntent(intent) {
    if (isRuleOnly(intent)) return null;
    return INTENT_TO_KIND[intent] || null;
  }

  root.AstroSchema = {
    SCHEMA_KINDS: SCHEMA_KINDS,
    INTENTS: INTENTS,
    INTENT_TO_KIND: INTENT_TO_KIND,
    RULE_ONLY_INTENTS: RULE_ONLY_INTENTS,
    INTENT_SCHEMA: INTENT_SCHEMA,
    validate: validate,
    validateIntent: validateIntent,
    isRuleOnly: isRuleOnly,
    kindForIntent: kindForIntent
  };
})(typeof window !== 'undefined' ? window : global);
