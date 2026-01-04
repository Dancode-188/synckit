var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// ../node_modules/lz-string/libs/lz-string.js
var require_lz_string = __commonJS({
  "../node_modules/lz-string/libs/lz-string.js"(exports, module) {
    var LZString = (function() {
      var f2 = String.fromCharCode;
      var keyStrBase64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";
      var keyStrUriSafe = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+-$";
      var baseReverseDic = {};
      function getBaseValue(alphabet, character) {
        if (!baseReverseDic[alphabet]) {
          baseReverseDic[alphabet] = {};
          for (var i = 0; i < alphabet.length; i++) {
            baseReverseDic[alphabet][alphabet.charAt(i)] = i;
          }
        }
        return baseReverseDic[alphabet][character];
      }
      var LZString2 = {
        compressToBase64: function(input) {
          if (input == null) return "";
          var res = LZString2._compress(input, 6, function(a) {
            return keyStrBase64.charAt(a);
          });
          switch (res.length % 4) {
            // To produce valid Base64
            default:
            // When could this happen ?
            case 0:
              return res;
            case 1:
              return res + "===";
            case 2:
              return res + "==";
            case 3:
              return res + "=";
          }
        },
        decompressFromBase64: function(input) {
          if (input == null) return "";
          if (input == "") return null;
          return LZString2._decompress(input.length, 32, function(index) {
            return getBaseValue(keyStrBase64, input.charAt(index));
          });
        },
        compressToUTF16: function(input) {
          if (input == null) return "";
          return LZString2._compress(input, 15, function(a) {
            return f2(a + 32);
          }) + " ";
        },
        decompressFromUTF16: function(compressed) {
          if (compressed == null) return "";
          if (compressed == "") return null;
          return LZString2._decompress(compressed.length, 16384, function(index) {
            return compressed.charCodeAt(index) - 32;
          });
        },
        //compress into uint8array (UCS-2 big endian format)
        compressToUint8Array: function(uncompressed) {
          var compressed = LZString2.compress(uncompressed);
          var buf = new Uint8Array(compressed.length * 2);
          for (var i = 0, TotalLen = compressed.length; i < TotalLen; i++) {
            var current_value = compressed.charCodeAt(i);
            buf[i * 2] = current_value >>> 8;
            buf[i * 2 + 1] = current_value % 256;
          }
          return buf;
        },
        //decompress from uint8array (UCS-2 big endian format)
        decompressFromUint8Array: function(compressed) {
          if (compressed === null || compressed === void 0) {
            return LZString2.decompress(compressed);
          } else {
            var buf = new Array(compressed.length / 2);
            for (var i = 0, TotalLen = buf.length; i < TotalLen; i++) {
              buf[i] = compressed[i * 2] * 256 + compressed[i * 2 + 1];
            }
            var result = [];
            buf.forEach(function(c) {
              result.push(f2(c));
            });
            return LZString2.decompress(result.join(""));
          }
        },
        //compress into a string that is already URI encoded
        compressToEncodedURIComponent: function(input) {
          if (input == null) return "";
          return LZString2._compress(input, 6, function(a) {
            return keyStrUriSafe.charAt(a);
          });
        },
        //decompress from an output of compressToEncodedURIComponent
        decompressFromEncodedURIComponent: function(input) {
          if (input == null) return "";
          if (input == "") return null;
          input = input.replace(/ /g, "+");
          return LZString2._decompress(input.length, 32, function(index) {
            return getBaseValue(keyStrUriSafe, input.charAt(index));
          });
        },
        compress: function(uncompressed) {
          return LZString2._compress(uncompressed, 16, function(a) {
            return f2(a);
          });
        },
        _compress: function(uncompressed, bitsPerChar, getCharFromInt) {
          if (uncompressed == null) return "";
          var i, value, context_dictionary = {}, context_dictionaryToCreate = {}, context_c = "", context_wc = "", context_w = "", context_enlargeIn = 2, context_dictSize = 3, context_numBits = 2, context_data = [], context_data_val = 0, context_data_position = 0, ii;
          for (ii = 0; ii < uncompressed.length; ii += 1) {
            context_c = uncompressed.charAt(ii);
            if (!Object.prototype.hasOwnProperty.call(context_dictionary, context_c)) {
              context_dictionary[context_c] = context_dictSize++;
              context_dictionaryToCreate[context_c] = true;
            }
            context_wc = context_w + context_c;
            if (Object.prototype.hasOwnProperty.call(context_dictionary, context_wc)) {
              context_w = context_wc;
            } else {
              if (Object.prototype.hasOwnProperty.call(context_dictionaryToCreate, context_w)) {
                if (context_w.charCodeAt(0) < 256) {
                  for (i = 0; i < context_numBits; i++) {
                    context_data_val = context_data_val << 1;
                    if (context_data_position == bitsPerChar - 1) {
                      context_data_position = 0;
                      context_data.push(getCharFromInt(context_data_val));
                      context_data_val = 0;
                    } else {
                      context_data_position++;
                    }
                  }
                  value = context_w.charCodeAt(0);
                  for (i = 0; i < 8; i++) {
                    context_data_val = context_data_val << 1 | value & 1;
                    if (context_data_position == bitsPerChar - 1) {
                      context_data_position = 0;
                      context_data.push(getCharFromInt(context_data_val));
                      context_data_val = 0;
                    } else {
                      context_data_position++;
                    }
                    value = value >> 1;
                  }
                } else {
                  value = 1;
                  for (i = 0; i < context_numBits; i++) {
                    context_data_val = context_data_val << 1 | value;
                    if (context_data_position == bitsPerChar - 1) {
                      context_data_position = 0;
                      context_data.push(getCharFromInt(context_data_val));
                      context_data_val = 0;
                    } else {
                      context_data_position++;
                    }
                    value = 0;
                  }
                  value = context_w.charCodeAt(0);
                  for (i = 0; i < 16; i++) {
                    context_data_val = context_data_val << 1 | value & 1;
                    if (context_data_position == bitsPerChar - 1) {
                      context_data_position = 0;
                      context_data.push(getCharFromInt(context_data_val));
                      context_data_val = 0;
                    } else {
                      context_data_position++;
                    }
                    value = value >> 1;
                  }
                }
                context_enlargeIn--;
                if (context_enlargeIn == 0) {
                  context_enlargeIn = Math.pow(2, context_numBits);
                  context_numBits++;
                }
                delete context_dictionaryToCreate[context_w];
              } else {
                value = context_dictionary[context_w];
                for (i = 0; i < context_numBits; i++) {
                  context_data_val = context_data_val << 1 | value & 1;
                  if (context_data_position == bitsPerChar - 1) {
                    context_data_position = 0;
                    context_data.push(getCharFromInt(context_data_val));
                    context_data_val = 0;
                  } else {
                    context_data_position++;
                  }
                  value = value >> 1;
                }
              }
              context_enlargeIn--;
              if (context_enlargeIn == 0) {
                context_enlargeIn = Math.pow(2, context_numBits);
                context_numBits++;
              }
              context_dictionary[context_wc] = context_dictSize++;
              context_w = String(context_c);
            }
          }
          if (context_w !== "") {
            if (Object.prototype.hasOwnProperty.call(context_dictionaryToCreate, context_w)) {
              if (context_w.charCodeAt(0) < 256) {
                for (i = 0; i < context_numBits; i++) {
                  context_data_val = context_data_val << 1;
                  if (context_data_position == bitsPerChar - 1) {
                    context_data_position = 0;
                    context_data.push(getCharFromInt(context_data_val));
                    context_data_val = 0;
                  } else {
                    context_data_position++;
                  }
                }
                value = context_w.charCodeAt(0);
                for (i = 0; i < 8; i++) {
                  context_data_val = context_data_val << 1 | value & 1;
                  if (context_data_position == bitsPerChar - 1) {
                    context_data_position = 0;
                    context_data.push(getCharFromInt(context_data_val));
                    context_data_val = 0;
                  } else {
                    context_data_position++;
                  }
                  value = value >> 1;
                }
              } else {
                value = 1;
                for (i = 0; i < context_numBits; i++) {
                  context_data_val = context_data_val << 1 | value;
                  if (context_data_position == bitsPerChar - 1) {
                    context_data_position = 0;
                    context_data.push(getCharFromInt(context_data_val));
                    context_data_val = 0;
                  } else {
                    context_data_position++;
                  }
                  value = 0;
                }
                value = context_w.charCodeAt(0);
                for (i = 0; i < 16; i++) {
                  context_data_val = context_data_val << 1 | value & 1;
                  if (context_data_position == bitsPerChar - 1) {
                    context_data_position = 0;
                    context_data.push(getCharFromInt(context_data_val));
                    context_data_val = 0;
                  } else {
                    context_data_position++;
                  }
                  value = value >> 1;
                }
              }
              context_enlargeIn--;
              if (context_enlargeIn == 0) {
                context_enlargeIn = Math.pow(2, context_numBits);
                context_numBits++;
              }
              delete context_dictionaryToCreate[context_w];
            } else {
              value = context_dictionary[context_w];
              for (i = 0; i < context_numBits; i++) {
                context_data_val = context_data_val << 1 | value & 1;
                if (context_data_position == bitsPerChar - 1) {
                  context_data_position = 0;
                  context_data.push(getCharFromInt(context_data_val));
                  context_data_val = 0;
                } else {
                  context_data_position++;
                }
                value = value >> 1;
              }
            }
            context_enlargeIn--;
            if (context_enlargeIn == 0) {
              context_enlargeIn = Math.pow(2, context_numBits);
              context_numBits++;
            }
          }
          value = 2;
          for (i = 0; i < context_numBits; i++) {
            context_data_val = context_data_val << 1 | value & 1;
            if (context_data_position == bitsPerChar - 1) {
              context_data_position = 0;
              context_data.push(getCharFromInt(context_data_val));
              context_data_val = 0;
            } else {
              context_data_position++;
            }
            value = value >> 1;
          }
          while (true) {
            context_data_val = context_data_val << 1;
            if (context_data_position == bitsPerChar - 1) {
              context_data.push(getCharFromInt(context_data_val));
              break;
            } else context_data_position++;
          }
          return context_data.join("");
        },
        decompress: function(compressed) {
          if (compressed == null) return "";
          if (compressed == "") return null;
          return LZString2._decompress(compressed.length, 32768, function(index) {
            return compressed.charCodeAt(index);
          });
        },
        _decompress: function(length, resetValue, getNextValue) {
          var dictionary = [], next, enlargeIn = 4, dictSize = 4, numBits = 3, entry = "", result = [], i, w, bits, resb, maxpower, power, c, data = { val: getNextValue(0), position: resetValue, index: 1 };
          for (i = 0; i < 3; i += 1) {
            dictionary[i] = i;
          }
          bits = 0;
          maxpower = Math.pow(2, 2);
          power = 1;
          while (power != maxpower) {
            resb = data.val & data.position;
            data.position >>= 1;
            if (data.position == 0) {
              data.position = resetValue;
              data.val = getNextValue(data.index++);
            }
            bits |= (resb > 0 ? 1 : 0) * power;
            power <<= 1;
          }
          switch (next = bits) {
            case 0:
              bits = 0;
              maxpower = Math.pow(2, 8);
              power = 1;
              while (power != maxpower) {
                resb = data.val & data.position;
                data.position >>= 1;
                if (data.position == 0) {
                  data.position = resetValue;
                  data.val = getNextValue(data.index++);
                }
                bits |= (resb > 0 ? 1 : 0) * power;
                power <<= 1;
              }
              c = f2(bits);
              break;
            case 1:
              bits = 0;
              maxpower = Math.pow(2, 16);
              power = 1;
              while (power != maxpower) {
                resb = data.val & data.position;
                data.position >>= 1;
                if (data.position == 0) {
                  data.position = resetValue;
                  data.val = getNextValue(data.index++);
                }
                bits |= (resb > 0 ? 1 : 0) * power;
                power <<= 1;
              }
              c = f2(bits);
              break;
            case 2:
              return "";
          }
          dictionary[3] = c;
          w = c;
          result.push(c);
          while (true) {
            if (data.index > length) {
              return "";
            }
            bits = 0;
            maxpower = Math.pow(2, numBits);
            power = 1;
            while (power != maxpower) {
              resb = data.val & data.position;
              data.position >>= 1;
              if (data.position == 0) {
                data.position = resetValue;
                data.val = getNextValue(data.index++);
              }
              bits |= (resb > 0 ? 1 : 0) * power;
              power <<= 1;
            }
            switch (c = bits) {
              case 0:
                bits = 0;
                maxpower = Math.pow(2, 8);
                power = 1;
                while (power != maxpower) {
                  resb = data.val & data.position;
                  data.position >>= 1;
                  if (data.position == 0) {
                    data.position = resetValue;
                    data.val = getNextValue(data.index++);
                  }
                  bits |= (resb > 0 ? 1 : 0) * power;
                  power <<= 1;
                }
                dictionary[dictSize++] = f2(bits);
                c = dictSize - 1;
                enlargeIn--;
                break;
              case 1:
                bits = 0;
                maxpower = Math.pow(2, 16);
                power = 1;
                while (power != maxpower) {
                  resb = data.val & data.position;
                  data.position >>= 1;
                  if (data.position == 0) {
                    data.position = resetValue;
                    data.val = getNextValue(data.index++);
                  }
                  bits |= (resb > 0 ? 1 : 0) * power;
                  power <<= 1;
                }
                dictionary[dictSize++] = f2(bits);
                c = dictSize - 1;
                enlargeIn--;
                break;
              case 2:
                return result.join("");
            }
            if (enlargeIn == 0) {
              enlargeIn = Math.pow(2, numBits);
              numBits++;
            }
            if (dictionary[c]) {
              entry = dictionary[c];
            } else {
              if (c === dictSize) {
                entry = w + w.charAt(0);
              } else {
                return null;
              }
            }
            result.push(entry);
            dictionary[dictSize++] = w + entry.charAt(0);
            enlargeIn--;
            w = entry;
            if (enlargeIn == 0) {
              enlargeIn = Math.pow(2, numBits);
              numBits++;
            }
          }
        }
      };
      return LZString2;
    })();
    if (typeof define === "function" && define.amd) {
      define(function() {
        return LZString;
      });
    } else if (typeof module !== "undefined" && module != null) {
      module.exports = LZString;
    } else if (typeof angular !== "undefined" && angular != null) {
      angular.module("LZString", []).factory("LZString", function() {
        return LZString;
      });
    }
  }
});

