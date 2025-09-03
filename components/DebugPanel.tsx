import React, { useState, useEffect } from 'react';
import { logger } from '../utils/logger';

interface LogEntry {
  timestamp: string;
  level: string;
  message: string;
  data?: any;
}

const DebugPanel: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);

  useEffect(() => {
    // Override console methods to capture logs
    const originalLog = console.log;
    const originalError = console.error;
    const originalWarn = console.warn;
    const originalInfo = console.info;

    const addLog = (level: string, message: string, data?: any) => {
      setLogs(prev => [...prev.slice(-99), { // Keep last 100 logs
        timestamp: new Date().toISOString(),
        level,
        message: typeof message === 'string' ? message : JSON.stringify(message),
        data
      }]);
    };

    console.log = (...args) => {
      originalLog(...args);
      addLog('LOG', args[0], args.slice(1));
    };

    console.error = (...args) => {
      originalError(...args);
      addLog('ERROR', args[0], args.slice(1));
    };

    console.warn = (...args) => {
      originalWarn(...args);
      addLog('WARN', args[0], args.slice(1));
    };

    console.info = (...args) => {
      originalInfo(...args);
      addLog('INFO', args[0], args.slice(1));
    };

    return () => {
      console.log = originalLog;
      console.error = originalError;
      console.warn = originalWarn;
      console.info = originalInfo;
    };
  }, []);

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-4 right-4 bg-red-600 hover:bg-red-700 text-white p-2 rounded-full shadow-lg z-50"
        title="Open Debug Panel"
      >
        🐛
      </button>
    );
  }

  return (
    <div className="fixed bottom-4 right-4 w-96 h-96 bg-slate-800 border border-slate-600 rounded-lg shadow-xl z-50 flex flex-col">
      <div className="flex justify-between items-center p-3 border-b border-slate-600">
        <h3 className="text-white font-semibold">Debug Panel</h3>
        <div className="flex gap-2">
          <button
            onClick={() => setLogs([])}
            className="text-xs bg-slate-600 hover:bg-slate-500 text-white px-2 py-1 rounded"
          >
            Clear
          </button>
          <button
            onClick={() => setIsOpen(false)}
            className="text-white hover:text-red-400"
          >
            ✕
          </button>
        </div>
      </div>
      
      <div className="flex-1 overflow-y-auto p-2 text-xs font-mono">
        {logs.length === 0 ? (
          <div className="text-slate-400 text-center py-4">No logs yet</div>
        ) : (
          logs.map((log, index) => (
            <div key={index} className="mb-1 p-1 rounded">
              <div className="flex items-start gap-2">
                <span className={`text-xs px-1 rounded ${
                  log.level === 'ERROR' ? 'bg-red-600 text-white' :
                  log.level === 'WARN' ? 'bg-yellow-600 text-white' :
                  log.level === 'INFO' ? 'bg-blue-600 text-white' :
                  'bg-slate-600 text-white'
                }`}>
                  {log.level}
                </span>
                <span className="text-slate-400 text-xs">
                  {new Date(log.timestamp).toLocaleTimeString()}
                </span>
              </div>
              <div className="text-white mt-1 break-words">
                {log.message}
              </div>
              {log.data && log.data.length > 0 && (
                <div className="text-slate-300 mt-1">
                  {JSON.stringify(log.data, null, 2)}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default DebugPanel;
