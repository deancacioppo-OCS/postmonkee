// This service now communicates with the backend, which securely proxies requests to the Gemini API.
import { Client, BlogPlan } from '../types';

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

export const generateOutline = (clientId: string, topic: string, title: string, angle: string, keywords: string[]): Promise<{ outline: string, estimatedWordCount: number, seoScore: number }> => {
    return fetch(`${BASE_URL}/api/generate/outline`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId, topic, title, angle, keywords }),
    }).then(res => handleResponse<{ outline: string, estimatedWordCount: number, seoScore: number }>(res));
};

export const generateContent = (clientId: string, topic: string, title: string, angle: string, keywords: string[], outline: string): Promise<{ content: string, wordCount: number, metaDescription: string, faq: { question: string, answer: string }[] }> => {
    return fetch(`${BASE_URL}/api/generate/content`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId, topic, title, angle, keywords, outline }),
    }).then(res => handleResponse<{ content: string, wordCount: number, metaDescription: string, faq: { question: string, answer: string }[] }>(res));
};

export const generateImages = (clientId: string, title: string, headings?: string[]): Promise<{ featuredImage: { description: string, placeholder: string }, inBodyImages: { heading: string, description: string, placeholder: string }[] }> => {
    return fetch(`${BASE_URL}/api/generate/images`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId, title, headings }),
    }).then(res => handleResponse<{ featuredImage: { description: string, placeholder: string }, inBodyImages: { heading: string, description: string, placeholder: string }[] }>(res));
};

export const publishToWordPress = (clientId: string, title: string, content: string, metaDescription?: string, featuredImage?: string, tags?: string[], categories?: string[]): Promise<{ success: boolean, postId: number, postUrl: string, editUrl: string, status: string, message: string }> => {
    return fetch(`${BASE_URL}/api/publish/wordpress`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId, title, content, metaDescription, featuredImage, tags, categories }),
    }).then(res => handleResponse<{ success: boolean, postId: number, postUrl: string, editUrl: string, status: string, message: string }>(res));
};

export const generateCompleteBlog = (clientId: string): Promise<{ topic: string, sources: any[], plan: BlogPlan, content: { content: string, wordCount: number, metaDescription: string, faq: { question: string, answer: string }[] }, readyToPublish: boolean }> => {
    return fetch(`${BASE_URL}/api/generate/complete-blog`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId }),
    }).then(res => handleResponse<{ topic: string, sources: any[], plan: BlogPlan, content: { content: string, wordCount: number, metaDescription: string, faq: { question: string, answer: string }[] }, readyToPublish: boolean }>(res));
};

export const generateLuckyBlog = (clientId: string): Promise<{ success: boolean, topic: string, sources: any[], plan: BlogPlan, content: { content: string, wordCount: number, metaDescription: string }, publishResult: WordPressPublishResult, isLucky: boolean }> => {
    return fetch(`${BASE_URL}/api/generate/lucky-blog`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId }),
    }).then(res => handleResponse<{ success: boolean, topic: string, sources: any[], plan: BlogPlan, content: { content: string, wordCount: number, metaDescription: string }, publishResult: WordPressPublishResult, isLucky: boolean }>(res));
};

export const testWordPressConnection = (clientId: string): Promise<{ success: boolean, message: string, user?: any, error?: string, details?: string, suggestions?: string[] }> => {
    return fetch(`${BASE_URL}/api/test/wordpress`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId }),
    }).then(res => handleResponse<{ success: boolean, message: string, user?: any, error?: string, details?: string, suggestions?: string[] }>(res));
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