// dist/index.mjs
var import_lz_string = __toESM(require_lz_string(), 1);
var p = class extends Error {
  constructor(e, r) {
    super(e);
    this.code = r;
    this.name = "SyncKitError";
  }
};
var l = class extends p {
  constructor(t) {
    super(t, "STORAGE_ERROR"), this.name = "StorageError";
  }
};
var b = class n {
  constructor(t, e, r, s, i) {
    this.characterId = t, this.type = e, this.opId = r, this.timestamp = s, this.clientId = i;
  }
  isStart() {
    return this.type === "start";
  }
  isEnd() {
    return this.type === "end";
  }
  getCounterpartType() {
    return this.type === "start" ? "end" : "start";
  }
  compare(t, e) {
    let r = e(this.characterId), s = e(t.characterId);
    return r !== s ? r < s ? -1 : 1 : this.type !== t.type ? this.type === "end" ? -1 : 1 : this.timestamp !== t.timestamp ? this.timestamp < t.timestamp ? -1 : 1 : this.clientId !== t.clientId ? this.clientId < t.clientId ? -1 : 1 : this.opId !== t.opId ? this.opId < t.opId ? -1 : 1 : 0;
  }
  withCharacterId(t) {
    return new n(t, this.type, this.opId, this.timestamp, this.clientId);
  }
  toJSON() {
    return { c: this.characterId, t: this.type === "start" ? 0 : 1, o: this.opId, ts: this.timestamp, cl: this.clientId };
  }
  static fromJSON(t) {
    return new n(t.c, t.t === 0 ? "start" : "end", t.o, t.ts, t.cl);
  }
  toString() {
    return `Anchor(${this.type}:${this.characterId}@${this.opId})`;
  }
  equals(t) {
    return this.characterId === t.characterId && this.type === t.type && this.opId === t.opId && this.timestamp === t.timestamp && this.clientId === t.clientId;
  }
  clone() {
    return new n(this.characterId, this.type, this.opId, this.timestamp, this.clientId);
  }
};
var it = { bold: "union", italic: "union", underline: "union", strikethrough: "union", color: "lww", background: "lww", href: "lww" };
var u = { merge(n3, t, e, r) {
  let s = {};
  for (let [i, a] of Object.entries(n3)) a != null && (s[i] = a);
  for (let [i, a] of Object.entries(t)) {
    if (a == null) continue;
    let o = it[i] || "lww";
    o === "union" ? s[i] = s[i] || a : (r > e || s[i] === void 0) && (s[i] = a);
  }
  return s;
}, equals(n3, t) {
  let e = Object.keys(n3).filter((s) => n3[s] !== void 0), r = Object.keys(t).filter((s) => t[s] !== void 0);
  if (e.length !== r.length) return false;
  for (let s of e) if (n3[s] !== t[s]) return false;
  return true;
}, isEmpty(n3) {
  return Object.keys(n3).every((t) => n3[t] === void 0 || n3[t] === null);
}, remove(n3, t) {
  let e = { ...n3 };
  for (let r of Object.keys(t)) t[r] !== void 0 && t[r] !== null && delete e[r];
  return e;
}, apply(n3, t) {
  return { ...n3, ...t };
}, toJSON(n3) {
  let t = {};
  n3.bold && (t.b = 1), n3.italic && (t.i = 1), n3.underline && (t.u = 1), n3.strikethrough && (t.s = 1), n3.color && (t.c = n3.color), n3.background && (t.bg = n3.background), n3.href && (t.h = n3.href);
  let e = Object.keys(n3).filter((r) => !["bold", "italic", "underline", "strikethrough", "color", "background", "href"].includes(r));
  if (e.length > 0) {
    t.x = {};
    for (let r of e) t.x[r] = n3[r];
  }
  return t;
}, fromJSON(n3) {
  let t = {};
  return n3.b && (t.bold = true), n3.i && (t.italic = true), n3.u && (t.underline = true), n3.s && (t.strikethrough = true), n3.c && (t.color = n3.c), n3.bg && (t.background = n3.bg), n3.h && (t.href = n3.h), n3.x && Object.assign(t, n3.x), t;
}, toString(n3) {
  let t = [];
  n3.bold && t.push("bold"), n3.italic && t.push("italic"), n3.underline && t.push("underline"), n3.strikethrough && t.push("strikethrough"), n3.color && t.push(`color:${n3.color}`), n3.background && t.push(`bg:${n3.background}`), n3.href && t.push(`link:${n3.href}`);
  let e = Object.keys(n3).filter((r) => !["bold", "italic", "underline", "strikethrough", "color", "background", "href"].includes(r));
  for (let r of e) t.push(`${r}:${n3[r]}`);
  return t.length > 0 ? `[${t.join(", ")}]` : "[none]";
}, validate(n3) {
  if (n3.color && !u.isValidHexColor(n3.color)) return `Invalid color: ${n3.color}. Expected hex format (#RRGGBB)`;
  if (n3.background && !u.isValidHexColor(n3.background)) return `Invalid background: ${n3.background}. Expected hex format (#RRGGBB)`;
  if (n3.href !== void 0 && typeof n3.href != "string") return `Invalid href: ${n3.href}. Expected string`;
}, isValidHexColor(n3) {
  return /^#[0-9A-Fa-f]{6}$/.test(n3);
}, clone(n3) {
  return { ...n3 };
} };
var S = class n2 {
  constructor(t, e, r, s = false) {
    if (t.opId !== e.opId) throw new Error(`Start and end anchors must have same opId. Got start=${t.opId}, end=${e.opId}`);
    if (!t.isStart()) throw new Error(`Start anchor must have type='start'. Got type='${t.type}'`);
    if (!e.isEnd()) throw new Error(`End anchor must have type='end'. Got type='${e.type}'`);
    this.start = t, this.end = e, this.attributes = r, this.deleted = s;
  }
  get opId() {
    return this.start.opId;
  }
  get timestamp() {
    return this.start.timestamp;
  }
  get clientId() {
    return this.start.clientId;
  }
  contains(t, e) {
    if (this.deleted) return false;
    let r = e(t), s = e(this.start.characterId), i = e(this.end.characterId);
    return r >= s && r <= i;
  }
  overlaps(t, e) {
    if (this.deleted || t.deleted) return false;
    let r = e(this.start.characterId), s = e(this.end.characterId), i = e(t.start.characterId), a = e(t.end.characterId);
    return r <= a && i <= s;
  }
  merge(t, e) {
    if (!this.overlaps(t, e)) return null;
    let r = e(this.start.characterId), s = e(this.end.characterId), i = e(t.start.characterId), a = e(t.end.characterId), o = r > i ? this.start : t.start, c = s < a ? this.end : t.end, d = u.merge(this.attributes, t.attributes, this.timestamp, t.timestamp);
    return new n2(o, c, d, false);
  }
  markDeleted() {
    return new n2(this.start, this.end, this.attributes, true);
  }
  withAttributes(t) {
    return new n2(this.start, this.end, t, this.deleted);
  }
  withAnchors(t, e) {
    return new n2(t, e, this.attributes, this.deleted);
  }
  toJSON() {
    return { s: this.start.toJSON(), e: this.end.toJSON(), a: u.toJSON(this.attributes), d: this.deleted ? 1 : void 0 };
  }
  static fromJSON(t) {
    return new n2(b.fromJSON(t.s), b.fromJSON(t.e), u.fromJSON(t.a), t.d === 1);
  }
  toString() {
    let t = this.deleted ? " [DELETED]" : "";
    return `Span(${this.start.characterId}\u2192${this.end.characterId}, ${u.toString(this.attributes)}${t})`;
  }
  equals(t) {
    return this.start.equals(t.start) && this.end.equals(t.end) && u.equals(this.attributes, t.attributes) && this.deleted === t.deleted;
  }
  clone() {
    return new n2(this.start.clone(), this.end.clone(), u.clone(this.attributes), this.deleted);
  }
  getLength(t) {
    let e = t(this.start.characterId), r = t(this.end.characterId);
    return Math.max(0, r - e + 1);
  }
  isEmpty(t) {
    return this.getLength(t) === 0;
  }
};
var I = { sort(n3, t) {
  return [...n3].sort((e, r) => {
    let s = t(e.start.characterId), i = t(r.start.characterId);
    return s - i;
  });
}, removeDeleted(n3) {
  return n3.filter((t) => !t.deleted);
}, findContaining(n3, t, e) {
  return t.filter((r) => r.contains(n3, e));
}, findOverlapping(n3, t, e, r) {
  return e.filter((s) => {
    let i = r(s.start.characterId), a = r(s.end.characterId);
    return i <= t && n3 <= a;
  });
}, getFormatsAt(n3, t, e) {
  let r = I.findContaining(n3, t, e);
  if (r.length === 0) return {};
  let s = [...r].sort((a, o) => a.timestamp - o.timestamp), i = {};
  for (let a of s) i = u.merge(i, a.attributes, 0, 1);
  return i;
} };
var _ = class {
  merge(t, e) {
    let r = I.removeDeleted(t);
    if (r.length === 0) return [];
    let s = I.sort(r, e), i = [], a = null;
    for (let o of s) {
      if (a === null) {
        a = o;
        continue;
      }
      if (a.overlaps(o, e)) {
        let c = this.mergeOverlapping(a, o, e);
        i.push(...c), a = null;
      } else i.push(a), a = o;
    }
    return a !== null && i.push(a), i;
  }
  mergeOverlapping(t, e, r) {
    let s = r(t.start.characterId), i = r(t.end.characterId), a = r(e.start.characterId), o = r(e.end.characterId), c = [], d = Math.max(s, a), h = Math.min(i, o);
    if (s < d && c.push(t), d <= h) {
      let g = u.merge(t.attributes, e.attributes, t.timestamp, e.timestamp), y = t.timestamp >= e.timestamp, V = new S(y ? t.start : e.start, y ? t.end : e.end, g, false);
      c.push(V);
    }
    return i > h ? c.push(t) : o > h && c.push(e), c;
  }
  resolveConflict(t, e) {
    let r = this.compareForConflictResolution(t, e) >= 0 ? t : e, s = r === t ? e : t, i = u.merge(r.attributes, s.attributes, r.timestamp, s.timestamp);
    return r.withAttributes(i);
  }
  compareForConflictResolution(t, e) {
    return t.timestamp !== e.timestamp ? t.timestamp - e.timestamp : t.clientId !== e.clientId ? t.clientId < e.clientId ? 1 : -1 : t.opId !== e.opId ? t.opId < e.opId ? 1 : -1 : 0;
  }
  handleInsertion(t, e, r) {
    return t;
  }
  handleDeletion(t, e, r) {
    let s = t.start, i = t.end;
    return t.start.characterId, t.end.characterId, t.withAnchors(s, i);
  }
  computeRanges(t, e, r, s) {
    if (t.length === 0) return [];
    let i = [], a = {}, o = "", d = s || ((h) => {
      let g = h.split("@"), y = parseInt(g[0] || "0");
      return isNaN(y) ? 0 : y;
    });
    for (let h = 0; h < t.length; h++) {
      let g = r(h);
      if (!g) throw new Error(`No character ID found at position ${h}`);
      let y = I.getFormatsAt(g, e, d);
      u.equals(a, y) ? o += t[h] : (o.length > 0 && i.push({ text: o, attributes: a }), a = y, o = t[h] || "");
    }
    return o.length > 0 && i.push({ text: o, attributes: a }), i;
  }
  validate(t, e) {
    for (let r of t) if (r.deleted) return `Found deleted span in active set: ${r.toString()}`;
    for (let r = 1; r < t.length; r++) {
      let s = t[r - 1], i = t[r];
      if (!s || !i) continue;
      let a = e(s.start.characterId), o = e(i.start.characterId);
      if (a > o) return `Spans not properly ordered: ${s.toString()} comes before ${i.toString()}`;
    }
    for (let r of t) {
      let s = u.validate(r.attributes);
      if (s) return `Invalid attributes in span ${r.toString()}: ${s}`;
    }
  }
};
var j = new _();
var nt = 1;
var f = "documents";
var O = class {
  constructor(t = "synckit") {
    this.dbName = t;
    this.db = null;
    this.channel = null;
    this.changeListeners = /* @__PURE__ */ new Set();
    this.channelId = `idb-${Math.random().toString(36).substring(2, 9)}`;
  }
  async init() {
    if (typeof indexedDB > "u") throw new l("IndexedDB not available in this environment");
    return new Promise((t, e) => {
      let r = indexedDB.open(this.dbName, nt);
      r.onerror = () => {
        e(new l(`Failed to open IndexedDB: ${r.error}`));
      }, r.onsuccess = () => {
        this.db = r.result, typeof BroadcastChannel < "u" && (this.channel = new BroadcastChannel(`synckit-idb-${this.dbName}`), this.channel.onmessage = (s) => {
          this.handleStorageMessage(s.data);
        }), t();
      }, r.onupgradeneeded = (s) => {
        let i = s.target.result;
        i.objectStoreNames.contains(f) || i.createObjectStore(f, { keyPath: "id" });
      };
    });
  }
  handleStorageMessage(t) {
    t.source !== this.channelId && this.changeListeners.forEach((e) => {
      try {
        e(t);
      } catch (r) {
        console.error("Error in storage change listener:", r);
      }
    });
  }
  broadcast(t, e) {
    if (!this.channel) return;
    let r = { type: t, docId: e, timestamp: Date.now(), source: this.channelId };
    try {
      this.channel.postMessage(r);
    } catch (s) {
      console.error("Failed to broadcast storage change:", s);
    }
  }
  onChange(t) {
    return this.changeListeners.add(t), () => {
      this.changeListeners.delete(t);
    };
  }
  async get(t) {
    if (!this.db) throw new l("Storage not initialized");
    return new Promise((e, r) => {
      let a = this.db.transaction(f, "readonly").objectStore(f).get(t);
      a.onerror = () => {
        r(new l(`Failed to get document: ${a.error}`));
      }, a.onsuccess = () => {
        e(a.result ?? null);
      };
    });
  }
  async set(t, e) {
    if (!this.db) throw new l("Storage not initialized");
    return new Promise((r, s) => {
      let i = this.db.transaction(f, "readwrite"), o = i.objectStore(f).put({ ...e, id: t });
      o.onerror = () => {
        s(new l(`Failed to save document: ${o.error}`));
      }, i.oncomplete = () => {
        this.broadcast("set", t), r();
      };
    });
  }
  async delete(t) {
    if (!this.db) throw new l("Storage not initialized");
    return new Promise((e, r) => {
      let s = this.db.transaction(f, "readwrite"), a = s.objectStore(f).delete(t);
      a.onerror = () => {
        r(new l(`Failed to delete document: ${a.error}`));
      }, s.oncomplete = () => {
        this.broadcast("delete", t), e();
      };
    });
  }
  async list() {
    if (!this.db) throw new l("Storage not initialized");
    return new Promise((t, e) => {
      let i = this.db.transaction(f, "readonly").objectStore(f).getAllKeys();
      i.onerror = () => {
        e(new l(`Failed to list documents: ${i.error}`));
      }, i.onsuccess = () => {
        t(i.result);
      };
    });
  }
  async clear() {
    if (!this.db) throw new l("Storage not initialized");
    return new Promise((t, e) => {
      let r = this.db.transaction(f, "readwrite"), i = r.objectStore(f).clear();
      i.onerror = () => {
        e(new l(`Failed to clear storage: ${i.error}`));
      }, r.oncomplete = () => {
        this.broadcast("clear"), t();
      };
    });
  }
  close() {
    this.channel && (this.channel.close(), this.channel = null), this.changeListeners.clear();
  }
};
var at = "synckit-docs";
var tt = ".metadata.json";
var E = class {
  constructor(t = at) {
    this.dirName = t;
    this.root = null;
    this.docsDir = null;
    this.metadata = null;
    this.channel = null;
    this.changeListeners = /* @__PURE__ */ new Set();
    this.channelId = `opfs-${Math.random().toString(36).substring(2, 9)}`;
  }
  async init() {
    if (typeof navigator > "u" || !navigator.storage?.getDirectory) throw new l("OPFS not available in this environment");
    try {
      this.root = await navigator.storage.getDirectory(), this.docsDir = await this.root.getDirectoryHandle(this.dirName, { create: true }), await this.loadMetadata(), typeof BroadcastChannel < "u" && (this.channel = new BroadcastChannel(`synckit-opfs-${this.dirName}`), this.channel.onmessage = (t) => {
        this.handleStorageMessage(t.data);
      });
    } catch (t) {
      throw new l(`Failed to initialize OPFS: ${t}`);
    }
  }
  async loadMetadata() {
    if (!this.docsDir) throw new l("Storage not initialized");
    try {
      let r = await (await (await this.docsDir.getFileHandle(tt, { create: false })).getFile()).text();
      this.metadata = JSON.parse(r);
    } catch {
      this.metadata = { version: 1, documentIds: [], lastModified: Date.now() }, await this.saveMetadata();
    }
  }
  async saveMetadata() {
    if (!this.docsDir || !this.metadata) throw new l("Storage not initialized");
    try {
      this.metadata.lastModified = Date.now();
      let e = await (await this.docsDir.getFileHandle(tt, { create: true })).createWritable();
      await e.write(JSON.stringify(this.metadata, null, 2)), await e.close();
    } catch (t) {
      throw new l(`Failed to save metadata: ${t}`);
    }
  }
  async handleStorageMessage(t) {
    if (t.source !== this.channelId) {
      try {
        await this.loadMetadata();
      } catch (e) {
        console.error("Failed to reload metadata after storage change:", e);
      }
      this.changeListeners.forEach((e) => {
        try {
          e(t);
        } catch (r) {
          console.error("Error in storage change listener:", r);
        }
      });
    }
  }
  broadcast(t, e) {
    if (!this.channel) return;
    let r = { type: t, docId: e, timestamp: Date.now(), source: this.channelId };
    try {
      this.channel.postMessage(r);
    } catch (s) {
      console.error("Failed to broadcast storage change:", s);
    }
  }
  onChange(t) {
    return this.changeListeners.add(t), () => {
      this.changeListeners.delete(t);
    };
  }
  getFileName(t) {
    return `${t.replace(/[^a-zA-Z0-9-_]/g, "_")}.json`;
  }
  async get(t) {
    if (!this.docsDir) throw new l("Storage not initialized");
    try {
      let e = this.getFileName(t), i = await (await (await this.docsDir.getFileHandle(e, { create: false })).getFile()).text();
      return JSON.parse(i);
    } catch (e) {
      if (e.name === "NotFoundError") return null;
      throw new l(`Failed to get document: ${e}`);
    }
  }
  async set(t, e) {
    if (!this.docsDir || !this.metadata) throw new l("Storage not initialized");
    try {
      let r = this.getFileName(t), i = await (await this.docsDir.getFileHandle(r, { create: true })).createWritable();
      await i.write(JSON.stringify(e, null, 2)), await i.close(), this.metadata.documentIds.includes(t) || (this.metadata.documentIds.push(t), await this.saveMetadata()), this.broadcast("set", t);
    } catch (r) {
      throw new l(`Failed to save document: ${r}`);
    }
  }
  async delete(t) {
    if (!this.docsDir || !this.metadata) throw new l("Storage not initialized");
    try {
      let e = this.getFileName(t);
      await this.docsDir.removeEntry(e), this.metadata.documentIds = this.metadata.documentIds.filter((r) => r !== t), await this.saveMetadata(), this.broadcast("delete", t);
    } catch (e) {
      if (e.name !== "NotFoundError") throw new l(`Failed to delete document: ${e}`);
    }
  }
  async list() {
    if (!this.metadata) throw new l("Storage not initialized");
    return [...this.metadata.documentIds];
  }
  async clear() {
    if (!this.docsDir || !this.metadata) throw new l("Storage not initialized");
    try {
      for (let t of this.metadata.documentIds) {
        let e = this.getFileName(t);
        try {
          await this.docsDir.removeEntry(e);
        } catch (r) {
          if (r.name !== "NotFoundError") throw r;
        }
      }
      this.metadata.documentIds = [], await this.saveMetadata(), this.broadcast("clear");
    } catch (t) {
      throw new l(`Failed to clear storage: ${t}`);
    }
  }
  async getStats() {
    if (typeof navigator > "u" || !navigator.storage?.estimate) return { used: 0, quota: 0 };
    try {
      let t = await navigator.storage.estimate();
      return { used: t.usage || 0, quota: t.quota || 0 };
    } catch (t) {
      throw new l(`Failed to get storage stats: ${t}`);
    }
  }
  close() {
    this.channel && (this.channel.close(), this.channel = null), this.changeListeners.clear();
  }
};

