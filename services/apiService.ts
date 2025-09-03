import { logger } from '../utils/logger';

const BASE_URL = import.meta.env.VITE_API_URL || 'https://postmonkee.onrender.com';

interface ApiResponse<T> {
  data: T;
  success: boolean;
  error?: string;
}

class ApiService {
  private async makeRequest<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${BASE_URL}${endpoint}`;
    const method = options.method || 'GET';
    
    logger.apiCall(method, url, options.body);

    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          ...options.headers,
        },
      });

      logger.apiResponse(url, response.status);

      if (!response.ok) {
        const errorText = await response.text();
        const errorMessage = `Request failed: ${response.status} ${response.statusText} - ${errorText}`;
        logger.error(`API Error: ${method} ${url}`, new Error(errorMessage), {
          status: response.status,
          statusText: response.statusText,
          body: errorText
        });
        throw new Error(errorMessage);
      }

      const data = await response.json();
      logger.debug(`API Success: ${method} ${url}`, data);
      return data;
    } catch (error) {
      logger.error(`API Request Failed: ${method} ${url}`, error);
      throw error;
    }
  }

  async get<T>(endpoint: string): Promise<T> {
    return this.makeRequest<T>(endpoint, { method: 'GET' });
  }

  async post<T>(endpoint: string, data: any): Promise<T> {
    return this.makeRequest<T>(endpoint, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async put<T>(endpoint: string, data: any): Promise<T> {
    return this.makeRequest<T>(endpoint, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async delete<T>(endpoint: string): Promise<T> {
    return this.makeRequest<T>(endpoint, { method: 'DELETE' });
  }

  // Health check
  async healthCheck(): Promise<boolean> {
    try {
      await this.get('/health');
      return true;
    } catch (error) {
      logger.error('Health check failed', error);
      return false;
    }
  }
}

export const apiService = new ApiService();
