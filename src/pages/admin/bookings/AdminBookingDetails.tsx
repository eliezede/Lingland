import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  ChevronLeft, Clock, MapPin, Globe, Phone, Mail, Building, 
  User, CreditCard, Receipt, FileText, AlertCircle, CheckCircle2,
  Calendar, Info, ArrowUpRight, ShieldCheck, History, MoreVertical,
  Edit2, Trash2, Send, Download, MessageSquare, Briefcase, Languages
} from 'lucide-react';
import { BookingService } from '../../../services/bookingService';
import { BillingService } from '../../../services/billingService';
import { UserAvatar } from '../../../components/ui/UserAvatar';
import { ApplicationService } from '../../../services/applicationService';
import { PdfService } from '../../../services/pdfService';
import { ChatService } from '../../../services/chatService';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import { Spinner } from '../../../components/ui/Spinner';
import { Modal } from '../../../components/ui/Modal';
import { StatusBadge } from '../../../components/StatusBadge';
import { useToast } from '../../../context/ToastContext';
import { useConfirm } from '../../../context/ConfirmContext';
import { useAuth } from '../../../context/AuthContext';
import { useChat } from '../../../context/ChatContext';
import { useClients } from '../../../context/ClientContext';
import { ActivityTimeline } from '../../../components/operations/ActivityTimeline';
import { InterpreterAllocationDrawer } from '../../../components/operations/InterpreterAllocationDrawer';
import { InterpreterPreviewDrawer } from '../../../components/operations/InterpreterPreviewDrawer';
import { LocationMap } from '../../../components/ui/LocationMap';

