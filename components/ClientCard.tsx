import React from 'react';
import { Client } from '../types';
import { PencilIcon, TrashIcon, SparklesIcon } from '@heroicons/react/24/outline';

interface ClientCardProps {
  client: Client;
  onSelect: () => void;
  onEdit: () => void;
  onDelete: () => void;
  isSelected: boolean;
}

const ClientCard: React.FC<ClientCardProps> = ({ client, onSelect, onEdit, onDelete, isSelected }) => {
  const stopPropagation = (e: React.MouseEvent) => e.stopPropagation();

  return (
    <div className={`
      bg-slate-700 rounded-lg p-4 shadow-md cursor-pointer
      border-2 transition-all
      ${isSelected ? 'border-cyan-400 scale-105' : 'border-transparent hover:border-slate-600'}
    `}>
      <div onClick={onSelect}>
        <h3 className="text-xl font-bold text-cyan-300 truncate">{client.name}</h3>
        <p className="text-slate-400 text-sm">{client.industry}</p>
      </div>
      <div className="mt-4 flex justify-between items-center">
        <button
          onClick={onSelect}
          className="flex items-center gap-2 bg-slate-600 hover:bg-cyan-500 text-white font-semibold py-2 px-3 rounded-md text-sm transition-colors"
          aria-label={`Generate content for ${client.name}`}
        >
          <SparklesIcon className="h-5 w-5"/>
          Generate
        </button>
        <div className="flex items-center gap-2">
           <button onClick={(e) => { stopPropagation(e); onEdit(); }} aria-label={`Edit ${client.name}`} className="p-2 text-slate-400 hover:text-white transition-colors">
             <PencilIcon className="h-5 w-5" />
           </button>
           <button onClick={(e) => { stopPropagation(e); onDelete(); }} aria-label={`Delete ${client.name}`} className="p-2 text-slate-400 hover:text-red-500 transition-colors">
             <TrashIcon className="h-5 w-5" />
           </button>
        </div>
      </div>
    </div>
  );
};

export default ClientCard;
