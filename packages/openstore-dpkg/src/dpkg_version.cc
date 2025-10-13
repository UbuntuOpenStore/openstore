#include <napi.h>
#include <string>
#include <memory>
#include <stdexcept>

extern "C" {
  #include <compat.h>
  #include <dpkg/version.h>
  #include <dpkg/dpkg-db.h>
}

static int compare_version_strings(const char *a, const char *b)
{
  struct dpkg_version va, vb;
  struct dpkg_error err;
  int rc;

  dpkg_version_blank(&va);
  dpkg_version_blank(&vb);

  if (a && *a) {
    if (parseversion(&va, a, &err) < 0) {
      std::string error_msg = "Invalid version format: ";
      error_msg += a;
      if (err.str) {
        error_msg += " - ";
        error_msg += err.str;
        free(err.str);
      }

      throw std::runtime_error(error_msg);
    }
  }

  if (b && *b) {
    if (parseversion(&vb, b, &err) < 0) {
      std::string error_msg = "Invalid version format: ";
      error_msg += b;
      if (err.str) {
        error_msg += " - ";
        error_msg += err.str;
        free(err.str);
      }

      throw std::runtime_error(error_msg);
    }
  }

  rc = dpkg_version_compare(&va, &vb);
  return rc;
}

Napi::Value CompareVersions(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  if (info.Length() < 2) {
    Napi::TypeError::New(env, "Two arguments expected").ThrowAsJavaScriptException();
    return env.Null();
  }

  if (!info[0].IsString() || !info[1].IsString()) {
    Napi::TypeError::New(env, "Arguments must be strings").ThrowAsJavaScriptException();
    return env.Null();
  }

  std::string v1 = info[0].As<Napi::String>().Utf8Value();
  std::string v2 = info[1].As<Napi::String>().Utf8Value();

  int result;
  try {
    result = compare_version_strings(v1.c_str(), v2.c_str());
  } catch (const std::runtime_error& e) {
    // Forward any parsing errors to JavaScript
    Napi::Error::New(env, e.what()).ThrowAsJavaScriptException();
    return env.Null();
  }

  return Napi::Number::New(env, result);
}

Napi::Object Init(Napi::Env env, Napi::Object exports) {
  exports.Set(
    Napi::String::New(env, "compareVersions"),
    Napi::Function::New(env, CompareVersions)
  );
  return exports;
}

NODE_API_MODULE(dpkg_version, Init)
