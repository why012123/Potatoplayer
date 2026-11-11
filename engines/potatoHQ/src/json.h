// potatoHQ — minimal JSON value / parser / writer.
// Zero dependencies; used by the JSON-RPC surface only (never on the audio thread).
#pragma once

#include <cstdint>
#include <map>
#include <memory>
#include <string>
#include <vector>

namespace phq {

class Json {
 public:
  enum class Type { Null, Bool, Number, String, Array, Object };

  Json() = default;
  Json(std::nullptr_t) {}
  Json(bool v) : type_(Type::Bool), bool_(v) {}
  Json(double v) : type_(Type::Number), num_(v) {}
  Json(int v) : type_(Type::Number), num_(v) {}
  Json(int64_t v) : type_(Type::Number), num_(static_cast<double>(v)) {}
  Json(const char* v) : type_(Type::String), str_(v) {}
  Json(std::string v) : type_(Type::String), str_(std::move(v)) {}

  static Json array() { Json j; j.type_ = Type::Array; return j; }
  static Json object() { Json j; j.type_ = Type::Object; return j; }

  Type type() const { return type_; }
  bool isNull() const { return type_ == Type::Null; }
  bool isObject() const { return type_ == Type::Object; }
  bool isArray() const { return type_ == Type::Array; }
  bool isString() const { return type_ == Type::String; }
  bool isNumber() const { return type_ == Type::Number; }
  bool isBool() const { return type_ == Type::Bool; }

  bool asBool(bool def = false) const { return type_ == Type::Bool ? bool_ : def; }
  double asNumber(double def = 0.0) const { return type_ == Type::Number ? num_ : def; }
  int64_t asInt(int64_t def = 0) const { return type_ == Type::Number ? static_cast<int64_t>(num_) : def; }
  const std::string& asString() const { return str_; }
  std::string asString(const std::string& def) const { return type_ == Type::String ? str_ : def; }

  // Array access
  size_t size() const {
    if (type_ == Type::Array) return arr_.size();
    if (type_ == Type::Object) return obj_.size();
    return 0;
  }
  const Json& operator[](size_t i) const;
  Json& operator[](size_t i);
  void push(Json v) { type_ = Type::Array; arr_.push_back(std::move(v)); }

  // Object access
  bool has(const std::string& k) const;
  const Json& operator[](const std::string& k) const;
  Json& operator[](const std::string& k);
  void set(const std::string& k, Json v);
  const std::vector<std::pair<std::string, Json>>& members() const { return obj_; }
  const std::vector<Json>& items() const { return arr_; }

  std::string dump() const;
  static Json parse(const std::string& text, std::string* error = nullptr);
  static Json parseOrNull(const std::string& text) {
    std::string err;
    Json j = parse(text, &err);
    return err.empty() ? j : Json();
  }

 private:
  void dumpTo(std::string& out) const;

  Type type_ = Type::Null;
  bool bool_ = false;
  double num_ = 0.0;
  std::string str_;
  std::vector<Json> arr_;
  std::vector<std::pair<std::string, Json>> obj_;
};

}  // namespace phq
