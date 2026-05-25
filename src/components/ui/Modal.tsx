import React, { useEffect, useRef } from 'react';
import { X, ChevronLeft, ChevronRight, AlertTriangle } from 'lucide-react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  type?: 'modal' | 'drawer' | 'wizard';
  children: React.ReactNode;
  footer?: React.ReactNode;
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl' | '4xl';
  // Wizard specific
  steps?: { title: string; active: boolean }[];
  onNext?: () => void;
  onBack?: () => void;
  nextLabel?: string;
  backLabel?: string;
  isLoading?: boolean;
  // Phase 2: UX-RULES policies
  /** If true, shows a "Unsaved changes" warning dialog before closing */
  unsavedChanges?: boolean;
  /** If provided, called automatically after successful submission (closes modal) */
  onSuccess?: () => void;
}

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  type = 'modal',
  children,
  footer,
  maxWidth = 'md',
  steps,
  onNext,
  onBack,
  nextLabel = 'Next',
  backLabel = 'Back',
  isLoading,
  unsavedChanges = false,
  onSuccess,
}) => {
  const [showUnsavedWarning, setShowUnsavedWarning] = React.useState(false);

  const handleClose = () => {
    if (unsavedChanges) {
      setShowUnsavedWarning(true);
    } else {
      onClose();
    }
  };

  const confirmClose = () => {
    setShowUnsavedWarning(false);
    onClose();
  };

  // Handle ESC key
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) handleClose();
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [isOpen, onClose, unsavedChanges]);

  // Lock scroll for modal/wizard, but not for drawer
  useEffect(() => {
    if (isOpen && type !== 'drawer') {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, type]);

  if (!isOpen) return null;

  const maxWidthClasses = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-xl',
    '2xl': 'max-w-2xl',
    '3xl': 'max-w-3xl',
    '4xl': 'max-w-4xl',
  };

  // Unsaved Changes Warning Dialog (overlays the modal)
  const UnsavedWarning = () => (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center">
      <div className="absolute inset-0 bg-slate-950/60" />
      <div className="relative mx-4 w-full max-w-sm rounded-lg border border-slate-200 bg-white p-5 shadow-2xl dark:border-slate-800 dark:bg-slate-900 animate-in zoom-in-95 duration-150">
        <div className="flex items-center gap-3 mb-4">
          <div className="rounded-md bg-amber-50 p-2 dark:bg-amber-500/10">
            <AlertTriangle size={20} className="text-amber-600" />
          </div>
          <h4 className="text-base font-bold text-slate-900 dark:text-white">Unsaved Changes</h4>
        </div>
        <p className="text-sm text-slate-600 dark:text-slate-400 mb-6">
          You have unsaved changes. Are you sure you want to close without saving?
        </p>
        <div className="flex justify-end gap-3">
          <button
            onClick={() => setShowUnsavedWarning(false)}
            className="rounded-md px-4 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            Keep Editing
          </button>
          <button
            onClick={confirmClose}
            className="rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-700"
          >
            Discard Changes
          </button>
        </div>
      </div>
    </div>
  );

  if (type === 'drawer') {
    return (
      <>
        {showUnsavedWarning && <UnsavedWarning />}
        <div className="fixed inset-0 z-50 pointer-events-none">
          <div
            className="absolute inset-0 bg-slate-950/30 backdrop-blur-[2px] pointer-events-auto"
            onClick={handleClose}
          />
          <div
            className="pointer-events-auto absolute right-0 top-0 flex h-full w-full flex-col border-l border-slate-200 bg-white shadow-2xl transition-transform duration-300 dark:border-slate-800 dark:bg-slate-900 sm:w-[520px] xl:w-[680px]"
          >
            {/* Drawer Header */}
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-900 sm:px-5">
              <div>
                <h3 className="text-base font-semibold tracking-normal text-slate-950 dark:text-white">{title}</h3>
              </div>
              <button onClick={handleClose} className="rounded-md p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-slate-800 dark:hover:text-slate-100" aria-label="Close">
                <X size={20} />
              </button>
            </div>

            {/* Drawer Content */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-5">
              {children}
            </div>

            {/* Drawer Footer */}
            {footer && (
              <div className="border-t border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-950/60 sm:px-5">
                {footer}
              </div>
            )}
          </div>
        </div>
      </>
    );
  }

  if (type === 'wizard') {
    return (
      <>
        {showUnsavedWarning && <UnsavedWarning />}
        <div className="fixed inset-0 z-50 flex items-center justify-center p-0">
          <div className="absolute inset-0 bg-slate-950/50 backdrop-blur-sm" onClick={handleClose} />
          <div className="relative w-full h-full bg-slate-50 dark:bg-slate-950 flex flex-col overflow-hidden animate-in fade-in zoom-in duration-200">
            {/* Wizard Header */}
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-900 sm:px-8 sm:py-4">
              <div className="flex min-w-0 items-center space-x-4 sm:space-x-6">
                <h3 className="truncate text-lg font-semibold text-slate-950 dark:text-white sm:text-xl">{title}</h3>
                {steps && (
                  <div className="hidden items-center space-x-2 md:flex">
                    {steps.map((step, i) => (
                      <React.Fragment key={i}>
                        <div className={`flex items-center space-x-2 ${step.active ? 'opacity-100' : 'opacity-40'}`}>
                          <span className={`flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold ${step.active ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-500 dark:bg-slate-800'}`}>
                            {i + 1}
                          </span>
                          <span className="text-xs font-bold uppercase tracking-wider hidden sm:inline">{step.title}</span>
                        </div>
                        {i < steps.length - 1 && <div className="w-4 h-[1px] bg-slate-200 dark:bg-slate-800" />}
                      </React.Fragment>
                    ))}
                  </div>
                )}
              </div>
              <button onClick={handleClose} className="rounded-md p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-slate-800 dark:hover:text-slate-100" aria-label="Close">
                <X size={24} />
              </button>
            </div>

            {/* Wizard Content */}
            <div className="flex flex-1 justify-center overflow-y-auto p-4 sm:p-8">
              <div className="w-full max-w-4xl animate-fade-in">
                {children}
              </div>
            </div>

            {/* Wizard Footer */}
            <div className="sticky bottom-0 z-10 flex items-center justify-between border-t border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-900 sm:px-8 sm:py-4">
              <button
                onClick={onBack}
                disabled={!onBack || isLoading}
                className="flex items-center px-4 py-2 text-sm font-bold text-slate-500 hover:text-slate-900 dark:hover:text-white disabled:opacity-30 transition-colors"
              >
                <ChevronLeft size={18} className="mr-1" />
                {backLabel}
              </button>
              <div className="flex items-center space-x-4">
                <button
                  onClick={handleClose}
                  className="px-6 py-2 text-sm font-bold text-slate-500 hover:text-slate-900 dark:hover:text-white"
                >
                  Cancel
                </button>
                <button
                  onClick={onNext}
                  disabled={!onNext || isLoading}
                  className="flex items-center rounded-md bg-blue-600 px-5 py-2.5 font-semibold text-white transition-colors hover:bg-blue-700 disabled:opacity-50 sm:px-8"
                >
                  {isLoading ? 'Processing...' : nextLabel}
                  {!isLoading && <ChevronRight size={18} className="ml-2" />}
                </button>
              </div>
            </div>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      {showUnsavedWarning && <UnsavedWarning />}
      <div className="fixed inset-0 z-50 overflow-y-auto">
        <div className="flex min-h-dvh items-end justify-center px-3 pb-0 pt-6 text-center sm:items-center sm:p-6">
          <div
            className="fixed inset-0 transition-opacity bg-slate-950/60 backdrop-blur-sm"
            onClick={handleClose}
            aria-hidden="true"
          />
          <div
            className={`relative flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-lg border border-slate-200 bg-white text-left shadow-2xl transition-all dark:border-slate-800 dark:bg-slate-900 sm:rounded-lg ${maxWidthClasses[maxWidth]} animate-in zoom-in-95 duration-200`}
          >
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-800 sm:px-5">
                <h3 className="min-w-0 truncate pr-4 text-lg font-semibold text-slate-950 dark:text-white">
                  {title}
                </h3>
                <button
                  onClick={handleClose}
                  className="rounded-md p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-slate-800 dark:hover:text-slate-100"
                  aria-label="Close"
                >
                  <X size={20} />
                </button>
            </div>
            <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-5">
              <div className="text-slate-600 dark:text-slate-300">
                {children}
              </div>
            </div>

            {footer && (
              <div className="border-t border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-950/60 sm:flex sm:flex-row-reverse sm:gap-3 sm:px-5">
                {footer}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
};
