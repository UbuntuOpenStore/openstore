// SPDX-License-Identifier: AGPL-3.0-or-later
import { useState } from 'preact/hooks';
import { type JSX } from 'preact';
import { getClientApiKey } from '../../lib/utils';
import SvgSpinner from '../icons/Spinner';
import SvgCheck from '../icons/Check';
import SvgClose from '../icons/Close';
import { type AdminDiscoverData, type AdminHighlightData, type AdminCategoryData } from '../../lib/schema';

type DiscoverFormProps = {
  discoverData: AdminDiscoverData;
  onSuccess: (data: AdminDiscoverData) => void;
};

const DiscoverForm = ({ discoverData, onSuccess }: DiscoverFormProps): JSX.Element => {
  const [highlights, setHighlights] = useState<AdminHighlightData[]>(
    JSON.parse(JSON.stringify(discoverData.highlights))
  );
  const [categories, setCategories] = useState<AdminCategoryData[]>(
    JSON.parse(JSON.stringify(discoverData.categories))
  );
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: Event) => {
    e.preventDefault();
    setSubmitting(true);
    setSuccess(false);
    setError('');

    try {
      const response = await fetch(
        `${import.meta.env.PUBLIC_API_URL}api/v4/admin/discover?apikey=${getClientApiKey()}`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'X-Source': 'openstore-web-next'
          },
          body: JSON.stringify({ highlights, categories })
        }
      );

      const data = await response.json();

      if (response.ok && data.success) {
        setSuccess(true);
        onSuccess({
          highlights: data.data.highlights,
          categories: data.data.categories
        });
      } else {
        setError(data.message || 'Failed to update discover data');
      }
    } catch (err) {
      console.error(err);
      setError('Error updating discover data');
    } finally {
      setSubmitting(false);
    }
  };

  const handleHighlightChange = (index: number, field: keyof AdminHighlightData, value: string) => {
    const newHighlights = [...highlights];
    newHighlights[index] = { ...newHighlights[index], [field]: value };
    setHighlights(newHighlights);
  };

  const handleAddHighlight = () => {
    setHighlights([...highlights, { id: '', description: '' }]);
  };

  const handleRemoveHighlight = (index: number) => {
    setHighlights(highlights.filter((_, i) => i !== index));
  };

  const handleCategoryChange = (index: number, field: keyof AdminCategoryData, value: string | string[]) => {
    const newCategories = [...categories];
    newCategories[index] = { ...newCategories[index], [field]: value };
    setCategories(newCategories);
  };

  const handleCategoryIdsChange = (index: number, value: string) => {
    const ids = value.split(',').map(id => id.trim()).filter(id => id.length > 0);
    handleCategoryChange(index, 'ids', ids);
  };

  const handleAddCategory = () => {
    setCategories([...categories, { name: '', tagline: '', referral: '', ids: [] }]);
  };

  const handleRemoveCategory = (index: number) => {
    setCategories(categories.filter((_, i) => i !== index));
  };

  return (
    <form onSubmit={handleSubmit} class="space-y-8">

      <div>
        <div class="flex justify-between items-center mb-4">
          <h3 class="text-xl font-semibold">Highlights</h3>
          <button
            type="button"
            onClick={handleAddHighlight}
            class="btn bg-ubuntu-orange text-white font-bold text-sm px-4 py-2"
          >
            Add Highlight
          </button>
        </div>

        <div class="space-y-4">
          {highlights.map((highlight, index) => (
            <div key={index} class="border-2 border-gray-300 rounded-lg p-4">
              <div class="flex justify-between items-center mb-4">
                <h4 class="text-lg font-medium">Highlight {index + 1}</h4>
                <button
                  type="button"
                  onClick={() => handleRemoveHighlight(index)}
                  class="btn bg-red-500 text-white text-sm px-3 py-1"
                >
                  Remove
                </button>
              </div>

              <div class="space-y-3">
                <div>
                  <label class="block text-sm font-medium mb-1">
                    App ID <span class="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={highlight.id}
                    onInput={(e) => handleHighlightChange(index, 'id', e.currentTarget.value)}
                    class="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-ubuntu-orange"
                    placeholder="e.g., openstore.openstore-team"
                  />
                </div>

                <div>
                  <label class="block text-sm font-medium mb-1">
                    Description <span class="text-red-500">*</span>
                  </label>
                  <textarea
                    required
                    value={highlight.description}
                    onInput={(e) => handleHighlightChange(index, 'description', e.currentTarget.value)}
                    class="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-ubuntu-orange"
                    rows={2}
                    placeholder="Description for the highlight"
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div>
        <div class="flex justify-between items-center mb-4">
          <h3 class="text-xl font-semibold">Categories</h3>
          <button
            type="button"
            onClick={handleAddCategory}
            class="btn bg-ubuntu-orange text-white font-bold text-sm px-4 py-2"
          >
            Add Category
          </button>
        </div>

        <div class="space-y-4">
          {categories.map((category, index) => (
            <div key={index} class="border-2 border-gray-300 rounded-lg p-4">
              <div class="flex justify-between items-center mb-4">
                <h4 class="text-lg font-medium">Category {index + 1}</h4>
                <button
                  type="button"
                  onClick={() => handleRemoveCategory(index)}
                  class="btn bg-red-500 text-white text-sm px-3 py-1"
                >
                  Remove
                </button>
              </div>

              <div class="space-y-3">
                <div>
                  <label class="block text-sm font-medium mb-1">
                    Name <span class="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={category.name}
                    onInput={(e) => handleCategoryChange(index, 'name', e.currentTarget.value)}
                    class="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-ubuntu-orange"
                    placeholder="e.g., Games"
                  />
                </div>

                <div>
                  <label class="block text-sm font-medium mb-1">
                    Tagline <span class="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={category.tagline}
                    onInput={(e) => handleCategoryChange(index, 'tagline', e.currentTarget.value)}
                    class="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-ubuntu-orange"
                    placeholder="e.g., Fun and entertaining games"
                  />
                </div>

                <div>
                  <label class="block text-sm font-medium mb-1">
                    Referral URL
                  </label>
                  <input
                    type="text"
                    value={category.referral}
                    onInput={(e) => handleCategoryChange(index, 'referral', e.currentTarget.value)}
                    class="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-ubuntu-orange"
                    placeholder="Optional referral URL"
                  />
                </div>

                <div>
                  <label class="block text-sm font-medium mb-1">
                    App IDs <span class="text-red-500">*</span>
                  </label>
                  <textarea
                    required
                    value={category.ids.join(', ')}
                    onInput={(e) => handleCategoryIdsChange(index, e.currentTarget.value)}
                    class="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-ubuntu-orange"
                    rows={3}
                    placeholder="Comma-separated app IDs, e.g., app1.author, app2.author"
                  />
                  <p class="text-sm text-gray-600 mt-1">
                    Enter app IDs separated by commas
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Submit Button */}
      <section class="section flex gap-4 items-center mb-4">
        <div class="flex gap-2">
          <button
            type="submit"
            disabled={submitting}
            class="btn bg-ubuntu-orange text-white font-bold cursor-pointer"
          >
            {submitting ? (
              <>
                <SvgSpinner class="animate-spin ml-2" />
                Saving...
              </>
            ) : (
              "Save Changes"
            )}
          </button>
        </div>

        {success && <SvgCheck class="text-green-500" />}

        {error && (
          <div class="bg-red-400 border-2 border-red-500 rounded flex px-6 py-4 gap-4">
            <SvgClose class="text-red-600" />
            <div>
              An error occurred:
              <p>
                {error}
              </p>
            </div>
          </div>
        )}
      </section>
    </form>
  );
};

export default DiscoverForm;
