# OpenStore-DPKG

A minimal wrapper around the `dpkg --compare-versions` C api to get it into Node.

This includes a minimal amount of the dpkg source code from https://git.dpkg.org/cgit/dpkg/dpkg.git/
with some parts stripped out for size. The full code is not included as a submodule
due to the large size of the git tree.

The dpkg source code is released under the GPLv2. The wrapper code in this package
is licensed under GPL-3.0.
