// Enhanced logging utility for debugging
export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3
}

class Logger {
  private level: LogLevel = LogLevel.INFO;
  private isDevelopment: boolean = import.meta.env.DEV;

  constructor() {
    // Set log level based on environment
    this.level = this.isDevelopment ? LogLevel.DEBUG : LogLevel.WARN;
  }

  private shouldLog(level: LogLevel): boolean {
    return level >= this.level;
  }

  private formatMessage(level: string, message: string, data?: any): string {
    const timestamp = new Date().toISOString();
    return `[${timestamp}] [${level}] ${message}`;
  }

  debug(message: string, data?: any) {
    if (this.shouldLog(LogLevel.DEBUG)) {
      console.log(this.formatMessage('DEBUG', message), data || '');
    }
  }

  info(message: string, data?: any) {
    if (this.shouldLog(LogLevel.INFO)) {
      console.info(this.formatMessage('INFO', message), data || '');
    }
  }

  warn(message: string, data?: any) {
    if (this.shouldLog(LogLevel.WARN)) {
      console.warn(this.formatMessage('WARN', message), data || '');
    }
  }

  error(message: string, error?: Error | any, data?: any) {
    if (this.shouldLog(LogLevel.ERROR)) {
      console.error(this.formatMessage('ERROR', message), error || '', data || '');
      
      // Log additional context for errors
      if (error instanceof Error) {
        console.error('Error Stack:', error.stack);
        console.error('Error Name:', error.name);
      }
    }
  }

  // API-specific logging
  apiCall(method: string, url: string, data?: any) {
    this.debug(`API Call: ${method} ${url}`, data);
  }

  apiResponse(url: string, status: number, data?: any) {
    if (status >= 400) {
      this.error(`API Error: ${url} returned ${status}`, null, data);
    } else {
      this.debug(`API Response: ${url} returned ${status}`, data);
    }
  }

  // Component lifecycle logging
  componentMount(componentName: string, props?: any) {
    this.debug(`Component Mounted: ${componentName}`, props);
  }

  componentUnmount(componentName: string) {
    this.debug(`Component Unmounted: ${componentName}`);
  }

  componentError(componentName: string, error: Error, props?: any) {
    this.error(`Component Error in ${componentName}`, error, props);
  }

  // State logging
  stateChange(componentName: string, stateName: string, oldValue: any, newValue: any) {
    this.debug(`State Change in ${componentName}: ${stateName}`, {
      old: oldValue,
      new: newValue
    });
  }
}

export const logger = new Logger();

// Global error handler
export const setupGlobalErrorHandling = () => {
  // Unhandled promise rejections
  window.addEventListener('unhandledrejection', (event) => {
    logger.error('Unhandled Promise Rejection', event.reason);
    console.error('Unhandled Promise Rejection:', event.reason);
  });

  // Global JavaScript errors
  window.addEventListener('error', (event) => {
    logger.error('Global JavaScript Error', event.error, {
      message: event.message,
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno
    });
  });

  // Console error override for better tracking
  const originalConsoleError = console.error;
  console.error = (...args) => {
    logger.error('Console Error', args[0], args.slice(1));
    originalConsoleError.apply(console, args);
  };
};
