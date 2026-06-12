import express, { type NextFunction, type Request, type Response } from 'express';
import passport from 'passport';
// @ts-ignore
import { Strategy as GitHubStrategy } from 'passport-github2';
// @ts-ignore
import { Strategy as GitLabStrategy } from 'passport-gitlab2';
// @ts-ignore
import { Strategy as LocalAPIKeyStrategy } from 'passport-localapikey';
// @ts-ignore
import { Strategy as UbuntuStrategy } from 'passport-ubuntu';

import { type HydratedUser, User } from '../db/user';
import { logger, config, asyncErrorWrapper } from '../utils';
import { githubProfileSchema, gitlabProfileSchema, ubuntuProfileSchema } from '../utils/auth.schema';

// Passport doesn't seem to have nice types for the `done` callback
export interface GenericCallback {
  // eslint-disable-next-line no-unused-vars, @typescript-eslint/prefer-function-type
  (err: any, arg1?: any, arg2?: any): void;
}

function replaceName(name?: string, email?: string): string {
  if (email?.endsWith('@ubports.com')) {
    return name ?? '';
  }

  return (name ?? '')
    .replace(/ubports/gi, 'user')
    .replace(/open store/gi, 'user')
    .replace(/openstore/gi, 'user')
    .replace(/open-store/gi, 'user')
    .replace(/ubuntu touch/gi, 'user')
    .replace(/ubuntu/gi, 'user');
}

const router = express.Router();

function safeParseUrl(url: string) {
  try {
    return new URL(url, config.server.host);
  } catch {}
}

function saveReturnTo(req: Request, res: Response, next: NextFunction) {
  if (typeof req.query.next === 'string' && req.session) {
    const url = safeParseUrl(req.query.next);
    if (url?.hostname.endsWith(config.server.domain)) {
      req.session.returnTo = req.query.next;
    }
  }

  next();
}

function authenticated(req: Request, res: Response) {
  if (!req.user) {
    res.redirect('/login');
    return;
  }

  if (req.headers['user-agent']?.startsWith('OpenStore App')) {
    res.redirect(`/logged-in?apiKey=${req.user.apikey}`);
    return;
  }

  if (typeof req.session?.returnTo === 'string') {
    const returnTo = req.session.returnTo;
    delete req.session.returnTo;

    res.redirect(`${returnTo}?key=${req.user.apikey}`);
  } else {
    res.redirect('/manage');
  }
}

passport.serializeUser((user: HydratedUser, done: GenericCallback) => {
  // This is kinda hacky, but not all ubuntu logins will have an email
  done(null, user.email ? user.email : `UBUNTU_${user.ubuntu_id ?? ''}`);
});

passport.deserializeUser((identifier: string, done: GenericCallback) => {
  if (identifier.substring(0, 7) === 'UBUNTU_') {
    User.findOne({ ubuntu_id: identifier })
      .then((user) => {
        done(undefined, user);
      })
      .catch((err) => {
        done(err);
      });
  } else {
    User.findOne({ email: identifier })
      .then((user) => {
        done(undefined, user);
      })
      .catch((err) => {
        done(err);
      });
  }
});

passport.use(
  new LocalAPIKeyStrategy((apikey: string, done: GenericCallback) => {
    User.findOne({ apikey })
      .then((user) => {
        if (!user) {
          done(null, false);
        } else {
          done(null, user);
        }
      })
      .catch((err) => {
        done(err);
      });
  }),
);

passport.use(
  new UbuntuStrategy(
    {
      returnURL: `${config.server.host}/auth/ubuntu/return`,
      realm: config.server.host,
      stateless: true,
    },
    (identifier: string, profile: unknown, callback: GenericCallback) => {
      const result = ubuntuProfileSchema.safeParse(profile);
      if (!result.success) {
        callback(result.error);
        return;
      }

      const parsedProfile = result.data;

      User.findOne({ ubuntu_id: identifier })
        .then((user) => {
          if (!user && parsedProfile.email) {
            return User.findOne({ email: Array.isArray(parsedProfile.email) ? parsedProfile.email[0] : parsedProfile.email }).then(
              (emailUser) => emailUser,
            );
          }

          return user;
        })
        .then((existing: HydratedUser | null) => {
          let user = existing;
          if (!user) {
            user = new User();
            user.apikey = crypto.randomUUID();
            user.username = `${Math.random()}`;
            user.language = 'en';
          }

          function uboneParameter(value: string | string[] | undefined | null) {
            if (Array.isArray(value)) {
              return value.length >= 1 ? value[0] : null;
            }
            return value ?? null;
          }

          user.ubuntu_id = identifier;
          user.email = uboneParameter(parsedProfile.email) || user.email;
          user.name = replaceName(uboneParameter(parsedProfile.fullname) || user.name, user.email);
          user.username = replaceName(uboneParameter(parsedProfile.nickname) || user.username, user.email);
          user.language = uboneParameter(parsedProfile.language) || user.language;

          return user.save();
        })
        .then((user) => {
          callback(undefined, user);
        })
        .catch((err) => {
          callback(err);
        });
    },
  ),
);

