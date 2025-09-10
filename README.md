# OpenStore

The [OpenStore](https://open-store.io/) is the official app store for the [Ubuntu Touch](https://www.ubuntu-touch.io/)
OS. This repository houses the api and web frontend for the store.

## Reporting Bugs

Please report any bugs/features/requests in our [bug tracker](https://gitlab.com/theopenstore/openstore/issues).

## Translations

If you would like to help out with translations head over to the OpenStore
project on the [Weblate](https://hosted.weblate.org/projects/open-store-io/).

## Donations

We rely on donations from generous individuals like you to continue our mission
of supporting the Ubuntu Touch community. Your contribution can help us improve
the quality of the OpenStore website & app, add new features, and make them more
accessible to users around the world. We appreciate any donation, big or small,
and thank you for your support in helping us to build a better future for mobile
technology! Donate on [Liberapay](https://liberapay.com/OpenStore/).

## Development

- Make sure Docker, Docker Compose, and Node.js are all installed
  - We recommend using [Volta](https://volta.sh/) to manage Node.js versions
- Add `127.0.0.1   local.open-store.io` to your `/etc/hosts` file
- Start the database and proxy: `docker compose up -d`
- Start the api: `npm run dev -w openstore-api`
- Start the frontend: `npm run dev -w openstore-web-next`

## Configuration

By default there are no credentials stored for the GitHub login or GitLab login.
In order to use either GitHub or GitLab login you need copy the `packages/openstore-api/.env.example`
file to `packages/openstore-api/.env` and add your credentials there.

- [Create a GitHub OAuth App](https://developer.github.com/apps/building-integrations/setting-up-and-registering-oauth-apps/)

## License

Copyright (C) 2025 [Brian Douglass](http://bhdouglass.com/)

This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License version 3, as published
by the Free Software Foundation.

This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranties of MERCHANTABILITY, SATISFACTORY QUALITY, or FITNESS FOR A PARTICULAR PURPOSE.  See the GNU General Public License for more details.

You should have received a copy of the GNU General Public License along with this program.  If not, see <http://www.gnu.org/licenses/>.
