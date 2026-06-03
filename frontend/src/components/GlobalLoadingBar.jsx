import React from 'react';
export default function GlobalLoadingBar({ loading }) {
  if (!loading) return null;
  return (
    <div className="fixed top-0 left-0 right-0 z-[9999] h-[3px] overflow-hidden">
      <div className="h-full animate-gradient-x"
        style={{ background: 'linear-gradient(90deg,#6366f1,#a78bfa,#6366f1)', backgroundSize: '200%' }} />
    </div>
  );
}
