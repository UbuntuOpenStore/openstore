// SPDX-License-Identifier: AGPL-3.0-or-later
import { useState, useEffect, useCallback } from 'preact/hooks';
import { type JSX } from 'preact';
import { getClientApiKey } from '../../lib/utils';
import SvgSpinner from '../icons/Spinner';
import SvgClose from '../icons/Close';
import DiscoverForm from './DiscoverForm';
import { type AdminDiscoverData } from '../../lib/schema';

type DiscoverPageProps = {};

const DiscoverPage = ({}: DiscoverPageProps): JSX.Element => {
  const [discoverData, setDiscoverData] = useState<AdminDiscoverData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadDiscoverData = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const response = await fetch(
        `${import.meta.env.PUBLIC_API_URL}api/v4/admin/discover?apikey=${getClientApiKey()}`,
        {
          headers: { 'X-Source': 'openstore-web-next' }
        }
      );

      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          setDiscoverData(data.data);
        }
        else {
          setError(data.message || 'Failed to load discover data');
        }
      } else {
        setError(`Error: ${response.status} ${response.statusText}`);
      }
    } catch (err) {
      console.error(err);
      setError('Error loading discover data');
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    loadDiscoverData();
  }, [loadDiscoverData]);

  const handleFormSuccess = useCallback((data: AdminDiscoverData) => {
    setDiscoverData(data);
  }, []);

  if (loading && !discoverData) {
    return (
      <div class="flex justify-center items-center py-12">
        <SvgSpinner class="animate-spin text-ubuntu-orange w-12 h-12" />
      </div>
    );
  }

  if (error && !discoverData) {
    return (
      <div class="bg-red-400 border-2 border-red-500 rounded flex px-6 py-4 gap-4 mb-4">
        <SvgClose class="text-red-600" />
        <div>
          An error occurred:
          <p>
            {error}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div class="flex justify-between items-center mb-6">
        <h2 class="text-2xl font-semibold">Manage Discover Data</h2>
      </div>

      {discoverData && (
        <DiscoverForm
          discoverData={discoverData}
          onSuccess={handleFormSuccess}
        />
      )}
    </div>
  );
};

export default DiscoverPage;
