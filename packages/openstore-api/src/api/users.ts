import express, { type Request, type Response } from 'express';
import multer from 'multer';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

import { User } from '../db/user';
import { success, asyncErrorWrapper, config } from '../utils';
import { authenticate, adminOnly } from '../middleware';
import { AuthenticationError, NotFoundError, ValidationError } from '../exceptions';
import { type ProfileUpdateData } from '../db/user/types';
import { USER_NOT_FOUND } from '../utils/error-messages';

const avatarStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, config.avatar_dir);
  },
  filename: (req, file, cb) => {
    const uniqueName = uuidv4();
    const ext = path.extname(file.originalname);
    cb(null, `${uniqueName}${ext}`);
  },
});

const upload = multer({
  storage: avatarStorage,
  limits: {
    fileSize: 2 * 1024 * 1024, // 2MB max file size
  },
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) {
      cb(new ValidationError('Only image files are allowed for avatars'));
      return;
    }

    cb(null, true);
  },
});

const router = express.Router();

router.get('/', authenticate, asyncErrorWrapper(async (req: Request, res: Response) => {
  const users = await User.find({});
  success(res, users.map((user) => user.serialize(req.user?.role === 'admin', false)));
}, 'Could not fetch user list at this time'));

router.get('/me', authenticate, asyncErrorWrapper(async (req: Request, res: Response) => {
  if (req.user) {
    success(res, req.user.serialize(true, true));
  }
  else {
    throw new AuthenticationError();
  }
}, 'Could not fetch user at this time'));

router.put('/me', authenticate, upload.single('avatar'), asyncErrorWrapper(async (req: Request, res: Response) => {
  if (!req.user) {
    throw new AuthenticationError();
  }

  const updateData: ProfileUpdateData = {
    website_url: req.body.website_url,
    github_profile_url: req.body.github_profile_url,
    gitlab_profile_url: req.body.gitlab_profile_url,
    ubports_forum_username: req.body.ubports_forum_username,
    donation_url: req.body.donation_url,
    description: req.body.description,
  };

  if (req.file) {
    updateData.avatar = path.basename(req.file.path);
  }

  const isAdmin = req.user.role === 'admin';
  await req.user.updateProfile(updateData, isAdmin);
  success(res, req.user.serialize(true, true));
}, 'Could not update user profile at this time'));

router.get('/:id', asyncErrorWrapper(async (req: Request, res: Response) => {
  const user = await User.findById(req.params.id);
  if (!user) {
    throw new NotFoundError(USER_NOT_FOUND);
  }

  success(res, user.serialize(false, false));
}, 'Could not fetch user at this time'));

router.put('/:id', authenticate, adminOnly, asyncErrorWrapper(async (req: Request, res: Response) => {
  const user = await User.findById(req.params.id);
  if (!user) {
    throw new NotFoundError(USER_NOT_FOUND);
  }

  const isAdmin = req.user?.role === 'admin';

  const updateData: ProfileUpdateData = {
    website_url: req.body.website_url,
    github_profile_url: req.body.github_profile_url,
    gitlab_profile_url: req.body.gitlab_profile_url,
    ubports_forum_username: req.body.ubports_forum_username,
    donation_url: req.body.donation_url,
    description: req.body.description,
    role: req.body.role,
  };

  await user.updateProfile(updateData, isAdmin);
  success(res, user.serialize(isAdmin, false));
}, 'Could not update user at this time'));

export default router;
