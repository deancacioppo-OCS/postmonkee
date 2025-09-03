import React, { useState, useEffect, useCallback } from 'react';
import { Client } from './types';
import * as api from './services/geminiService';
import ClientCard from './components/ClientCard';
import ClientFormModal from './components/ClientFormModal';
import GenerationWorkflow from './components/GenerationWorkflow';
import GBPPostCreator from './components/GBPPostCreator';
import { PlusCircleIcon } from '@heroicons/react/24/solid';

const App: React.FC = () => {
  const [clients, setClients] = useState<Client[]>([]);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'blog' | 'gbp'>('gbp');

  const loadClients = useCallback(() => {
    setIsLoading(true);
    api.getClients()
      .then(data => {
        setClients(data);
        setError(null);
      })
      .catch(() => setError('Failed to connect to the backend. Is the server running?'))
      .finally(() => setIsLoading(false));
  }, []);

  useEffect(() => {
    loadClients();
  }, [loadClients]);

  const handleSaveClient = (client: Client) => {
    loadClients();
    if(selectedClient && selectedClient.id === client.id) {
        setSelectedClient(client);
    }
  };
  
  const handleEdit = (client: Client) => {
    setEditingClient(client);
    setIsModalOpen(true);
  };

  const handleAddNew = () => {
    setEditingClient(null);
    setIsModalOpen(true);
  };

  const handleDelete = (id: string) => {
    api.deleteClient(id).then(() => {
      loadClients();
      if(selectedClient && selectedClient.id === id) {
          setSelectedClient(null);
      }
    });
  };

  return (
    <div className="min-h-screen text-white p-4 sm:p-8 bg-slate-900 font-sans">
      <header className="mb-8">
        <h1 className="text-4xl sm:text-5xl font-bold text-cyan-400">
          post<span className="text-slate-300">MONKEE</span>
        </h1>
        <p className="text-slate-400 mt-2">AI-Powered Google Business Profile Post Generator</p>
      </header>

      <main className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-slate-800 p-6 rounded-lg shadow-lg">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-2xl font-semibold text-slate-200">Clients</h2>
            <button
              onClick={handleAddNew}
              className="flex items-center gap-2 bg-cyan-500 hover:bg-cyan-600 text-white font-bold py-2 px-4 rounded-lg transition-colors"
              aria-label="Add new client"
            >
              <PlusCircleIcon className="h-6 w-6" />
              <span>Add New</span>
            </button>
          </div>
          {isLoading && <p className="text-slate-400">Loading clients...</p>}
          {error && <div className="bg-red-800 border border-red-600 text-red-200 px-4 py-3 rounded-lg"><p className="font-bold">Error</p><p>{error}</p></div>}
          {!isLoading && !error && (
             <div className="space-y-4 max-h-[65vh] overflow-y-auto pr-2">
              {clients.map(client => (
                <ClientCard 
                    key={client.id} 
                    client={client} 
                    onSelect={() => setSelectedClient(client)}
                    onEdit={() => handleEdit(client)}
                    onDelete={() => handleDelete(client.id)}
                    isSelected={selectedClient?.id === client.id}
                />
              ))}
            </div>
          )}
        </div>

        <div className="bg-slate-800 p-6 rounded-lg shadow-lg">
          {/* Tab Navigation */}
          <div className="flex space-x-1 mb-6 bg-slate-700 p-1 rounded-lg">
            <button
              onClick={() => setActiveTab('gbp')}
              className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${
                activeTab === 'gbp'
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-300 hover:text-white hover:bg-slate-600'
              }`}
            >
              Google Business Profile Posts
            </button>
            <button
              onClick={() => setActiveTab('blog')}
              className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${
                activeTab === 'blog'
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-300 hover:text-white hover:bg-slate-600'
              }`}
            >
              Blog Generation
            </button>
          </div>

          {/* Tab Content */}
          {activeTab === 'gbp' ? (
            <GBPPostCreator 
              client={selectedClient} 
              onPostCreated={() => {
                // Optionally refresh data or show success message
              }}
            />
          ) : (
            <GenerationWorkflow client={selectedClient} />
          )}
        </div>
      </main>

      {isModalOpen && (
        <ClientFormModal
          client={editingClient}
          onClose={() => setIsModalOpen(false)}
          onSave={handleSaveClient}
        />
      )}
    </div>
  );
};

export default App;
