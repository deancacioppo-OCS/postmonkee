import React, { useState } from 'react';
import { Client } from '../types';
import { createGBPPost, saveGHLSubAccount, getGHLSubAccounts, GHLSubAccount } from '../services/geminiService';
import { PlusCircleIcon, CalendarIcon, PhotoIcon, LinkIcon } from '@heroicons/react/24/solid';

interface GBPPostCreatorProps {
  client: Client | null;
  onPostCreated?: () => void;
}

interface GBPPostPreview {
  content: string;
  imageUrl?: string;
  moreInfoUrl: string;
  scheduledAt: Date;
}

const GBPPostCreator: React.FC<GBPPostCreatorProps> = ({ client, onPostCreated }) => {
  const [topic, setTopic] = useState('');
  const [scheduledAt, setScheduledAt] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [preview, setPreview] = useState<GBPPostPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Handle null client
  if (!client) {
    return (
      <div className="text-center py-8">
        <p className="text-slate-400 text-lg">Please select a client to create Google Business Profile posts</p>
      </div>
    );
  }
  
  // GoHighLevel Sub-Account Management
  const [showGHLSetup, setShowGHLSetup] = useState(false);
  const [ghlLocationId, setGhlLocationId] = useState('');
  const [ghlSubAccountName, setGhlSubAccountName] = useState('');
  const [ghlAccessToken, setGhlAccessToken] = useState('');
  const [ghlSubAccounts, setGhlSubAccounts] = useState<GHLSubAccount[]>([]);

  const handleCreatePost = async () => {
    if (!topic.trim()) {
      setError('Please enter a topic for your GBP post');
      return;
    }

    setIsCreating(true);
    setError(null);
    setSuccess(null);

    try {
      const scheduledDate = scheduledAt ? new Date(scheduledAt) : undefined;
      const result = await createGBPPost(client.id, topic, scheduledDate);
      
      if (result.success) {
        setSuccess(result.message);
        setPreview({
          content: result.post.content,
          imageUrl: result.post.image_url,
          moreInfoUrl: result.post.more_info_url || '',
          scheduledAt: new Date(result.post.scheduled_at || Date.now())
        });
        setTopic('');
        setScheduledAt('');
        onPostCreated?.();
      } else {
        setError('Failed to create GBP post');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsCreating(false);
    }
  };

  const handleSaveGHLSubAccount = async () => {
    if (!ghlLocationId || !ghlAccessToken) {
      setError('Location ID and Access Token are required');
      return;
    }

    try {
      const result = await saveGHLSubAccount(
        client.id,
        ghlLocationId,
        ghlSubAccountName || `${client.name} - GHL`,
        ghlAccessToken
      );
      
      if (result.success) {
        setSuccess('GoHighLevel sub-account configured successfully!');
        setShowGHLSetup(false);
        setGhlLocationId('');
        setGhlSubAccountName('');
        setGhlAccessToken('');
        // Refresh sub-accounts list
        loadGHLSubAccounts();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save sub-account');
    }
  };

  const loadGHLSubAccounts = async () => {
    try {
      const result = await getGHLSubAccounts(client.id);
      if (result.success) {
        setGhlSubAccounts(result.subAccounts);
      }
    } catch (err) {
      console.error('Failed to load GHL sub-accounts:', err);
    }
  };

  React.useEffect(() => {
    loadGHLSubAccounts();
  }, [client.id]);

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Create Google Business Profile Post</h2>
        <button
          onClick={() => setShowGHLSetup(!showGHLSetup)}
          className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          <PlusCircleIcon className="w-5 h-5 mr-2" />
          Setup GoHighLevel
        </button>
      </div>

      {/* GoHighLevel Sub-Account Setup */}
      {showGHLSetup && (
        <div className="mb-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
          <h3 className="text-lg font-semibold text-blue-900 mb-4">GoHighLevel Sub-Account Setup</h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Location ID
              </label>
              <input
                type="text"
                value={ghlLocationId}
                onChange={(e) => setGhlLocationId(e.target.value)}
                placeholder="Enter GoHighLevel Location ID"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Sub-Account Name
              </label>
              <input
                type="text"
                value={ghlSubAccountName}
                onChange={(e) => setGhlSubAccountName(e.target.value)}
                placeholder={`${client.name} - GHL`}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
          
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Access Token
            </label>
            <input
              type="password"
              value={ghlAccessToken}
              onChange={(e) => setGhlAccessToken(e.target.value)}
              placeholder="Enter GoHighLevel Access Token"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          
          <button
            onClick={handleSaveGHLSubAccount}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
          >
            Save Sub-Account
          </button>
        </div>
      )}

      {/* Existing Sub-Accounts */}
      {ghlSubAccounts.length > 0 && (
        <div className="mb-6 p-4 bg-green-50 rounded-lg border border-green-200">
          <h3 className="text-lg font-semibold text-green-900 mb-2">Connected GoHighLevel Sub-Accounts</h3>
          {ghlSubAccounts.map((account) => (
            <div key={account.id} className="flex items-center justify-between py-2">
              <div>
                <span className="font-medium">{account.sub_account_name || 'Unnamed Account'}</span>
                <span className="text-sm text-gray-600 ml-2">({account.location_id})</span>
              </div>
              <span className={`px-2 py-1 rounded-full text-xs ${
                account.is_active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
              }`}>
                {account.is_active ? 'Active' : 'Inactive'}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Post Creation Form */}
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Post Topic
          </label>
          <input
            type="text"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="What would you like to post about?"
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Schedule Post (Optional)
          </label>
          <input
            type="datetime-local"
            value={scheduledAt}
            onChange={(e) => setScheduledAt(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <button
          onClick={handleCreatePost}
          disabled={isCreating || !topic.trim()}
          className="w-full flex items-center justify-center px-4 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
        >
          {isCreating ? (
            <>
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
              Creating Post...
            </>
          ) : (
            <>
              <PlusCircleIcon className="w-5 h-5 mr-2" />
              Create GBP Post
            </>
          )}
        </button>
      </div>

      {/* Error/Success Messages */}
      {error && (
        <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-red-800">{error}</p>
        </div>
      )}

      {success && (
        <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-lg">
          <p className="text-green-800">{success}</p>
        </div>
      )}

      {/* Post Preview */}
      {preview && (
        <div className="mt-6 p-4 bg-gray-50 rounded-lg border">
          <h3 className="text-lg font-semibold text-gray-900 mb-3">Post Preview</h3>
          
          <div className="bg-white p-4 rounded-lg shadow-sm">
            {preview.imageUrl && (
              <img 
                src={preview.imageUrl} 
                alt="Post preview" 
                className="w-full h-64 object-cover rounded-lg mb-3"
              />
            )}
            
            <p className="text-gray-800 mb-3">{preview.content}</p>
            
            <div className="flex items-center justify-between text-sm text-gray-600">
              <div className="flex items-center">
                <CalendarIcon className="w-4 h-4 mr-1" />
                Scheduled: {preview.scheduledAt.toLocaleString()}
              </div>
              
              {preview.moreInfoUrl && (
                <div className="flex items-center">
                  <LinkIcon className="w-4 h-4 mr-1" />
                  <a href={preview.moreInfoUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                    Learn More
                  </a>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default GBPPostCreator;
