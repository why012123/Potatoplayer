#include "json.h"

#include <charconv>
#include <cmath>
#include <cstdio>
#include <cstdlib>
#include <cstring>

namespace phq {
namespace {

const Json kNull;

void escapeTo(const std::string& s, std::string& out) {
  out.push_back('"');
  for (unsigned char c : s) {
    switch (c) {
      case '"': out += "\\\""; break;
      case '\\': out += "\\\\"; break;
      case '\b': out += "\\b"; break;
      case '\f': out += "\\f"; break;
      case '\n': out += "\\n"; break;
      case '\r': out += "\\r"; break;
      case '\t': out += "\\t"; break;
      default:
        if (c < 0x20) {
          char buf[8];
          std::snprintf(buf, sizeof(buf), "\\u%04x", c);
          out += buf;
        } else {
          out.push_back(static_cast<char>(c));  // pass UTF-8 bytes through
        }
    }
  }
  out.push_back('"');
}

void numberTo(double v, std::string& out) {
  if (!std::isfinite(v)) {
    out += "null";
    return;
  }
  char buf[40];
  auto res = std::to_chars(buf, buf + sizeof(buf), v);
  if (res.ec == std::errc()) {
    out.append(buf, res.ptr);
  } else {
    std::snprintf(buf, sizeof(buf), "%.17g", v);
    out += buf;
  }
  // Keep integers recognizable for human readers.
  if (out.size() && out.back() == '.') out.pop_back();
}

struct Parser {
  const char* p = nullptr;
  const char* end = nullptr;
  std::string error;
  int depth = 0;

  void skipWs() {
    while (p < end && (*p == ' ' || *p == '\t' || *p == '\n' || *p == '\r')) ++p;
  }

  bool fail(const char* msg) {
    if (error.empty()) error = msg;
    return false;
  }

  bool parseValue(Json& out) {
    if (++depth > 64) return fail("nesting too deep");
    skipWs();
    if (p >= end) return fail("unexpected end");
    bool ok = false;
    switch (*p) {
      case '{': ok = parseObject(out); break;
      case '[': ok = parseArray(out); break;
      case '"': {
        std::string s;
        ok = parseString(s);
        if (ok) out = Json(std::move(s));
        break;
      }
      case 't':
        ok = literal("true");
        if (ok) out = Json(true);
        break;
      case 'f':
        ok = literal("false");
        if (ok) out = Json(false);
        break;
      case 'n':
        ok = literal("null");
        if (ok) out = Json();
        break;
      default:
        ok = parseNumber(out);
    }
    --depth;
    return ok;
  }

  bool literal(const char* lit) {
    const size_t n = std::strlen(lit);
    if (static_cast<size_t>(end - p) < n || std::memcmp(p, lit, n) != 0) return fail("bad literal");
    p += n;
    return true;
  }

  bool parseNumber(Json& out) {
    const char* start = p;
    if (p < end && (*p == '-' || *p == '+')) ++p;
    bool any = false;
    while (p < end && *p >= '0' && *p <= '9') { ++p; any = true; }
    if (p < end && *p == '.') {
      ++p;
      while (p < end && *p >= '0' && *p <= '9') { ++p; any = true; }
    }
    if (any && p < end && (*p == 'e' || *p == 'E')) {
      ++p;
      if (p < end && (*p == '+' || *p == '-')) ++p;
      while (p < end && *p >= '0' && *p <= '9') ++p;
    }
    if (!any) return fail("bad number");
    std::string tmp(start, p);
    out = Json(std::strtod(tmp.c_str(), nullptr));
    return true;
  }

  bool hex4(unsigned& v) {
    if (end - p < 4) return fail("bad \\u escape");
    v = 0;
    for (int i = 0; i < 4; ++i) {
      char c = p[i];
      v <<= 4;
      if (c >= '0' && c <= '9') v |= static_cast<unsigned>(c - '0');
      else if (c >= 'a' && c <= 'f') v |= static_cast<unsigned>(c - 'a' + 10);
      else if (c >= 'A' && c <= 'F') v |= static_cast<unsigned>(c - 'A' + 10);
      else return fail("bad hex digit");
    }
    p += 4;
    return true;
  }

  void appendUtf8(unsigned cp, std::string& out) {
    if (cp < 0x80) {
      out.push_back(static_cast<char>(cp));
    } else if (cp < 0x800) {
      out.push_back(static_cast<char>(0xC0 | (cp >> 6)));
      out.push_back(static_cast<char>(0x80 | (cp & 0x3F)));
    } else if (cp < 0x10000) {
      out.push_back(static_cast<char>(0xE0 | (cp >> 12)));
      out.push_back(static_cast<char>(0x80 | ((cp >> 6) & 0x3F)));
      out.push_back(static_cast<char>(0x80 | (cp & 0x3F)));
    } else {
      out.push_back(static_cast<char>(0xF0 | (cp >> 18)));
      out.push_back(static_cast<char>(0x80 | ((cp >> 12) & 0x3F)));
      out.push_back(static_cast<char>(0x80 | ((cp >> 6) & 0x3F)));
      out.push_back(static_cast<char>(0x80 | (cp & 0x3F)));
    }
  }

