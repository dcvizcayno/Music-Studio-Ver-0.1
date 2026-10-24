import React from 'react';
import { Music, Disc3, Library, Activity, Settings } from 'lucide-react';

export type StudioTab = 'text_to_song' | 'cover_studio' | 'library' | 'system_status' | 'settings';

interface TopBarProps {
  activeTab: StudioTab;
  onTabChange: (tab: StudioTab) => void;
  onQuickGenerate: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({
  activeTab,
  onTabChange,
  onQuickGenerate
}) => {
  return (
    <header className="border-b border-neutral-800 bg-neutral-950/90 backdrop-blur sticky top-0 z-40">
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-8 px-6 py-3.5">
        {/* Zone 1: Brand Wordmark (Single text element) */}
        <a
          href="#studio"
          onClick={(e) => {
            e.preventDefault();
            onTabChange('text_to_song');
          }}
          className="text-lg font-bold tracking-tight text-neutral-100 whitespace-nowrap shrink-0 hover:text-amber-400 transition-colors"
        >
          Song Studio
        </a>

        {/* Zone 2: Navigation Links */}
        <nav className="hidden md:flex items-center gap-6 text-xs font-medium text-neutral-400">
          <button
            onClick={() => onTabChange('text_to_song')}
            className={`whitespace-nowrap shrink-0 transition-colors hover:text-neutral-100 ${
              activeTab === 'text_to_song' ? 'text-amber-400 font-semibold' : ''
            }`}
          >
            Text to Song
          </button>

          <button
            onClick={() => onTabChange('cover_studio')}
            className={`whitespace-nowrap shrink-0 transition-colors hover:text-neutral-100 ${
              activeTab === 'cover_studio' ? 'text-amber-400 font-semibold' : ''
            }`}
          >
            Cover Studio
          </button>

          <button
            onClick={() => onTabChange('library')}
            className={`whitespace-nowrap shrink-0 transition-colors hover:text-neutral-100 ${
              activeTab === 'library' ? 'text-amber-400 font-semibold' : ''
            }`}
          >
            Library
          </button>

          <button
            onClick={() => onTabChange('system_status')}
            className={`whitespace-nowrap shrink-0 transition-colors hover:text-neutral-100 ${
              activeTab === 'system_status' ? 'text-amber-400 font-semibold' : ''
            }`}
          >
            System Status
          </button>

          <button
            onClick={() => onTabChange('settings')}
            className={`whitespace-nowrap shrink-0 transition-colors hover:text-neutral-100 ${
              activeTab === 'settings' ? 'text-amber-400 font-semibold' : ''
            }`}
          >
            Settings
          </button>
        </nav>

        {/* Zone 3: 1 Primary Action */}
        <div className="flex items-center gap-3 shrink-0">
          <button
            onClick={onQuickGenerate}
            className="px-4 py-2 text-xs font-semibold text-neutral-950 bg-amber-400 hover:bg-amber-300 rounded-lg transition-colors whitespace-nowrap shrink-0 shadow-sm"
          >
            Create Song
          </button>
        </div>
      </div>
    </header>
  );
};
