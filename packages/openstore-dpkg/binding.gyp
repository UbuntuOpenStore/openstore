{
  "targets": [
    {
      "target_name": "dpkg_version",
      "cflags!": ["-fno-exceptions"],
      "cflags_cc!": ["-fno-exceptions"],
      "sources": [
        "src/dpkg_version.cc",
        "dpkg/lib/dpkg/version.c",
        "dpkg/lib/dpkg/parsehelp.c",
        "dpkg/lib/dpkg/c-ctype.c",
        "dpkg/lib/dpkg/nfmalloc.c",
        "dpkg/lib/dpkg/mustlib.c",
        "dpkg/lib/dpkg/ehandle.c",
        "dpkg/lib/dpkg/error.c",
        "dpkg/lib/dpkg/varbuf.c"
      ],
      "include_dirs": [
        "<!@(node -p \"require('node-addon-api').include\")",
        "dpkg/lib",
        "dpkg/lib/compat",
        "."
      ],
      "dependencies": [
        "<!(node -p \"require('node-addon-api').gyp\")"
      ],
      "defines": [
        "NAPI_DISABLE_CPP_EXCEPTIONS",
        "HAVE_CONFIG_H",
        "LIBDPKG_VOLATILE_API",
        "HAVE_FGETGRENT",
        "HAVE_STRCHRNUL",
        "HAVE_STRERROR",
        "HAVE_STRSIGNAL"
      ]
    }
  ]
}
