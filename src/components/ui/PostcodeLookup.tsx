import React, { useState } from 'react';
import { Search, MapPin, Loader2, ChevronDown } from 'lucide-react';
import { AddressService, UkAddress } from '../../services/addressService';
import { Button } from './Button';

interface PostcodeLookupProps {
  onAddressSelected: (address: UkAddress) => void;
  className?: string;
}

export const PostcodeLookup: React.FC<PostcodeLookupProps> = ({ onAddressSelected, className }) => {
  const [postcode, setPostcode] = useState('');
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<{ text: string; placeId: string }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  // Debounced suggestion fetch
  React.useEffect(() => {
    const timer = setTimeout(async () => {
      if (postcode.trim().length >= 3) {
        setLoading(true);
        const results = await AddressService.findSuggestions(postcode);
        setSuggestions(results);
        setIsOpen(results.length > 0);
        setLoading(false);
      } else {
        setSuggestions([]);
        setIsOpen(false);
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [postcode]);

  const handleLookup = async () => {
    if (!postcode.trim()) return;
    
    setLoading(true);
    setError(null);
    
    try {
      // If the user clicks the button, we take the first suggestion or perform a direct search
      const results = await AddressService.findSuggestions(postcode);
      if (results.length === 0) {
        setError('No addresses found for this query.');
      } else if (results.length === 1) {
        handleSelect(results[0].placeId);
      } else {
        setSuggestions(results);
        setIsOpen(true);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to lookup address');
    } finally {
      setLoading(false);
    }
  };

  const handleSelect = async (placeId: string) => {
    setLoading(true);
    try {
      const details = await AddressService.getPlaceDetails(placeId);
      onAddressSelected(details);
      setIsOpen(false);
      setSuggestions([]);
      setPostcode('');
    } catch (err: any) {
      setError('Could not fetch address details');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={`space-y-3 relative ${className || ''}`}>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input 
            type="text"
            id="postcodeLookup"
            name="postcodeLookup"
            aria-label="Search address by postcode"
            placeholder="e.g. 10 SW1A 1AA"
            autoComplete="postal-code"
            className="w-full pl-12 pr-4 py-4 bg-slate-50 dark:bg-slate-800 border-none rounded-2xl outline-none focus:ring-2 ring-blue-500/20 uppercase font-medium"
            value={postcode}
            onChange={(e) => setPostcode(e.target.value.toUpperCase())}
            onKeyDown={(e) => e.key === 'Enter' && handleLookup()}
          />
        </div>
        <Button 
          type="button"
          onClick={handleLookup}
          isLoading={loading}
          disabled={!postcode.trim()}
          className="rounded-2xl px-6"
        >
          {loading ? '...' : 'Find Address'}
        </Button>
      </div>
      <p className="mt-2 text-[10px] text-slate-400 font-bold uppercase tracking-wider flex items-center gap-1.5 ml-1 animate-in fade-in slide-in-from-top-1 duration-500">
        <span className="w-1 h-1 shrink-0 rounded-full bg-blue-500" aria-hidden="true" />
        Tip: Include house number for exact matches (e.g. "10 SW1A 1AA")
      </p>

      {error && (
        <p className="text-sm text-red-500 font-medium px-2">{error}</p>
      )}

      {isOpen && suggestions.length > 0 && (
        <div className="absolute z-50 left-0 right-0 top-full mt-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl max-h-60 overflow-y-auto animate-in fade-in zoom-in duration-200">
          <div className="p-2">
            {suggestions.map((sug, index) => (
              <button
                key={index}
                type="button"
                className="w-full text-left px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-xl transition-colors flex items-center gap-3 group"
                onClick={() => handleSelect(sug.placeId)}
              >
                <div className="w-8 h-8 rounded-lg bg-slate-50 dark:bg-slate-800 flex items-center justify-center text-slate-400 group-hover:bg-blue-50 group-hover:text-blue-600 transition-colors">
                  <MapPin size={14} />
                </div>
                <div>
                  <div className="text-sm font-bold text-slate-900 dark:text-white">
                    {sug.text}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
