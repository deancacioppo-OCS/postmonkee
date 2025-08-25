// This service now communicates with the backend, which securely proxies requests to the Gemini API.
import { Client, BlogPlan } from '../types';

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const errorText = await response.text();
    console.error('API Error:', errorText);
    throw new Error(`Request failed: ${response.statusText} - ${errorText}`);
  }
  return response.json() as Promise<T>;
}

export const getClients = (): Promise<Client[]> => {
  return fetch(`${BASE_URL}/api/clients`).then(res => handleResponse<Client[]>(res));
};

export const getClient = (id: string): Promise<Client> => {
  return fetch(`${BASE_URL}/api/clients/${id}`).then(res => handleResponse<Client>(res));
}

export const saveClient = (client: Omit<Client, 'id'> & { id?: string }): Promise<Client> => {
  const isNew = !client.id;
  const url = isNew ? `${BASE_URL}/api/clients` : `${BASE_URL}/api/clients/${client.id}`;
  const method = isNew ? 'POST' : 'PUT';

  return fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(client),
  }).then(res => handleResponse<Client>(res));
};

export const deleteClient = (id: string): Promise<void> => {
  return fetch(`${BASE_URL}/api/clients/${id}`, { method: 'DELETE' }).then(res => {
    if(!res.ok) throw new Error('Failed to delete client');
  });
};

export const generateTopic = (clientId: string): Promise<{ topic: string, sources: any[] }> => {
  return fetch(`${BASE_URL}/api/generate/topic`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ clientId }),
  }).then(res => handleResponse<{ topic: string, sources: any[] }>(res));
};

export const generatePlan = (clientId: string, topic: string): Promise<BlogPlan> => {
    return fetch(`${BASE_URL}/api/generate/plan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId, topic }),
    }).then(res => handleResponse<BlogPlan>(res));
};