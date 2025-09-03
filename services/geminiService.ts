// This service now communicates with the backend, which securely proxies requests to the Gemini API.
import { Client } from '../types';

const BASE_URL = import.meta.env.VITE_API_URL || 'https://postmonkee.onrender.com';

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const errorText = await response.text();
    console.error('API Error:', errorText);
    throw new Error(`Request failed: ${response.statusText} - ${errorText}`);
  }
  return response.json() as Promise<T>;
}

export const getClients = (): Promise<Client[]> => {
  return fetch(`${BASE_URL}/api/clients`)
    .then(res => handleResponse<Client[]>(res))
    .then(data => Array.isArray(data) ? data : [])
    .catch(error => {
      console.error('Failed to fetch clients:', error);
      return [];
    });
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



export const testWebsiteCrawling = (clientId: string, websiteUrl: string): Promise<{ success: boolean, message: string, client: any, crawl: any, database: any, error?: string, details?: string }> => {
    return fetch(`${BASE_URL}/api/test/crawl`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId, websiteUrl }),
    }).then(res => handleResponse<{ success: boolean, message: string, client: any, crawl: any, database: any, error?: string, details?: string }>(res));
};

export const testSitemapParsing = (clientId: string, sitemapUrl: string): Promise<{ success: boolean, message: string, client: any, parsing: any, database: any, advantages: string[], error?: string, details?: string, suggestion?: string }> => {
    return fetch(`${BASE_URL}/api/test/sitemap`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId, sitemapUrl }),
    }).then(res => handleResponse<{ success: boolean, message: string, client: any, parsing: any, database: any, advantages: string[], error?: string, details?: string, suggestion?: string }>(res));
};

// ===== GoHighLevel and GBP Post API Functions =====

export interface GBPPost {
  id: number;
  client_id: string;
  content: string;
  image_url?: string;
  more_info_url?: string;
  cta_text: string;
  status: string;
  scheduled_at?: string;
  published_at?: string;
  ghl_post_id?: string;
  ghl_account_id?: string;
  created_at: string;
}

export interface GHLSubAccount {
  id: number;
  client_id: string;
  location_id: string;
  sub_account_name?: string;
  access_token: string;
  is_active: boolean;
  created_at: string;
}

export const createGBPPost = (clientId: string, topic: string, scheduledAt?: Date): Promise<{ success: boolean, post: GBPPost, message: string }> => {
  return fetch(`${BASE_URL}/api/gbp/create-post`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ clientId, topic, scheduledAt }),
  }).then(res => handleResponse<{ success: boolean, post: GBPPost, message: string }>(res));
};

export const getGBPPosts = (clientId: string): Promise<{ success: boolean, posts: GBPPost[] }> => {
  return fetch(`${BASE_URL}/api/gbp/posts/${clientId}`).then(res => handleResponse<{ success: boolean, posts: GBPPost[] }>(res));
};

export const saveGHLSubAccount = (clientId: string, locationId: string, subAccountName: string, accessToken: string): Promise<{ success: boolean, subAccount: GHLSubAccount, message: string }> => {
  return fetch(`${BASE_URL}/api/ghl/sub-accounts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ clientId, locationId, subAccountName, accessToken }),
  }).then(res => handleResponse<{ success: boolean, subAccount: GHLSubAccount, message: string }>(res));
};

export const getGHLSubAccounts = (clientId: string): Promise<{ success: boolean, subAccounts: GHLSubAccount[] }> => {
  return fetch(`${BASE_URL}/api/ghl/sub-accounts/${clientId}`).then(res => handleResponse<{ success: boolean, subAccounts: GHLSubAccount[] }>(res));
};

export const testGoHighLevelConnection = (clientId: string, locationId: string): Promise<{ success: boolean, location?: any, connectedAccounts?: any[], error?: string }> => {
  return fetch(`${BASE_URL}/api/ghl/test-connection`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ clientId, locationId }),
  }).then(res => handleResponse<{ success: boolean, location?: any, connectedAccounts?: any[], error?: string }>(res));
};