router.post('/ubuntu', saveReturnTo, asyncErrorWrapper(passport.authenticate('ubuntu')));
router.get('/ubuntu/return', asyncErrorWrapper(passport.authenticate('ubuntu')), authenticated);
router.post('/ubuntu/return', asyncErrorWrapper(passport.authenticate('ubuntu')), authenticated);

if (config.github.clientID && config.github.clientSecret) {
  passport.use(
    new GitHubStrategy(
      {
        clientID: config.github.clientID,
        clientSecret: config.github.clientSecret,
        callbackURL: `${config.server.host}/auth/github/callback`,
        scope: ['user:email'],
      },
      (accessToken: string, refreshToken: string, profile: unknown, callback: GenericCallback) => {
        const result = githubProfileSchema.safeParse(profile);
        if (!result.success) {
          callback(result.error);
          return;
        }

        const parsedProfile = result.data;

        User.findOne({ github_id: parsedProfile.id })
          .then((user) => {
            const emails = (parsedProfile.emails ?? []).filter((email) => email.verified).map((email) => email.value);

            if (!user && emails.length > 0) {
              return User.findOne({ email: { $in: emails } }).then((emailUser) => emailUser);
            }

            return user;
          })
          .then((existing) => {
            let user = existing;
            if (!user) {
              user = new User();
              user.apikey = crypto.randomUUID();
              user.language = 'en';
            }

            user.github_id = parsedProfile.id;
            user.email =
              !user.email && parsedProfile.emails && parsedProfile.emails.length >= 1 ? parsedProfile.emails[0].value : user.email;
            user.name = replaceName(user.name ? user.name : (parsedProfile.displayName ?? undefined), user.email);
            user.username = replaceName(user.username ? user.username : (parsedProfile.username ?? undefined), user.email);

            return user.save();
          })
          .then((user) => {
            callback(undefined, user);
          })
          .catch((err) => {
            callback(err);
          });
      },
    ),
  );

  router.get('/github', saveReturnTo, asyncErrorWrapper(passport.authenticate('github')));
  router.get('/github/callback', asyncErrorWrapper(passport.authenticate('github')), authenticated);
} else {
  logger.error('GitHub login is not available, set a client id & secret');
}

if (config.gitlab.clientID && config.gitlab.clientSecret) {
  passport.use(
    new GitLabStrategy(
      {
        clientID: config.gitlab.clientID,
        clientSecret: config.gitlab.clientSecret,
        callbackURL: `${config.server.host}/auth/gitlab/callback`,
      },
      (accessToken: string, refreshToken: string, profile: unknown, callback: GenericCallback) => {
        const result = gitlabProfileSchema.safeParse(profile);
        if (!result.success) {
          callback(result.error);
          return;
        }

        const parsedProfile = result.data;

        User.findOne({ gitlab_id: parsedProfile.id })
          .then((user) => {
            const emails = (parsedProfile.emails ?? []).map((email) => email.value);

            if (!user && emails.length > 0) {
              return User.findOne({ email: { $in: emails } }).then((emailUser) => emailUser);
            }

            return user;
          })
          .then((existing) => {
            let user = existing;
            if (!user) {
              user = new User();
              user.apikey = crypto.randomUUID();
              user.language = 'en';
            }

            user.gitlab_id = parsedProfile.id;
            user.email =
              !user.email && parsedProfile.emails && parsedProfile.emails.length > 0 ? parsedProfile.emails[0].value : user.email;
            user.name = replaceName(user.name ? user.name : (parsedProfile.displayName ?? undefined), user.email);
            user.username = replaceName(user.username ? user.username : (parsedProfile.username ?? undefined), user.email);

            return user.save();
          })
          .then((user) => {
            callback(undefined, user);
          })
          .catch((err) => {
            callback(err);
          });
      },
    ),
  );

  router.get('/gitlab', saveReturnTo, asyncErrorWrapper(passport.authenticate('gitlab')));
  router.get('/gitlab/callback', asyncErrorWrapper(passport.authenticate('gitlab')), authenticated);
} else {
  logger.error('GitLab login is not available, set a client id & secret');
}

router.get(
  '/me',
  asyncErrorWrapper((req: Request, res: Response) => {
    if (req.user) {
      res.send({
        success: true,
        data: {
          _id: req.user._id,
          name: req.user.name,
          language: req.user.language,
          username: req.user.username,
          apikey: req.user.apikey,
          role: req.user.role,
        },
        message: null,
      });
    } else {
      res.status(401);
      res.send({
        success: false,
        data: null,
        message: 'User not logged in',
      });
    }
  }),
);

router.get(
  '/logout',
  asyncErrorWrapper((req: Request, res: Response) => {
    req.logout();
    res.redirect('/');
  }),
);

export default router;