export const AdminBookingDetails = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { confirm } = useConfirm();
  const { user } = useAuth();
  const { openThread } = useChat();
  const { clientsMap, getClientCompany } = useClients();

  const [booking, setBooking] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [isAllocationDrawerOpen, setIsAllocationDrawerOpen] = useState(false);
  const [selectedInterpreterId, setSelectedInterpreterId] = useState<string | null>(null);
  const [isInterpreterPreviewOpen, setIsInterpreterPreviewOpen] = useState(false);
  const [isActionLoading, setIsActionLoading] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  useEffect(() => {
    if (id) {
      loadBooking();
    }
  }, [id]);

  const loadBooking = async () => {
    try {
      if (!id) return;
      const data = await BookingService.getById(id);
      setBooking(data);
    } catch (error) {
      showToast('Failed to load booking details', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleStatusChange = async (newStatus: string) => {
    if (!booking || !id) return;
    
    const ok = await confirm({
      title: 'Change Booking Status',
      message: `Are you sure you want to change the status from ${booking.status} to ${newStatus}?`,
      confirmLabel: 'Update Status',
      variant: 'primary'
    });

    if (!ok) return;

    setIsActionLoading(true);
    try {
      await BookingService.update(id, { status: newStatus as any });
      showToast(`Booking status updated to ${newStatus}`, 'success');
      loadBooking();
    } catch (error) {
      showToast('Failed to update status', 'error');
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleExportPdf = async () => {
    if (!booking) return;
    setIsExporting(true);
    try {
      PdfService.generateBookingSummary(booking);
      showToast('Booking summary exported successfully', 'success');
    } catch (error) {
      showToast('Failed to export PDF', 'error');
    } finally {
      setIsExporting(false);
    }
  };

  const handleOpenChat = () => {
    if (booking?.interpreterId) {
      openThread(booking.interpreterId);
    } else {
      showToast('No interpreter assigned to chat with', 'info');
    }
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-slate-50 dark:bg-slate-950">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!booking) {
    return (
      <div className="flex-1 p-8 bg-slate-50 dark:bg-slate-950">
        <div className="max-w-4xl mx-auto bg-white dark:bg-slate-900 rounded-3xl p-12 text-center border border-slate-200 dark:border-slate-800 shadow-xl transition-colors">
          <div className="w-20 h-20 bg-slate-100 dark:bg-slate-800 rounded-3xl flex items-center justify-center mx-auto mb-6">
            <AlertCircle size={40} className="text-slate-400 dark:text-slate-500" />
          </div>
          <h2 className="text-2xl font-black text-slate-900 dark:text-white mb-2 uppercase tracking-tighter">Booking Not Found</h2>
          <p className="text-slate-500 dark:text-slate-400 mb-8 font-medium">The booking you are looking for doesn't exist or has been removed.</p>
          <Button onClick={() => navigate('/admin/bookings')} icon={ChevronLeft} variant="secondary">
            Go Back
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full bg-slate-50 dark:bg-slate-950 transition-colors">
      {/* Premium Header Bar */}
      <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 p-4 lg:p-6 transition-colors">
        <div className="max-w-7xl mx-auto flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6">
          <div className="flex items-center gap-4">
            <button 
              onClick={() => navigate('/admin/bookings')}
              className="p-3 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-2xl transition-all group"
            >
              <ChevronLeft size={24} className="text-slate-400 dark:text-slate-500 group-hover:text-slate-900 dark:group-hover:text-white" />
            </button>
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tighter uppercase">
                  {booking.reference || 'Booking Detail'}
                </h1>
                <StatusBadge status={booking.status} />
              </div>
              <div className="flex items-center gap-4 mt-1">
                <div className="flex items-center gap-1.5 text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-tighter">
                  <Clock size={14} />
                  Created {new Date(booking.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                </div>
                <div className="flex items-center gap-1.5 text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-tighter border-l border-slate-200 dark:border-slate-800 pl-4 transition-colors">
                  <ShieldCheck size={14} />
                  Admin Managed
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 w-full lg:w-auto">
            <Button 
              variant="ghost" 
              icon={Download} 
              onClick={handleExportPdf}
              isLoading={isExporting}
              className="flex-1 lg:flex-none h-11 border-slate-200 dark:border-slate-800 dark:text-slate-400"
            >
              Export PDF
            </Button>
            <Button 
              variant="secondary" 
              icon={Edit2}
              onClick={() => navigate(`/admin/bookings/edit/${id}`)}
              className="flex-1 lg:flex-none h-11 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-white border-none"
            >
              Edit Booking
            </Button>
            <div className="relative group">
              <Button 
                variant="primary" 
                icon={MoreVertical}
                className="h-11 shadow-lg shadow-blue-500/20"
              />
              <div className="absolute right-0 top-full mt-2 w-48 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xl opacity-0 translate-y-2 pointer-events-none group-hover:opacity-100 group-hover:translate-y-0 group-hover:pointer-events-auto transition-all z-50 overflow-hidden">
                <button 
                  onClick={() => handleStatusChange('CANCELLED')}
                  className="w-full px-4 py-3 text-left text-xs font-bold text-red-600 dark:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20 transition-colors flex items-center gap-2"
                >
                  <Trash2 size={14} />
                  Cancel Booking
                </button>
                <div className="h-px bg-slate-100 dark:bg-slate-800" />
                <button 
                  onClick={() => handleStatusChange('TIMESHEET_SUBMITTED')}
                  className="w-full px-4 py-3 text-left text-xs font-bold text-emerald-600 dark:text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-950/20 transition-colors flex items-center gap-2"
                >
                  <CheckCircle2 size={14} />
                  Mark as Done
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 lg:p-8 scrollbar-hide">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-8">
            
            {/* Left Column: Main Info */}
            <div className="xl:col-span-8 space-y-8">
              
              {/* Session & Location Dashboard */}
              <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden transition-colors">
                <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-xl transition-colors">
                      <Clock size={20} />
                    </div>
                    <h2 className="text-lg font-black text-slate-900 dark:text-white uppercase tracking-tighter">Session & Location</h2>
                  </div>
                </div>
                <div className="p-8 grid grid-cols-1 md:grid-cols-2 gap-12">
                   <div className="space-y-6">
                      <div className="group">
                        <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2 group-hover:text-blue-600 transition-colors">Date & Schedule</p>
                        <div className="flex items-start gap-3">
                          <div className="w-10 h-10 bg-slate-50 dark:bg-slate-950 rounded-xl flex items-center justify-center text-slate-400 dark:text-slate-500 border border-slate-100 dark:border-slate-800 shrink-0 transition-colors">
                            <Calendar size={20} />
                          </div>
                          <div>
                            <p className="text-lg font-black text-slate-900 dark:text-white leading-none">
                              {new Date(booking.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
                            </p>
                            <p className="text-sm font-bold text-blue-600 dark:text-blue-400 mt-1 uppercase">
                              {booking.startTime} - {booking.endTime} 
                              <span className="text-slate-400 dark:text-slate-500 ml-2 font-black italic">({Math.round(((new Date(`2000-01-01 ${booking.endTime}`).getTime() - new Date(`2000-01-01 ${booking.startTime}`).getTime()) / 60000))} Mins)</span>
                            </p>
                          </div>
                        </div>
                      </div>

                      <div className="group">
                        <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2 group-hover:text-amber-600 transition-colors">Linguistic Requirements</p>
                        <div className="flex items-start gap-3">
                          <div className="w-10 h-10 bg-slate-50 dark:bg-slate-950 rounded-xl flex items-center justify-center text-slate-400 dark:text-slate-500 border border-slate-100 dark:border-slate-800 shrink-0 transition-colors">
                            <Languages size={20} />
                          </div>
                          <div className="flex flex-wrap gap-2 text-xs">
                             <div className="px-3 py-1.5 bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-400 rounded-lg font-black border border-blue-200 dark:border-blue-800/50 uppercase transition-colors">
                               {booking.languageFrom || 'English'}
                             </div>
                             <div className="w-6 flex items-center justify-center font-black text-slate-300 dark:text-slate-700">TO</div>
                             <div className="px-3 py-1.5 bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400 rounded-lg font-black border border-emerald-200 dark:border-emerald-800/50 uppercase transition-colors">
                               {booking.languageTo}
                             </div>
                          </div>
                        </div>
                        {booking.serviceType && (
                          <div className="mt-3 inline-flex items-center gap-2 px-3 py-1 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 rounded-full text-[10px] font-black uppercase transition-colors">
                             <Briefcase size={12} /> {booking.serviceType}
                          </div>
                        )}
                      </div>
                   </div>

                   <div className="group">
                      <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2 group-hover:text-emerald-600 transition-colors">Deployment Venue</p>
                      <div className="flex items-start gap-3">
                        <div className="w-10 h-10 bg-slate-50 dark:bg-slate-950 rounded-xl flex items-center justify-center text-slate-400 dark:text-slate-500 border border-slate-100 dark:border-slate-800 shrink-0 transition-colors">
                          <MapPin size={20} />
                        </div>
                        <div className="flex-1">
                          <p className="text-sm font-bold text-slate-900 dark:text-white leading-relaxed">
                            {booking.address}, {booking.postcode}
                          </p>
                          <div className="mt-3 flex items-center gap-2">
                             <button className="text-[10px] font-black text-blue-600 dark:text-blue-400 uppercase tracking-tighter hover:underline flex items-center gap-1">
                               View on Map <ArrowUpRight size={12} />
                             </button>
                             {booking.location?.meetingLink && (
                               <a href={booking.location.meetingLink} target="_blank" rel="noreferrer" className="text-[10px] font-black text-emerald-600 dark:text-emerald-500 uppercase tracking-tighter hover:underline flex items-center gap-1 pl-3 border-l border-slate-200 dark:border-slate-800 transition-colors">
                                 Join Meeting <Globe size={12} />
                               </a>
                             )}
                          </div>
                        </div>
                      </div>
                      
                      {booking.lat && booking.lng && (
                        <div className="mt-6">
                           <LocationMap 
                             center={{ lat: booking.lat, lng: booking.lng }} 
                             zoom={12}
                             height="250px"
                             markers={[
                               { lat: booking.lat, lng: booking.lng, label: 'Job Location', color: '#ef4444' },
                               ...(booking.interpreterId ? [{ 
                                 lat: booking.lat + 0.01, // Mocking proximity for demo if interp doesn't have real coords yet
                                 lng: booking.lng + 0.01, 
                                 label: booking.interpreterName || 'Interpreter',
                                 color: '#3b82f6' 
                               }] : [])
                             ]}
                           />
                        </div>
                      )}
                      
                      {booking.notes && (
                         <div className="mt-8 p-4 bg-slate-50 dark:bg-slate-950 rounded-2xl border-l-4 border-blue-500 shadow-sm transition-colors">
                            <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1">Instructional Notes</p>
                            <p className="text-xs font-bold text-slate-600 dark:text-slate-400 italic leading-relaxed">"{booking.notes}"</p>
                         </div>
                      )}
                   </div>
                </div>
              </div>

              {/* Contact & Organisation Matrix */}
              <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden transition-colors">
                <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 rounded-xl transition-colors">
                      <Building size={20} />
                    </div>
                    <h2 className="text-lg font-black text-slate-900 dark:text-white uppercase tracking-tighter">Contact & Organisation</h2>
                  </div>
                </div>
                <div className="p-8 grid grid-cols-2 md:grid-cols-3 gap-8">
                  <div className="group">
                    <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1.5 transition-colors group-hover:text-blue-600">Primary Contact</p>
                    <p className="text-sm font-black text-slate-900 dark:text-white">{booking.contactName || 'N/A'}</p>
                    <div className="mt-2 space-y-1">
                      <p className="text-xs font-bold text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                        <Mail size={12} className="text-slate-400 dark:text-slate-500" /> {booking.contactEmail || 'N/A'}
                      </p>
                      <p className="text-xs font-bold text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                        <Phone size={12} className="text-slate-400 dark:text-slate-500" /> {booking.contactPhone || 'N/A'}
                      </p>
                    </div>
                  </div>

                  <div className="group">
                    <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1.5 transition-colors group-hover:text-blue-600">Reporting Client</p>
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-slate-900 dark:bg-white dark:text-slate-950 text-white rounded-xl flex items-center justify-center text-xs font-black transition-colors">
                        {booking.clientName?.substring(0,2).toUpperCase() || 'LL'}
                      </div>
                      <div>
                        <p className="text-sm font-black text-slate-900 dark:text-white">{booking.clientName || 'Private Client'}</p>
                        <p className="text-[10px] font-black text-blue-600 dark:text-blue-400 uppercase leading-none mt-1">LID: {booking.clientId?.substring(0,8) || 'MAIN'}</p>
                      </div>
                    </div>
                  </div>

                  <div className="group">
                    <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1.5 transition-colors group-hover:text-amber-600">Liaison Account</p>
                    <div className="flex items-center gap-3">
                       <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-xl flex items-center justify-center text-xs font-black transition-colors">
                         <User size={18} />
                       </div>
                       <div>
                         <p className="text-xs font-black text-slate-900 dark:text-white">Admin Desk 01</p>
                         <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500">System Generated</p>
                       </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Assignment Deep Dive */}
              <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden transition-colors">
                <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 rounded-xl transition-colors">
                      <ShieldCheck size={20} />
                    </div>
                    <h2 className="text-lg font-black text-slate-900 dark:text-white uppercase tracking-tighter">Assignment Logic</h2>
                  </div>
                  {!booking.interpreterId && (
                    <Button 
                      size="sm" 
                      variant="primary" 
                      onClick={() => setIsAllocationDrawerOpen(true)}
                      icon={ArrowUpRight}
                      className="h-9 px-4 rounded-xl text-[10px]"
                    >
                      Allocate Resource
                    </Button>
                  )}
                </div>
                
                <div className="p-8">
                  {booking.interpreterId ? (
                    <div className="flex flex-col md:flex-row items-center justify-between p-6 bg-slate-50 dark:bg-slate-950 rounded-3xl border border-slate-100 dark:border-slate-800 transition-colors gap-6">
                      <div className="flex items-center gap-4">
                        <UserAvatar 
                          name={booking.interpreterName || ''} 
                          src={booking.interpreterPhotoUrl} 
                          size="xl" 
                          className="rounded-2xl shadow-lg shadow-blue-500/20"
                        />
                        <div>
                           <div className="flex items-center gap-2">
                             <h4 className="text-lg font-black text-slate-900 dark:text-white leading-tight uppercase hover:text-blue-600 cursor-pointer transition-colors" onClick={() => {
                               setSelectedInterpreterId(booking.interpreterId);
                               setIsInterpreterPreviewOpen(true);
                             }}>
                               {booking.interpreterName}
                             </h4>
                             <Badge variant="success" className="h-5 px-2 text-[8px] font-black uppercase shadow-none border-none">Active</Badge>
                           </div>
                           <p className="text-xs font-bold text-slate-400 dark:text-slate-500 mt-1">Allocated ID: <span className="text-slate-900 dark:text-slate-300">INT-{booking.interpreterId.substring(0, 8)}</span></p>
                           <div className="flex items-center gap-3 mt-3">
                             <button 
                               onClick={() => openThread(booking.interpreterId)}
                               className="text-[10px] font-black text-blue-600 dark:text-blue-400 uppercase tracking-widest flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 dark:bg-blue-900/40 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-800/50 transition-all"
                             >
                               <MessageSquare size={12} /> Live Chat
                             </button>
                             <button 
                               onClick={() => {
                                 setSelectedInterpreterId(booking.interpreterId);
                                 setIsInterpreterPreviewOpen(true);
                               }}
                               className="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 dark:bg-slate-800 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 transition-all"
                             >
                               <User size={12} /> Profile Matrix
                             </button>
                           </div>
                        </div>
                      </div>
                      
                      <div className="flex flex-col items-center md:items-end gap-3 w-full md:w-auto pt-6 md:pt-0 border-t md:border-t-0 border-slate-100 dark:border-slate-800 transition-colors">
                         <div className="text-center md:text-right">
                           <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest leading-none">Resource Rate</p>
                           <p className="text-xl font-black text-slate-900 dark:text-white mt-1">£{booking.interpreterRate || '45.00'}<span className="text-xs text-slate-400 dark:text-slate-500 font-bold">/hr</span></p>
                         </div>
                         <Button 
                           size="sm" 
                           variant="ghost" 
                           onClick={() => {
                             setSelectedInterpreterId(null);
                             setIsAllocationDrawerOpen(true);
                           }}
                           className="text-[9px] h-8 text-slate-400 dark:text-slate-500 hover:text-red-600 dark:hover:text-red-500 border-none px-4"
                         >
                           Change Allocation
                         </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="p-12 text-center bg-slate-50 dark:bg-slate-950 rounded-3xl border border-dashed border-slate-300 dark:border-slate-800 transition-colors">
                      <div className="w-16 h-16 bg-white dark:bg-slate-900 rounded-3xl flex items-center justify-center mx-auto mb-4 border border-slate-100 dark:border-slate-800 shadow-sm transition-colors text-slate-200 dark:text-slate-800">
                        <User size={32} />
                      </div>
                      <h4 className="text-lg font-black text-slate-900 dark:text-white uppercase tracking-tighter">No Resource Allocated</h4>
                      <p className="text-xs font-bold text-slate-400 dark:text-slate-500 mb-6 max-w-sm mx-auto">This booking is currently in limbo. You must allocate an interpreter to proceed with the fulfillment process.</p>
                      <Button onClick={() => setIsAllocationDrawerOpen(true)} icon={ArrowUpRight} variant="primary" className="h-10 px-8 rounded-xl text-xs">
                        Open Allocation Desk
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Right Column: Cards & Meta */}
            <div className="xl:col-span-4 space-y-8">
              
              {/* Financial Impact Analysis */}
              <div className="bg-slate-900 dark:bg-slate-950 rounded-3xl text-white overflow-hidden shadow-2xl shadow-slate-900/20 border border-slate-800 transition-colors">
                 <div className="p-8 bg-gradient-to-br from-slate-900 to-slate-800 dark:to-slate-950">
                    <div className="flex items-center justify-between mb-8">
                      <div className="p-2 bg-blue-500 rounded-xl">
                        <CreditCard size={20} className="text-white" />
                      </div>
                      <StatusBadge status={booking.paymentStatus || 'UNPAID'} />
                    </div>
                    
                    <div className="space-y-6">
                       <div className="flex justify-between items-end border-b border-white/5 pb-4 transition-colors">
                          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Base Payout</p>
                          <p className="text-2xl font-black">£{booking.amount?.toFixed(2) || '0.00'}</p>
                       </div>
                       
                       <div className="grid grid-cols-2 gap-4">
                          <div className="p-4 bg-white/5 rounded-2xl border border-white/5 transition-colors">
                            <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">Tax Estimate</p>
                            <p className="text-sm font-black text-slate-100">£{(booking.amount * 0.2).toFixed(2) || '0.00'}</p>
                          </div>
                          <div className="p-4 bg-white/5 rounded-2xl border border-white/5 transition-colors">
                            <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">Profit Yield</p>
                            <p className="text-sm font-black text-emerald-400">+ £{(booking.amount * 0.45).toFixed(2) || '0.00'}</p>
                          </div>
                       </div>
                    </div>
                 </div>
                 
                 <div className="p-4 bg-slate-950/50 flex items-center justify-center transition-colors">
                   <button 
                     onClick={() => navigate('/admin/billing')}
                     className="text-[10px] font-black uppercase text-blue-400 hover:text-blue-300 transition-colors tracking-widest flex items-center gap-2 px-12 py-3 rounded-2xl hover:bg-white/5 transition-all"
                   >
                     Manage Invoices <ArrowUpRight size={14} />
                   </button>
                 </div>
              </div>

              {/* Operation Audit Trail */}
              <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden transition-colors">
                <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-purple-50 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 rounded-xl transition-colors">
                      <History size={20} />
                    </div>
                    <h2 className="text-lg font-black text-slate-900 dark:text-white uppercase tracking-tighter">Audit Trail</h2>
                  </div>
                </div>
                <div className="p-6">
                   <ActivityTimeline 
                     events={[
                       { id: '1', type: 'BOOKING_CREATED', createdAt: booking.createdAt, description: 'Booking provisioned in the system.' },
                       { id: '2', type: 'RESOURCE_MATCHED', createdAt: booking.updatedAt, description: 'Interpreter confirmed by system logic.' },
                       { id: '3', type: 'DEPLOYMENT_LIVE', createdAt: booking.date, description: 'On-site session started as scheduled.' }
                     ]}
                   />
                   
                   <div className="mt-8">
                     <button className="w-full py-3 text-[10px] font-black uppercase text-slate-400 dark:text-slate-500 hover:text-slate-900 dark:hover:text-slate-200 transition-colors tracking-widest flex items-center justify-center gap-2 bg-slate-50 dark:bg-slate-950 rounded-2xl border border-slate-100 dark:border-slate-800 hover:border-slate-200 dark:hover:border-slate-700 transition-all shadow-sm">
                       View Extended Logs <ArrowUpRight size={14} />
                     </button>
                   </div>
                </div>
              </div>

            </div>
          </div>
        </div>
      </div>

      <InterpreterAllocationDrawer
        isOpen={isAllocationDrawerOpen}
        onClose={() => setIsAllocationDrawerOpen(false)}
        job={booking}
        onSuccess={() => {
          loadBooking();
          setIsAllocationDrawerOpen(false);
          showToast('Interpreter successfully allocated', 'success');
        }}
      />

      <InterpreterPreviewDrawer
        interpreterId={selectedInterpreterId || ''}
        jobId={id || ''}
        isOpen={isInterpreterPreviewOpen}
        onClose={() => setIsInterpreterPreviewOpen(false)}
        onSuccess={() => loadBooking()}
      />
    </div>
  );
};

export default AdminBookingDetails;