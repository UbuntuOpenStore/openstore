import express, { type Request, type Response } from 'express';
import { z } from 'zod/v4';
import { Discover } from '../../db/discover';
import { success, error, asyncErrorWrapper } from '../../utils';
import { authenticate, adminOnly } from '../../middleware/auth';

const highlightSchema = z.object({
  id: z.string().min(1, 'Highlight id cannot be empty'),
  description: z.string().min(1, 'Highlight description cannot be empty'),
});

const categorySchema = z.object({
  name: z.string().min(1, 'Category name cannot be empty'),
  tagline: z.string().min(1, 'Category tagline cannot be empty'),
  referral: z.string().default(''),
  ids: z.array(z.string().min(1, 'Category ids cannot be empty')).min(1, 'Category must have at least one id'),
});

const discoverDataSchema = z.object({
  highlights: z.array(highlightSchema).min(1, 'Must have at least one highlight'),
  categories: z.array(categorySchema).min(1, 'Must have at least one category'),
});

const router = express.Router();

router.get('/', authenticate, adminOnly, asyncErrorWrapper(async (req: Request, res: Response) => {
  const discoverData = await Discover.getDiscoverData();

  if (!discoverData) {
    error(res, 'No discover data found', 404);
    return;
  }

  success(res, {
    highlights: discoverData.highlights,
    categories: discoverData.categories,
  });
}, 'Unable to fetch discover data at this time'));

router.put('/', authenticate, adminOnly, asyncErrorWrapper(async (req: Request, res: Response) => {
  const validation = discoverDataSchema.safeParse(req.body);

  if (!validation.success) {
    const errorMessages = validation.error.issues.map((issue) => {
      const path = issue.path.join('.');
      return path ? `${path}: ${issue.message}` : issue.message;
    }).join(', ');

    error(res, errorMessages, 400);
    return;
  }

  const { highlights, categories } = validation.data;

  const updatedData = await Discover.updateDiscoverData(highlights, categories);

  success(res, {
    message: 'Discover data updated successfully',
    highlights: updatedData.highlights,
    categories: updatedData.categories,
  });
}, 'Unable to update discover data at this time'));

export default router;
