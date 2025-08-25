import React, { useState } from 'react';
import { Client } from '../types';
import * as api from '../services/geminiService';
import Spinner from './Spinner';

interface ClientFormModalProps {
  client: Client | null;
  onClose: () => void;
  onSave: (client: Client) => void;
}

const ClientFormModal: React.FC<ClientFormModalProps> = ({ client, onClose, onSave }) => {
  const [formData, setFormData] = useState<Partial<Client>>(
    client || {
      name: '',
      industry: '',
      websiteUrl: '',
      uniqueValueProp: '',
      brandVoice: '',
      contentStrategy: '',
      sitemapUrl: '',
      wp: { url: '', username: '' }
    }
  );
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    if (name.startsWith('wp.')) {
        const wpField = name.split('.')[1];
        setFormData(prev => ({ ...prev, wp: { ...prev.wp, [wpField]: value } }));
    } else {
        setFormData(prev => ({ ...prev, [name]: value }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    try {
      // Basic validation
      if (!formData.name || !formData.industry) {
        throw new Error("Company Name and Industry are required.");
      }
      const savedClient = await api.saveClient(formData as Client);
      onSave(savedClient);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to save client.');
    } finally {
      setIsLoading(false);
    }
  };
  
  const formTitle = client ? 'Edit Client' : 'Add New Client';

  return (
    <div 
        className="fixed inset-0 bg-black bg-opacity-70 flex justify-center items-center z-50"
        onClick={onClose}
        aria-modal="true"
        role="dialog"
    >
      <div 
        className="bg-slate-800 rounded-lg shadow-2xl p-8 w-full max-w-2xl max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <h2 className="text-2xl font-bold mb-6 text-cyan-400">{formTitle}</h2>
        
        {error && <div className="bg-red-800 text-red-200 p-3 rounded-md mb-4">{error}</div>}
        
        <form onSubmit={handleSubmit} className="space-y-4">
            <InputField label="Company Name" name="name" value={formData.name || ''} onChange={handleChange} required />
            <InputField label="Industry" name="industry" value={formData.industry || ''} onChange={handleChange} required />
            <InputField label="Website URL" name="websiteUrl" value={formData.websiteUrl || ''} onChange={handleChange} type="url" />

            <h3 className="text-lg font-semibold text-slate-300 pt-4 border-t border-slate-700">Brand Details</h3>
            <TextareaField label="Unique Value Proposition" name="uniqueValueProp" value={formData.uniqueValueProp || ''} onChange={handleChange} />
            <TextareaField label="Brand Voice" name="brandVoice" value={formData.brandVoice || ''} onChange={handleChange} />
            <TextareaField label="Content Strategy" name="contentStrategy" value={formData.contentStrategy || ''} onChange={handleChange} />

            <h3 className="text-lg font-semibold text-slate-300 pt-4 border-t border-slate-700">SEO & Internal Linking</h3>
            <InputField 
                label="XML Sitemap URL" 
                name="sitemapUrl" 
                value={formData.sitemapUrl || ''} 
                onChange={handleChange} 
                type="url" 
                placeholder="https://yoursite.com/sitemap.xml"
            />
            <div className="text-xs text-slate-400 mt-1">
                This will be used to find relevant internal links for blog posts. Minimum 2, average 5-8 internal links per article.
            </div>
            
            {/* Show sitemap test button if client exists and has sitemap URL */}
            {client.id && formData.sitemapUrl && (
                <SitemapTestButton clientId={client.id} />
            )}

            <h3 className="text-lg font-semibold text-slate-300 pt-4 border-t border-slate-700">WordPress Details</h3>
            <InputField label="WordPress Site URL" name="wp.url" value={formData.wp?.url || ''} onChange={handleChange} type="url" />
            <InputField label="WordPress Username" name="wp.username" value={formData.wp?.username || ''} onChange={handleChange} />
            <InputField label="WordPress App Password" name="wp.appPassword" value={formData.wp?.appPassword || ''} onChange={handleChange} type="password" />
            
            {/* WordPress Test Button - only show if client exists and has WP credentials */}
            {client && formData.wp?.url && formData.wp?.username && formData.wp?.appPassword && (
                <WordPressTestButton clientId={client.id} />
            )}

          <div className="flex justify-end gap-4 pt-4">
            <button type="button" onClick={onClose} className="py-2 px-4 bg-slate-600 hover:bg-slate-700 rounded-lg transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={isLoading} className="py-2 px-4 bg-cyan-500 hover:bg-cyan-600 rounded-lg transition-colors disabled:bg-slate-500 disabled:cursor-not-allowed flex items-center gap-2">
              {isLoading && <Spinner />}
              {isLoading ? 'Saving...' : 'Save Client'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// Helper sub-components for form fields
const InputField = ({ label, ...props }) => (
    <div>
        <label htmlFor={props.name} className="block text-sm font-medium text-slate-300 mb-1">{label}</label>
        <input id={props.name} {...props} className="w-full bg-slate-900 border border-slate-600 rounded-md p-2 focus:ring-cyan-500 focus:border-cyan-500 transition"/>
    </div>
);

const TextareaField = ({ label, ...props }) => (
    <div>
        <label htmlFor={props.name} className="block text-sm font-medium text-slate-300 mb-1">{label}</label>
        <textarea id={props.name} {...props} rows={3} className="w-full bg-slate-900 border border-slate-600 rounded-md p-2 focus:ring-cyan-500 focus:border-cyan-500 transition"></textarea>
    </div>
);

// WordPress Test Button Component
const WordPressTestButton = ({ clientId }) => {
    const [testing, setTesting] = useState(false);
    const [testResult, setTestResult] = useState(null);

    const handleTest = async () => {
        setTesting(true);
        setTestResult(null);
        try {
            const result = await api.testWordPressConnection(clientId);
            setTestResult(result);
        } catch (err) {
            setTestResult({ 
                success: false, 
                error: 'Connection test failed', 
                details: err.message 
            });
        } finally {
            setTesting(false);
        }
    };

    return (
        <div className="p-3 bg-slate-700 rounded-md">
            <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-slate-300">Test WordPress Connection</span>
                <button
                    type="button"
                    onClick={handleTest}
                    disabled={testing}
                    className="bg-blue-500 hover:bg-blue-600 text-white text-sm py-1 px-3 rounded transition-colors disabled:opacity-50 flex items-center gap-2"
                >
                    {testing && <Spinner small />}
                    {testing ? 'Testing...' : 'Test Connection'}
                </button>
            </div>
            
            {testResult && (
                <div className={`text-sm p-2 rounded ${testResult.success ? 'bg-green-800 text-green-200' : 'bg-red-800 text-red-200'}`}>
                    {testResult.success ? (
                        <div>
                            <p className="font-medium">✓ Connection successful!</p>
                            <p>Connected as: {testResult.user?.name} (@{testResult.user?.username})</p>
                        </div>
                    ) : (
                        <div>
                            <p className="font-medium">✗ Connection failed</p>
                            <p>{testResult.error}</p>
                            {testResult.details && <p className="text-xs mt-1">{testResult.details}</p>}
                            {testResult.suggestions && (
                                <ul className="text-xs mt-2 list-disc list-inside">
                                    {testResult.suggestions.map((suggestion, i) => (
                                        <li key={i}>{suggestion}</li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

// Sitemap Test Button Component
const SitemapTestButton = ({ clientId }) => {
    const [testing, setTesting] = useState(false);
    const [testResult, setTestResult] = useState(null);

    const handleTest = async () => {
        setTesting(true);
        setTestResult(null);
        try {
            const result = await api.testSitemapParsing(clientId);
            setTestResult(result);
        } catch (err) {
            setTestResult({ 
                success: false, 
                error: 'Sitemap test failed', 
                details: err.message 
            });
        } finally {
            setTesting(false);
        }
    };

    return (
        <div className="p-3 bg-slate-700 rounded-md mt-2">
            <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-slate-300">Test Sitemap Parsing</span>
                <button
                    type="button"
                    onClick={handleTest}
                    disabled={testing}
                    className="bg-green-500 hover:bg-green-600 text-white text-sm py-1 px-3 rounded transition-colors disabled:opacity-50 flex items-center gap-2"
                >
                    {testing && <Spinner small />}
                    {testing ? 'Testing...' : 'Test Sitemap'}
                </button>
            </div>
            
            {testResult && (
                <div className={`text-sm p-2 rounded ${testResult.success ? 'bg-green-800 text-green-200' : 'bg-red-800 text-red-200'}`}>
                    {testResult.success ? (
                        <div>
                            <p className="font-medium">✓ Sitemap parsed successfully!</p>
                            <p>Found {testResult.sitemap?.totalUrlsFound} URLs in sitemap</p>
                            <p>Database has {testResult.database?.existingUrls} stored URLs</p>
                            {testResult.sitemap?.sampleUrls && testResult.sitemap.sampleUrls.length > 0 && (
                                <div className="mt-2">
                                    <p className="text-xs font-medium">Sample URLs:</p>
                                    <ul className="text-xs mt-1 list-disc list-inside">
                                        {testResult.sitemap.sampleUrls.slice(0, 3).map((urlData, i) => (
                                            <li key={i} className="truncate">{urlData.url}</li>
                                        ))}
                                    </ul>
                                </div>
                            )}
                        </div>
                    ) : (
                        <div>
                            <p className="font-medium">✗ Sitemap test failed</p>
                            <p>{testResult.error}</p>
                            {testResult.details && <p className="text-xs mt-1">{testResult.details}</p>}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default ClientFormModal;
