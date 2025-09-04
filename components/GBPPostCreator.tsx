import React, { useState, useCallback, useEffect } from 'react';
import { Client } from '../types';
import { createGBPPost, saveGHLSubAccount, getGHLSubAccounts, GHLSubAccount, testGBPEndpoint, testSimpleEndpoint } from '../services/geminiService';
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
  // All hooks must be called at the top level
  const [topic, setTopic] = useState('');
  const [scheduledAt, setScheduledAt] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [preview, setPreview] = useState<GBPPostPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  
  // GoHighLevel Sub-Account Management
  const [showGHLSetup, setShowGHLSetup] = useState(false);
  const [ghlLocationId, setGhlLocationId] = useState('');
  const [ghlSubAccountName, setGhlSubAccountName] = useState('');
  const [ghlAccessToken, setGhlAccessToken] = useState('');
  const [ghlSubAccounts, setGhlSubAccounts] = useState<GHLSubAccount[]>([]);

  // Handle null client - moved after all hooks
  if (!client) {
    return (
      <div className="text-center py-8">
        <p className="text-slate-400 text-lg">Please select a client to create Google Business Profile posts</p>
      </div>
    );
  }

  const handleTestEndpoint = async () => {
    if (!topic.trim()) {
      setError('Please enter a topic for your GBP post');
      return;
    }

    setIsCreating(true);
    setError(null);
    setSuccess(null);

    try {
      console.log('🧪 Testing endpoint with:', { clientId: client.id, topic });
      const result = await testGBPEndpoint(client.id, topic);
      console.log('🧪 Test result:', result);
      
      if (result.success) {
        setSuccess(`Test successful: ${result.message}`);
      } else {
        setError(`Test failed: ${result.error}`);
      }
    } catch (err) {
      console.error('🧪 Test error:', err);
      setError(err instanceof Error ? err.message : 'Test error occurred');
    } finally {
      setIsCreating(false);
    }
  };

  const handleSimpleTest = async () => {
    setIsCreating(true);
    setError(null);
    setSuccess(null);

    try {
      console.log('🧪 Testing simple endpoint');
      const result = await testSimpleEndpoint();
      console.log('🧪 Simple test result:', result);
      
      if (result.success) {
        setSuccess(`Simple test successful: ${result.message}`);
      } else {
        setError(`Simple test failed: ${result.error}`);
      }
    } catch (err) {
      console.error('🧪 Simple test error:', err);
      setError(err instanceof Error ? err.message : 'Simple test error occurred');
    } finally {
      setIsCreating(false);
    }
  };

  const handleCreatePost = async () => {
    if (!topic.trim()) {
      setError('Please enter a topic for your GBP post');
      return;
    }

    setIsCreating(true);
    setError(null);
    setSuccess(null);

    try {
      // Phase 1: Simple content generation only
      const result = await createGBPPost(client.id, topic);
      
      if (result.success) {
        setSuccess(result.message);
        setPreview({
          content: result.post.content,
          imageUrl: undefined, // Phase 1: No images yet
          moreInfoUrl: '', // Phase 1: No more info links yet
          scheduledAt: new Date(result.post.created_at)
        });
        setTopic('');
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

  // Temporarily disable automatic GHL loading to fix React error #310
  // TODO: Re-implement with proper dependency management

  const refreshGHLSubAccounts = async () => {
    if (!client?.id) return;
    
    try {
      console.log('🔄 Loading GHL sub-accounts...');
      const res = await getGHLSubAccounts(client.id);
      const list = res?.subAccounts || [];
      setGhlSubAccounts(list);
      console.log('✅ GHL sub-accounts loaded:', list);
    } catch (error) {
      console.error('❌ Error loading GHL sub-accounts:', error);
      setError('Failed to load GHL sub-accounts');
    }
  };

  const handleSaveGHLSubAccount = async () => {
    if (!client?.id) return;
    if (!ghlLocationId || !ghlAccessToken) {
      setError('Location ID and Access Token are required');
      return;
    }
    if (ghlLocationId.length > 3000) {
      setError('Location ID looks too long — please paste the GoHighLevel Location ID, not the token');
      return;
    }
    
    try {
      console.log('💾 Saving GHL sub-account...');
      const res = await saveGHLSubAccount(
        client.id,
        ghlLocationId,
        ghlSubAccountName,
        ghlAccessToken
      );
      if (!res?.success) {
        setError(res?.message || 'Failed to save GHL sub-account');
        return;
      }
      
      // Clear form
      setGhlSubAccountName('');
      setGhlLocationId('');
      setGhlAccessToken('');
      
      // Refresh the list
      await refreshGHLSubAccounts();
      
      setSuccess(res?.message || 'GHL sub-account saved successfully!');
    } catch (error) {
      console.error('❌ Error saving GHL sub-account:', error);
      setError('Failed to save GHL sub-account');
    }
  };

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
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
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
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
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
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
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
      <div className="mb-6 p-4 bg-green-50 rounded-lg border border-green-200">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-lg font-semibold text-green-900">Connected GoHighLevel Sub-Accounts</h3>
          <button
            onClick={refreshGHLSubAccounts}
            className="px-3 py-1 bg-green-600 text-white text-sm rounded hover:bg-green-700 transition-colors"
          >
            Load Sub-Accounts
          </button>
        </div>
        {ghlSubAccounts.length > 0 ? (
          ghlSubAccounts.map((account) => (
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
          ))
        ) : (
          <p className="text-gray-600 text-sm">No sub-accounts loaded. Click "Load Sub-Accounts" to refresh.</p>
        )}
      </div>

      {/* Phase 1: Simple Post Creation Form */}
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
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
          />
        </div>

        <div className="flex space-x-2">
          <button
            onClick={handleCreatePost}
            disabled={isCreating || !topic.trim()}
            className="flex-1 flex items-center justify-center px-4 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
          >
            {isCreating ? (
              <>
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
                Generating Content...
              </>
            ) : (
              <>
                <PlusCircleIcon className="w-5 h-5 mr-2" />
                Generate GBP Content
              </>
            )}
          </button>
          
          <button
            onClick={handleTestEndpoint}
            disabled={isCreating || !topic.trim()}
            className="px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
          >
            Test
          </button>
          
          <button
            onClick={handleSimpleTest}
            disabled={isCreating}
            className="px-4 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
          >
            Simple
          </button>
        </div>
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

      {/* Phase 1: Content Preview */}
      {preview && (
        <div className="mt-6 p-4 bg-gray-50 rounded-lg border">
          <h3 className="text-lg font-semibold text-gray-900 mb-3">Generated GBP Content</h3>
          
          <div className="bg-white p-4 rounded-lg shadow-sm">
            <p className="text-gray-800 mb-3 text-lg leading-relaxed">{preview.content}</p>
            
            <div className="flex items-center justify-between text-sm text-gray-600">
              <div className="flex items-center">
                <CalendarIcon className="w-4 h-4 mr-1" />
                Created: {preview.scheduledAt.toLocaleString()}
              </div>
              
              <div className="text-xs text-gray-500">
                {preview.content.length} characters
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default GBPPostCreator;
