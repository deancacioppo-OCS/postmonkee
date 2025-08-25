import React from 'react';

interface SpinnerProps {
    small?: boolean;
}

const Spinner: React.FC<SpinnerProps> = ({ small = false }) => {
  const sizeClasses = small ? 'h-4 w-4' : 'h-5 w-5';
  return (
    <div
      className={`animate-spin rounded-full border-t-2 border-r-2 border-white/50 border-solid ${sizeClasses}`}
      role="status"
      aria-live="polite"
      aria-label="Loading"
      style={{ borderTopColor: '#22d3ee' }} // tailwind cyan-400
    >
      <span className="sr-only">Loading...</span>
    </div>
  );
};

export default Spinner;