// benchmarks/storage-comparison.ts
function generateDocument(id, size) {
  const sizeMap = {
    small: 10,
    // 10 todos
    medium: 100,
    // 100 todos
    large: 1e3
    // 1000 todos
  };
  const count = sizeMap[size];
  const todos = Array.from({ length: count }, (_2, i) => ({
    id: `todo-${i}`,
    text: `Task ${i}: Lorem ipsum dolor sit amet`,
    completed: Math.random() > 0.5,
    createdBy: "benchmark-user",
    createdAt: Date.now()
  }));
  return {
    id,
    data: { todos },
    version: { "client-benchmark": count },
    updatedAt: Date.now()
  };
}
async function benchmarkOperation(adapter, operation, fn, iterations) {
  await fn();
  const startTime = performance.now();
  for (let i = 0; i < iterations; i++) {
    await fn();
  }
  const endTime = performance.now();
  const totalTime = endTime - startTime;
  const avgTime = totalTime / iterations;
  const opsPerSecond = iterations / totalTime * 1e3;
  return {
    adapter: adapter.constructor.name,
    operation,
    totalTime,
    avgTime,
    opsPerSecond,
    iterations
  };
}
async function runBenchmarks() {
  console.log("\u{1F3C1} Starting Storage Adapter Benchmarks\n");
  const results = [];
  const iterations = 100;
  const adapters = [
    { name: "IndexedDB", adapter: new O("benchmark-idb") },
    { name: "OPFS", adapter: new E("benchmark-opfs") }
  ];
  for (const { name, adapter } of adapters) {
    console.log(`
\u{1F4CA} Testing ${name}...`);
    try {
      await adapter.init();
      await adapter.clear();
      console.log("  \u23F1\uFE0F  Write (small docs)...");
      const writeSmallResult = await benchmarkOperation(
        adapter,
        "Write Small (10 items)",
        async () => {
          const doc = generateDocument(`doc-${Math.random()}`, "small");
          await adapter.set(doc.id, doc);
        },
        iterations
      );
      results.push(writeSmallResult);
      console.log("  \u23F1\uFE0F  Write (medium docs)...");
      const writeMediumResult = await benchmarkOperation(
        adapter,
        "Write Medium (100 items)",
        async () => {
          const doc = generateDocument(`doc-${Math.random()}`, "medium");
          await adapter.set(doc.id, doc);
        },
        iterations
      );
      results.push(writeMediumResult);
      console.log("  \u23F1\uFE0F  Write (large docs)...");
      const writeLargeResult = await benchmarkOperation(
        adapter,
        "Write Large (1000 items)",
        async () => {
          const doc = generateDocument(`doc-${Math.random()}`, "large");
          await adapter.set(doc.id, doc);
        },
        50
        // Fewer iterations for large docs
      );
      results.push(writeLargeResult);
      const readDocs = Array.from(
        { length: iterations },
        (_2, i) => generateDocument(`read-doc-${i}`, "medium")
      );
      for (const doc of readDocs) {
        await adapter.set(doc.id, doc);
      }
      console.log("  \u23F1\uFE0F  Read...");
      let readIndex = 0;
      const readResult = await benchmarkOperation(
        adapter,
        "Read",
        async () => {
          await adapter.get(readDocs[readIndex % readDocs.length].id);
          readIndex++;
        },
        iterations
      );
      results.push(readResult);
      console.log("  \u23F1\uFE0F  List...");
      const listResult = await benchmarkOperation(
        adapter,
        "List",
        async () => {
          await adapter.list();
        },
        iterations
      );
      results.push(listResult);
      console.log("  \u23F1\uFE0F  Delete...");
      const deleteDocs = Array.from(
        { length: iterations },
        (_2, i) => generateDocument(`delete-doc-${i}`, "small")
      );
      for (const doc of deleteDocs) {
        await adapter.set(doc.id, doc);
      }
      let deleteIndex = 0;
      const deleteResult = await benchmarkOperation(
        adapter,
        "Delete",
        async () => {
          await adapter.delete(deleteDocs[deleteIndex % deleteDocs.length].id);
          deleteIndex++;
        },
        iterations
      );
      results.push(deleteResult);
      await adapter.clear();
      console.log(`  \u2705 ${name} benchmarks complete`);
    } catch (error) {
      console.error(`  \u274C Error benchmarking ${name}:`, error);
    }
  }
  return results;
}
function displayResults(results) {
  console.log("\n\n\u{1F4C8} BENCHMARK RESULTS\n");
  console.log("=".repeat(80));
  const operations = [...new Set(results.map((r) => r.operation))];
  for (const operation of operations) {
    const opResults = results.filter((r) => r.operation === operation);
    console.log(`
${operation}:`);
    console.log("-".repeat(80));
    for (const result of opResults) {
      console.log(`  ${result.adapter.padEnd(15)} | ${result.avgTime.toFixed(2)}ms avg | ${result.opsPerSecond.toFixed(0)} ops/sec`);
    }
    if (opResults.length === 2) {
      const idb = opResults.find((r) => r.adapter === "IndexedDBStorage");
      const opfs = opResults.find((r) => r.adapter === "OPFSStorage");
      if (idb && opfs) {
        const speedup = idb.avgTime / opfs.avgTime;
        const faster = speedup > 1 ? "faster" : "slower";
        console.log(`
  \u2192 OPFS is ${Math.abs(speedup).toFixed(2)}x ${faster} than IndexedDB`);
      }
    }
  }
  console.log("\n" + "=".repeat(80));
}
function exportResults(results) {
  return JSON.stringify({
    timestamp: (/* @__PURE__ */ new Date()).toISOString(),
    platform: {
      userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "Node.js",
      platform: typeof navigator !== "undefined" ? navigator.platform : process.platform
    },
    results
  }, null, 2);
}
if (typeof window !== "undefined") {
  console.log("Running in browser - call runBenchmarks() from console");
  window.runStorageBenchmarks = async () => {
    const results = await runBenchmarks();
    displayResults(results);
    console.log("\n\n\u{1F4C4} JSON Export:");
    console.log(exportResults(results));
    return results;
  };
  console.log("Call runStorageBenchmarks() to start");
}
export {
  displayResults,
  exportResults,
  runBenchmarks
};
