import React, { useEffect, useState } from 'react';
import { CheckCircle2, MapPin, Search, Star, UserPlus } from 'lucide-react';
import { UserAvatar } from '../ui/UserAvatar';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Booking } from '../../types';
import { InterpreterService } from '../../services/api';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';
import { assignInterpreterAction, createDependencies } from '../../ui/actions';
import { LocationService } from '../../services/locationService';
import { InterpreterMatchResult, rankInterpreterForBooking } from '../../domains/interpreters/matchingEngine';
import { SystemService } from '../../services/systemService';

interface InterpreterAllocationDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  job: Booking | null;
  onSuccess: () => void;
}

const formatJobRef = (job: Booking) => job.displayRef || job.jobNumber || job.bookingRef || job.legacyAirtableRef || job.id.slice(0, 8).toUpperCase();

const formatDate = (value?: string) => {
  if (!value) return 'No date';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? value
    : parsed.toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short' });
};

export const InterpreterAllocationDrawer: React.FC<InterpreterAllocationDrawerProps> = ({
  isOpen,
  onClose,
  job,
  onSuccess,
}) => {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [matches, setMatches] = useState<InterpreterMatchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [distances, setDistances] = useState<Record<string, { distance: number; duration: number }>>({});
  const [isCalculatingDistances, setIsCalculatingDistances] = useState(false);
  const [communicationMode, setCommunicationMode] = useState('SUPPRESSED');

  const actionsDeps = createDependencies((user as any)?.organizationId || 'lingland-main');

  useEffect(() => {
    if (isOpen && job) {
      loadInterpreters();
      SystemService.getPlatformMode()
        .then(mode => setCommunicationMode(mode.communicationMode || 'SUPPRESSED'))
        .catch(() => setCommunicationMode('SUPPRESSED'));
    }
  }, [isOpen, job]);

  const loadInterpreters = async () => {
    if (!job) return;
    setIsLoading(true);
    try {
      const allInterpreters = await InterpreterService.getAll();
      const ranked = allInterpreters
        .map(interpreter => rankInterpreterForBooking(interpreter, job))
        .filter(result => result.score > 0)
        .sort((a, b) => b.score - a.score);
      setMatches(ranked);
    } catch (error) {
      console.error('Failed to load interpreters', error);
      showToast('Failed to load interpreters', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (matches.length > 0 && job?.lat && job?.lng) {
      calculateAllDistances();
    }
  }, [matches, job]);

  const calculateAllDistances = async () => {
    if (!job?.lat || !job?.lng) return;

    setIsCalculatingDistances(true);
    try {
      const interpretersWithCoords = matches
        .filter(match => match.interpreter.address?.lat && match.interpreter.address?.lng)
        .map(match => ({
          id: match.interpreter.id,
          lat: match.interpreter.address!.lat!,
          lng: match.interpreter.address!.lng!,
        }));

      if (interpretersWithCoords.length > 0) {
        const matrix = await LocationService.calculateMatrix(
          interpretersWithCoords,
          { lat: job.lat, lng: job.lng },
        );
        setDistances(matrix);
      }
    } catch (error) {
      console.error('Failed to calculate distances', error);
    } finally {
      setIsCalculatingDistances(false);
    }
  };

  const handleSendOffer = async (interpreterId: string, interpreterName: string) => {
    if (!job) return;
    setProcessingId(interpreterId);
    try {
      await assignInterpreterAction(job.id, interpreterId, actionsDeps);
      showToast(`Direct offer sent to ${interpreterName}`, 'success');
      onSuccess();
      onClose();
    } catch (error: any) {
      showToast(error?.message || 'Failed to send direct offer', 'error');
    } finally {
      setProcessingId(null);
    }
  };

  const filteredMatches = matches.filter(match =>
    match.interpreter.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      type="drawer"
      title="Interpreter Allocation"
      maxWidth="3xl"
    >
      {job && (
        <div className="space-y-5 animate-in fade-in slide-in-from-right-4 duration-300">
          <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Target job</p>
                <h4 className="mt-1 text-lg font-black text-slate-950 dark:text-white">{formatJobRef(job)}</h4>
                <p className="mt-1 text-sm font-semibold text-slate-600 dark:text-slate-300">
                  {job.languageFrom} to {job.languageTo}
                </p>
              </div>
              <div className="text-left sm:text-right">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Schedule</p>
                <p className="mt-1 text-sm font-black text-slate-950 dark:text-white">{formatDate(job.date)}</p>
                <p className="text-sm font-semibold text-blue-600">{job.startTime || 'TBC'}</p>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-1 gap-2 border-t border-slate-100 pt-4 text-xs font-semibold text-slate-500 dark:border-slate-800 sm:grid-cols-2">
              <span className="flex items-center gap-2">
                <MapPin size={14} className="text-blue-500" />
                {job.locationType === 'ONLINE' ? 'Remote / online' : job.location || job.address || 'Onsite'}
              </span>
              <span className="flex items-center gap-2">
                <Star size={14} className="text-amber-500" />
                {job.serviceType || job.serviceCategory || 'Service'}
              </span>
            </div>
          </div>

          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
            Sending a direct offer moves the job to assignment pending. Communication mode is <span className="font-black">{communicationMode}</span>, so external email delivery follows the platform guardrails. Staff can later record acceptance or decline manually from Assignment Center.
          </div>

          <div className="rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
            <div className="flex flex-col gap-3 border-b border-slate-200 p-3 dark:border-slate-800 sm:flex-row sm:items-center sm:justify-between">
              <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400">Ranked suggestions</h4>
              <div className="flex items-center gap-2">
                <div className="relative">
                  <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search interpreter..."
                    className="h-9 rounded-md border border-slate-200 bg-white pl-9 pr-3 text-xs font-semibold outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100 dark:focus:ring-blue-500/20"
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                  />
                </div>
              </div>
            </div>

            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {isLoading ? (
                <div className="space-y-2 p-4">
                  {[1, 2, 3].map(item => <div key={item} className="h-20 animate-pulse rounded-lg bg-slate-50 dark:bg-slate-800/50" />)}
                </div>
              ) : filteredMatches.length === 0 ? (
                <div className="px-4 py-12 text-center">
                  <p className="text-sm font-semibold text-slate-400">No matching interpreters found for this path.</p>
                </div>
              ) : (
                filteredMatches.map((match, index) => {
                  const interpreter = match.interpreter;
                  return (
                    <div key={interpreter.id} className="flex flex-col gap-4 p-4 hover:bg-slate-50 dark:hover:bg-slate-800/60 lg:flex-row lg:items-center lg:justify-between">
                      <div className="flex min-w-0 items-start gap-3">
                        <div className="relative shrink-0">
                          <UserAvatar src={interpreter.photoUrl} name={interpreter.name} size="md" className="rounded-xl" />
                          {index === 0 && !searchQuery && (
                            <div className="absolute -right-1 -top-1 rounded-full border-2 border-white bg-amber-500 p-0.5 text-white shadow-sm dark:border-slate-900">
                              <Star size={10} fill="currentColor" />
                            </div>
                          )}
                        </div>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="truncate text-sm font-black text-slate-900 dark:text-white">{interpreter.name}</p>
                            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[9px] font-black uppercase text-slate-500 dark:bg-slate-800">Rank #{index + 1}</span>
                            <span className="rounded bg-blue-50 px-1.5 py-0.5 text-[9px] font-black uppercase text-blue-700 dark:bg-blue-500/10 dark:text-blue-300">{match.score}% match</span>
                          </div>
                          <div className="mt-1.5 flex flex-wrap items-center gap-3 text-[10px] font-semibold text-slate-500">
                            {distances[interpreter.id] && (
                              <span className="flex items-center gap-1 text-blue-600">
                                <MapPin size={10} />
                                {distances[interpreter.id].distance.toFixed(1)} miles
                              </span>
                            )}
                            {isCalculatingDistances && !distances[interpreter.id] && <span>Calculating distance...</span>}
                            <span className="flex items-center gap-1">
                              <CheckCircle2 size={10} className={match.warnings.some(warning => warning.includes('DBS')) ? 'text-amber-500' : 'text-green-500'} />
                              {match.reasons.find(reason => reason.includes('DBS')) || match.warnings.find(warning => warning.includes('DBS')) || 'Checks pending'}
                            </span>
                          </div>
                          <div className="mt-2 flex flex-wrap gap-1">
                            {match.reasons.slice(0, 3).map(reason => (
                              <span key={reason} className="rounded-md bg-emerald-50 px-1.5 py-0.5 text-[9px] font-bold text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">{reason}</span>
                            ))}
                            {match.warnings.slice(0, 2).map(warning => (
                              <span key={warning} className="rounded-md bg-amber-50 px-1.5 py-0.5 text-[9px] font-bold text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">{warning}</span>
                            ))}
                          </div>
                        </div>
                      </div>
                      <Button
                        size="sm"
                        icon={UserPlus}
                        isLoading={processingId === interpreter.id}
                        onClick={() => handleSendOffer(interpreter.id, interpreter.name)}
                        className="shrink-0"
                      >
                        Send direct offer
                      </Button>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
};