  bool parseString(std::string& out) {
    if (p >= end || *p != '"') return fail("expected string");
    ++p;
    out.clear();
    while (p < end) {
      char c = *p++;
      if (c == '"') return true;
      if (c != '\\') {
        out.push_back(c);
        continue;
      }
      if (p >= end) return fail("bad escape");
      char e = *p++;
      switch (e) {
        case '"': out.push_back('"'); break;
        case '\\': out.push_back('\\'); break;
        case '/': out.push_back('/'); break;
        case 'b': out.push_back('\b'); break;
        case 'f': out.push_back('\f'); break;
        case 'n': out.push_back('\n'); break;
        case 'r': out.push_back('\r'); break;
        case 't': out.push_back('\t'); break;
        case 'u': {
          unsigned cp = 0;
          if (!hex4(cp)) return false;
          if (cp >= 0xD800 && cp <= 0xDBFF) {  // surrogate pair
            if (end - p < 6 || p[0] != '\\' || p[1] != 'u') return fail("lone surrogate");
            p += 2;
            unsigned lo = 0;
            if (!hex4(lo)) return false;
            cp = 0x10000 + ((cp - 0xD800) << 10) + (lo - 0xDC00);
          }
          appendUtf8(cp, out);
          break;
        }
        default: return fail("unknown escape");
      }
    }
    return fail("unterminated string");
  }

  bool parseArray(Json& out) {
    ++p;  // [
    out = Json::array();
    skipWs();
    if (p < end && *p == ']') { ++p; return true; }
    while (true) {
      Json v;
      if (!parseValue(v)) return false;
      out.push(std::move(v));
      skipWs();
      if (p >= end) return fail("unterminated array");
      if (*p == ',') { ++p; continue; }
      if (*p == ']') { ++p; return true; }
      return fail("expected , or ]");
    }
  }

  bool parseObject(Json& out) {
    ++p;  // {
    out = Json::object();
    skipWs();
    if (p < end && *p == '}') { ++p; return true; }
    while (true) {
      skipWs();
      std::string key;
      if (!parseString(key)) return false;
      skipWs();
      if (p >= end || *p != ':') return fail("expected :");
      ++p;
      Json v;
      if (!parseValue(v)) return false;
      out.set(key, std::move(v));
      skipWs();
      if (p >= end) return fail("unterminated object");
      if (*p == ',') { ++p; continue; }
      if (*p == '}') { ++p; return true; }
      return fail("expected , or }");
    }
  }
};

}  // namespace

const Json& Json::operator[](size_t i) const {
  if (type_ != Type::Array || i >= arr_.size()) return kNull;
  return arr_[i];
}

Json& Json::operator[](size_t i) {
  if (type_ != Type::Array) { type_ = Type::Array; }
  if (i >= arr_.size()) arr_.resize(i + 1);
  return arr_[i];
}

bool Json::has(const std::string& k) const {
  if (type_ != Type::Object) return false;
  for (const auto& kv : obj_) if (kv.first == k) return true;
  return false;
}

const Json& Json::operator[](const std::string& k) const {
  if (type_ == Type::Object) {
    for (const auto& kv : obj_) if (kv.first == k) return kv.second;
  }
  return kNull;
}

Json& Json::operator[](const std::string& k) {
  if (type_ != Type::Object) type_ = Type::Object;
  for (auto& kv : obj_) if (kv.first == k) return kv.second;
  obj_.emplace_back(k, Json());
  return obj_.back().second;
}

void Json::set(const std::string& k, Json v) { (*this)[k] = std::move(v); }

void Json::dumpTo(std::string& out) const {
  switch (type_) {
    case Type::Null: out += "null"; break;
    case Type::Bool: out += bool_ ? "true" : "false"; break;
    case Type::Number: numberTo(num_, out); break;
    case Type::String: escapeTo(str_, out); break;
    case Type::Array: {
      out.push_back('[');
      bool first = true;
      for (const auto& v : arr_) {
        if (!first) out.push_back(',');
        first = false;
        v.dumpTo(out);
      }
      out.push_back(']');
      break;
    }
    case Type::Object: {
      out.push_back('{');
      bool first = true;
      for (const auto& kv : obj_) {
        if (!first) out.push_back(',');
        first = false;
        escapeTo(kv.first, out);
        out.push_back(':');
        kv.second.dumpTo(out);
      }
      out.push_back('}');
      break;
    }
  }
}

std::string Json::dump() const {
  std::string out;
  out.reserve(128);
  dumpTo(out);
  return out;
}

Json Json::parse(const std::string& text, std::string* error) {
  Parser parser;
  parser.p = text.data();
  parser.end = text.data() + text.size();
  Json out;
  if (!parser.parseValue(out)) {
    if (error) *error = parser.error.empty() ? "parse error" : parser.error;
    return Json();
  }
  if (error) error->clear();
  return out;
}

}  // namespace phq
