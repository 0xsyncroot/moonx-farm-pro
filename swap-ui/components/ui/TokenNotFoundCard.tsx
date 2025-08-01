'use client';

import { Search, Plus, ExternalLink } from 'lucide-react';
import Button from './Button';

interface TokenNotFoundCardProps {
  searchQuery?: string;
  onImportToken?: () => void;
  onClearSearch?: () => void;
  showImport?: boolean;
}

const TokenNotFoundCard: React.FC<TokenNotFoundCardProps> = ({
  searchQuery,
  onImportToken,
  onClearSearch,
  showImport = true
}) => {
  return (
    <div className="p-6 bg-gray-900/40 border border-gray-800 rounded-xl">
      <div className="flex flex-col items-center text-center space-y-4">
        {/* Icon */}
        <div className="w-16 h-16 bg-gray-800/60 rounded-full flex items-center justify-center">
          <Search className="w-8 h-8 text-gray-500" />
        </div>

        {/* Content */}
        <div className="space-y-2">
          <h3 className="text-lg font-semibold text-white">
            No tokens found
          </h3>
          {searchQuery ? (
            <p className="text-gray-400 text-sm">
              No results for "<span className="text-white font-medium">{searchQuery}</span>"
            </p>
          ) : (
            <p className="text-gray-400 text-sm">
              Unable to load token list from the network
            </p>
          )}
        </div>

        {/* Suggestions */}
        <div className="space-y-3 w-full">
          <div className="text-xs text-gray-500 space-y-1">
            <p>• Check your spelling</p>
            <p>• Try searching with contract address</p>
            <p>• Make sure you're on the correct network</p>
          </div>

          {/* Actions */}
          <div className="flex flex-col space-y-2 w-full">
            {showImport && onImportToken && (
              <Button
                onClick={onImportToken}
                variant="primary"
                size="sm"
                className="w-full bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700"
              >
                <Plus className="w-4 h-4 mr-2" />
                Import Custom Token
              </Button>
            )}
            
            {onClearSearch && (
              <Button
                onClick={onClearSearch}
                variant="secondary"
                size="sm"
                className="w-full text-gray-400 hover:text-white border-gray-700 hover:border-gray-600"
              >
                Show All Tokens
              </Button>
            )}

            <a
              href="https://basescan.org"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center space-x-2 text-xs text-gray-500 hover:text-gray-400 transition-colors"
            >
              <ExternalLink className="w-3 h-3" />
              <span>View on Block Explorer</span>
            </a>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TokenNotFoundCard; 