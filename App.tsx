import React, { useState, useEffect, useCallback } from 'react';
import { Client } from './types';
import * as api from './services/geminiService';
import ClientCard from './components/ClientCard';
import ClientFormModal from './components/ClientFormModal';
import GenerationWorkflow from './components/GenerationWorkflow';
import GBPPostCreator from './components/GBPPostCreator';
import ErrorBoundary from './components/ErrorBoundary';
import DebugPanel from './components/DebugPanel';
import { logger, setupGlobalErrorHandling } from './utils/logger';
import { PlusCircleIcon } from '@heroicons/react/24/solid';

const App: React.FC = () => {
  const [clients, setClients] = useState<Client[]>([]);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'blog' | 'gbp'>('gbp');

  // Setup global error handling
  useEffect(() => {
    setupGlobalErrorHandling();
    logger.componentMount('App', { activeTab });
    
    return () => {
      logger.componentUnmount('App');
    };
  }, []);

  const loadClients = useCallback(() => {
    logger.debug('Loading clients...');
    setIsLoading(true);
    setError(null);
    
    api.getClients()
      .then(data => {
        logger.debug('Clients loaded successfully', { count: data?.length || 0, data });
        setClients(data || []);
        setError(null);
      })
      .catch((error) => {
        logger.error('Failed to load clients', error);
        setError('Failed to connect to the backend. Is the server running?');
        setClients([]);
      })
      .finally(() => {
        setIsLoading(false);
        logger.debug('Client loading completed');
      });
  }, []);

  useEffect(() => {
    loadClients();
  }, [loadClients]);

  const handleSaveClient = (client: Client) => {
    logger.debug('Client saved', { clientId: client.id, clientName: client.name });
    loadClients();
    if(selectedClient && selectedClient.id === client.id) {
        setSelectedClient(client);
    }
  };
  
  const handleEdit = (client: Client) => {
    logger.debug('Editing client', { clientId: client.id, clientName: client.name });
    setEditingClient(client);
    setIsModalOpen(true);
  };

  const handleAddNew = () => {
    logger.debug('Adding new client');
    setEditingClient(null);
    setIsModalOpen(true);
  };

  const handleDelete = (id: string) => {
    logger.debug('Deleting client', { clientId: id });
    api.deleteClient(id).then(() => {
      logger.debug('Client deleted successfully', { clientId: id });
      loadClients();
      if(selectedClient && selectedClient.id === id) {
          setSelectedClient(null);
      }
    }).catch((error) => {
      logger.error('Failed to delete client', error, { clientId: id });
    });
  };

  // Log state changes
  useEffect(() => {
    logger.stateChange('App', 'clients', null, clients);
  }, [clients]);

  useEffect(() => {
    logger.stateChange('App', 'selectedClient', null, selectedClient);
  }, [selectedClient]);

  useEffect(() => {
    logger.stateChange('App', 'activeTab', null, activeTab);
  }, [activeTab]);

  return (
    <ErrorBoundary>
      <div className="min-h-screen text-white p-4 sm:p-8 bg-slate-900 font-sans">
      <header className="mb-8">
        <h1 className="text-4xl sm:text-5xl font-bold text-cyan-400">
          post<span className="text-slate-300">MONKEE</span>
        </h1>
        <p className="text-slate-400 mt-2">AI-Powered Google Business Profile Post Generator v2.1 - GoHighLevel Ready</p>
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
              {clients && clients.length > 0 ? clients.map((client, index) => {
                // Add comprehensive null checking and logging
                if (!client) {
                  logger.error(`Client at index ${index} is null or undefined`, null, { index, clients });
                  return null;
                }
                if (!client.id) {
                  logger.error(`Client at index ${index} has no id`, null, { client, index });
                  return null;
                }
                
                logger.debug(`Rendering client card for ${client.name}`, { client, index });
                
                return (
                  <ClientCard 
                      key={client.id} 
                      client={client} 
                      onSelect={() => {
                        logger.debug('Client selected', { client });
                        setSelectedClient(client);
                      }}
                      onEdit={() => {
                        logger.debug('Client edit requested', { client });
                        handleEdit(client);
                      }}
                      onDelete={() => {
                        logger.debug('Client delete requested', { client });
                        handleDelete(client.id);
                      }}
                      isSelected={selectedClient?.id === client.id}
                  />
                );
              }) : (
                <p className="text-slate-400 text-center py-8">No clients found. Add your first client to get started!</p>
              )}
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
      <DebugPanel />
    </ErrorBoundary>
  );
};

export default App;
