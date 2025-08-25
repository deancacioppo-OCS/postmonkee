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

            <h3 className="text-lg font-semibold text-slate-300 pt-4 border-t border-slate-700">WordPress Details</h3>
            <InputField label="WordPress Site URL" name="wp.url" value={formData.wp?.url || ''} onChange={handleChange} type="url" />
            <InputField label="WordPress Username" name="wp.username" value={formData.wp?.username || ''} onChange={handleChange} />
            <InputField label="WordPress App Password" name="wp.appPassword" value={formData.wp?.appPassword || ''} onChange={handleChange} type="password" />

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


export default ClientFormModal;
