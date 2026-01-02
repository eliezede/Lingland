
import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { BookingService, InterpreterService } from '../../../services/api';
import { Booking, BookingAssignment, Interpreter, BookingStatus, AssignmentStatus, ServiceType } from '../../../types';
import { StatusBadge } from '../../../components/StatusBadge';
import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';
import { Modal } from '../../../components/ui/Modal';
import { Badge } from '../../../components/ui/Badge';
import { useToast } from '../../../context/ToastContext';
import { 
  Calendar, Clock, MapPin, Video, Globe2, ChevronLeft, 
  User, CheckCircle2, XCircle, Send, AlertCircle, Edit, Trash2, Search, UserPlus, Filter, Eye, List
} from 'lucide-react';

const AdminBookingDetails = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { showToast } = useToast();
  
  const [booking, setBooking] = useState<Booking | null>(null);
  const [assignments, setAssignments] = useState<BookingAssignment[]>([]);
  const [suggestedInterpreters, setSuggestedInterpreters] = useState<Interpreter[]>([]);
  const [allInterpreters, setAllInterpreters] = useState<Interpreter[]>([]);
  const [allBookings, setAllBookings] = useState<Booking[]>([]);
  const [interpretersMap, setInterpretersMap] = useState<Record<string, Interpreter>>({});
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);

  // Advanced Selection State
  const [isAdvancedModalOpen, setIsAdvancedModalOpen] = useState(false);
  const [advSearchQuery, setAdvSearchQuery] = useState('');
  const [selectedIntForSchedule, setSelectedIntForSchedule] = useState<string | null>(null);

  // Edit State
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editFormData, setEditFormData] = useState<Partial<Booking>>({});

  useEffect(() => {
    if (id) {
      loadData(id);
    }
  }, [id]);

  const loadData = async (bookingId: string) => {
    setLoading(true);
    try {
      const [bookingData, assignmentsData, interpretersList, bookingsList] = await Promise.all([
        BookingService.getById(bookingId),
        BookingService.getAssignmentsByBookingId(bookingId),
        InterpreterService.getAll(),
        BookingService.getAll()
      ]);

      setBooking(bookingData || null);
      setAssignments(assignmentsData);
      setAllInterpreters(interpretersList);
      setAllBookings(bookingsList);
      
      const map: Record<string, Interpreter> = {};
      interpretersList.forEach(i => map[i.id] = i);
      setInterpretersMap(map);

      if (bookingData) {
        const suggestions = await BookingService.findInterpretersByLanguage(bookingData.languageTo);
        setSuggestedInterpreters(suggestions);
      }
    } catch (error) {
      console.error("Failed to load data:", error);
      showToast('Failed to load details', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateBooking = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!booking) return;
    setProcessing(true);
    try {
      await BookingService.update(booking.id, editFormData);
      showToast('Booking updated', 'success');
      setIsEditModalOpen(false);
      await loadData(booking.id);
    } catch (error) {
      showToast('Failed to update', 'error');
    } finally {
      setProcessing(false);
    }
  };

  const handleSendOffer = async (interpreterId: string) => {
    if (!booking) return;
    setProcessing(true);
    try {
      await BookingService.createAssignment(booking.id, interpreterId);
      showToast('Offer sent', 'success');
      await loadData(booking.id);
    } catch (error) {
      showToast('Failed to send offer', 'error');
    } finally {
      setProcessing(false);
    }
  };

  const handleConfirmAssignment = async (interpreterId: string) => {
    if (!booking) return;
    
    const conflictingBooking = await BookingService.checkScheduleConflict(
      interpreterId, 
      booking.date, 
      booking.startTime, 
      booking.durationMinutes,
      booking.id 
    );

    if (conflictingBooking) {
      const proceed = window.confirm(`ATENÇÃO: Conflito de horário detectado para este intérprete!\n\nEle já tem um job em ${conflictingBooking.date} às ${conflictingBooking.startTime}.\nDeseja forçar a atribuição mesmo assim?`);
      if (!proceed) return;
    }
    
    setProcessing(true);
    try {
      await BookingService.assignInterpreterToBooking(booking.id, interpreterId);
      showToast('Interpreter assigned directly', 'success');
      await loadData(booking.id);
      setIsAdvancedModalOpen(false);
    } catch (error) {
      showToast('Failed to assign', 'error');
    } finally {
      setProcessing(false);
    }
  };

  const getInterpreterWorkload = (interpreterId: string) => {
    if (!booking) return 0;
    const bookingDate = new Date(booking.date);
    const startOfWeek = new Date(bookingDate);
    startOfWeek.setDate(bookingDate.getDate() - bookingDate.getDay());
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 6);

    return allBookings.filter(b => 
      b.interpreterId === interpreterId && 
      (b.status === BookingStatus.CONFIRMED || b.status === BookingStatus.COMPLETED) &&
      new Date(b.date) >= startOfWeek && new Date(b.date) <= endOfWeek
    ).length;
  };

  const getInterpreterSchedule = (interpreterId: string) => {
    return allBookings.filter(b => 
      b.interpreterId === interpreterId && 
      (b.status === BookingStatus.CONFIRMED || b.status === BookingStatus.COMPLETED)
    ).sort((a,b) => a.date.localeCompare(b.date));
  };

  if (loading) return <div className="p-8 text-center text-gray-500">Loading booking details...</div>;
  if (!booking) return <div className="p-8 text-center text-red-500">Booking not found.</div>;

  const activeSuggestions = suggestedInterpreters.filter(
    i => !assignments.some(a => a.interpreterId === i.id)
  );

  const filteredAdvancedList = allInterpreters.filter(i => 
    i.status === 'ACTIVE' && 
    (i.name.toLowerCase().includes(advSearchQuery.toLowerCase()) || 
     i.languages.some(l => l.toLowerCase().includes(advSearchQuery.toLowerCase())))
  );

  return (
    <div className="space-y-6 pb-20">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="flex items-center">
          <button onClick={() => navigate('/admin/bookings')} className="mr-4 p-2 rounded-full hover:bg-gray-200 text-gray-500"><ChevronLeft size={24} /></button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-gray-900">Booking #{booking.bookingRef || booking.id.substring(0, 6).toUpperCase()}</h1>
              <StatusBadge status={booking.status} />
            </div>
            <p className="text-gray-500 text-sm mt-1">Requested by {booking.clientName} on {new Date(booking.date).toLocaleDateString()}</p>
          </div>
        </div>
        <Button variant="secondary" size="sm" onClick={() => BookingService.updateStatus(booking.id, BookingStatus.CANCELLED)} className="text-red-600 border-red-200 hover:bg-red-50">Reject / Cancel</Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card className="space-y-6">
            <div className="flex items-center justify-between border-b border-gray-100 pb-4">
              <h2 className="text-lg font-bold text-gray-900">Job Details</h2>
              <Button variant="ghost" size="sm" onClick={() => { setEditFormData({...booking}); setIsEditModalOpen(true); }} icon={Edit}>Edit Job</Button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <div>
                  <label className="text-xs font-bold text-gray-400 uppercase">Language</label>
                  <div className="flex items-center mt-1"><Globe2 size={18} className="text-blue-500 mr-2" /><span className="font-medium text-gray-900">{booking.languageFrom} &rarr; {booking.languageTo}</span></div>
                </div>
                <div>
                  <label className="text-xs font-bold text-gray-400 uppercase">Service Type</label>
                  <div className="flex items-center mt-1"><User size={18} className="text-blue-500 mr-2" /><span className="font-medium text-gray-900">{booking.serviceType}</span></div>
                </div>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="text-xs font-bold text-gray-400 uppercase">Date & Time</label>
                  <div className="flex items-center mt-1"><Calendar size={18} className="text-gray-500 mr-2" /><span className="font-medium text-gray-900">{new Date(booking.date).toLocaleDateString()}</span></div>
                  <div className="flex items-center mt-1 ml-7"><Clock size={16} className="text-gray-400 mr-2" /><span className="text-sm text-gray-600">{booking.startTime} ({booking.durationMinutes} mins)</span></div>
                </div>
                <div>
                  <label className="text-xs font-bold text-gray-400 uppercase">Location</label>
                  <div className="flex items-start mt-1"><MapPin size={18} className="text-red-500 mr-2 mt-0.5" /><span className="font-medium text-gray-900 text-sm">{booking.locationType === 'ONLINE' ? 'Remote Link' : `${booking.address}, ${booking.postcode}`}</span></div>
                </div>
              </div>
            </div>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="bg-blue-50/50 border-blue-100">
             <h3 className="font-bold text-gray-900 mb-4 flex items-center"><Send size={16} className="mr-2 text-blue-600" />Sent Offers ({assignments.length})</h3>
             <div className="space-y-3">
               {assignments.map(assign => (
                 <div key={assign.id} className="bg-white p-3 rounded-lg border border-gray-200 shadow-sm flex justify-between items-center">
                    <div>
                      <p className="font-bold text-sm text-gray-900">{interpretersMap[assign.interpreterId]?.name || 'Unknown'}</p>
                      <p className="text-[10px] text-gray-500 uppercase">{assign.status}</p>
                    </div>
                    {assign.status === AssignmentStatus.ACCEPTED && <Button size="sm" onClick={() => handleConfirmAssignment(assign.interpreterId)}>Confirm</Button>}
                 </div>
               ))}
               {assignments.length === 0 && <p className="text-xs text-gray-500 italic text-center py-2">No offers sent.</p>}
             </div>
          </Card>

          <Card>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-gray-900 flex items-center"><User size={16} className="mr-2 text-purple-600" />Suggested</h3>
              <button 
                onClick={() => { setAdvSearchQuery(booking.languageTo); setIsAdvancedModalOpen(true); }}
                className="text-[10px] font-black text-blue-600 uppercase hover:underline"
              >
                Advanced Selection
              </button>
            </div>
            <div className="space-y-3">
              {activeSuggestions.slice(0, 3).map(interpreter => (
                <div key={interpreter.id} className="border border-gray-100 rounded-lg p-3 hover:bg-gray-50 transition-colors">
                  <div className="flex justify-between items-center">
                    <p className="font-bold text-sm text-gray-900">{interpreter.name}</p>
                    <Badge variant="success" className="text-[9px]">ACTIVE</Badge>
                  </div>
                  <div className="flex items-center justify-between mt-3">
                     <span className="text-[10px] text-gray-400">Qual: {interpreter.qualifications[0] || 'N/A'}</span>
                     <Button size="sm" variant="ghost" onClick={() => handleSendOffer(interpreter.id)}>Offer</Button>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>

      {/* Advanced Selection Modal */}
      <Modal isOpen={isAdvancedModalOpen} onClose={() => setIsAdvancedModalOpen(false)} title="Interpreter Curatorship" maxWidth="2xl">
        <div className="space-y-6">
           <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
              <input 
                type="text" 
                placeholder="Search by name or language..."
                className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-xl outline-none focus:ring-2 focus:ring-blue-500"
                value={advSearchQuery}
                onChange={e => setAdvSearchQuery(e.target.value)}
              />
           </div>

           <div className="bg-white border rounded-xl overflow-hidden shadow-sm">
              <table className="min-w-full divide-y divide-gray-200">
                 <thead className="bg-gray-50">
                    <tr>
                       <th className="px-4 py-3 text-left text-[10px] font-black text-gray-400 uppercase">Professional</th>
                       <th className="px-4 py-3 text-left text-[10px] font-black text-gray-400 uppercase">Workload (This Week)</th>
                       <th className="px-4 py-3 text-right text-[10px] font-black text-gray-400 uppercase">Actions</th>
                    </tr>
                 </thead>
                 <tbody className="divide-y divide-gray-200">
                    {filteredAdvancedList.map(int => {
                      const workload = getInterpreterWorkload(int.id);
                      const isScheduleVisible = selectedIntForSchedule === int.id;
                      return (
                        <React.Fragment key={int.id}>
                          <tr className="hover:bg-gray-50 transition-colors">
                            <td className="px-4 py-4">
                               <div className="font-bold text-sm text-gray-900">{int.name}</div>
                               <div className="text-[10px] text-gray-500 uppercase flex gap-1 mt-0.5">
                                 {int.languages.slice(0, 3).map(l => <span key={l} className="bg-gray-100 px-1 rounded">{l}</span>)}
                               </div>
                            </td>
                            <td className="px-4 py-4">
                               <div className="flex items-center">
                                  <div className={`w-2 h-2 rounded-full mr-2 ${workload > 4 ? 'bg-red-500' : workload > 2 ? 'bg-yellow-500' : 'bg-green-500'}`} />
                                  <span className="text-sm font-medium">{workload} jobs scheduled</span>
                               </div>
                               <button 
                                 onClick={() => setSelectedIntForSchedule(isScheduleVisible ? null : int.id)}
                                 className="text-[10px] text-blue-600 font-bold hover:underline flex items-center mt-1"
                               >
                                 <Calendar size={10} className="mr-1" /> {isScheduleVisible ? 'Hide Schedule' : 'View Schedule'}
                               </button>
                            </td>
                            <td className="px-4 py-4 text-right">
                               <div className="flex justify-end gap-2">
                                  <button onClick={() => handleSendOffer(int.id)} className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg" title="Send Offer"><Send size={16} /></button>
                                  <button onClick={() => handleConfirmAssignment(int.id)} className="p-2 text-green-600 hover:bg-green-50 rounded-lg" title="Assign Directly"><UserPlus size={16} /></button>
                               </div>
                            </td>
                          </tr>
                          {isScheduleVisible && (
                            <tr className="bg-blue-50/30">
                               <td colSpan={3} className="px-8 py-4">
                                  <div className="space-y-2">
                                     <p className="text-[10px] font-black text-blue-900 uppercase">Confirmed Agenda</p>
                                     {getInterpreterSchedule(int.id).length === 0 ? (
                                       <p className="text-xs text-gray-400 italic">No bookings found in history.</p>
                                     ) : (
                                       <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                          {getInterpreterSchedule(int.id).map(sch => (
                                            <div key={sch.id} className="bg-white p-2 rounded border border-blue-100 text-[11px] flex justify-between">
                                               <span className="font-bold">{sch.date}</span>
                                               <span className="text-gray-500">{sch.startTime} - {sch.durationMinutes}min</span>
                                               <span className="text-blue-600 font-medium">{sch.clientName}</span>
                                            </div>
                                          ))}
                                       </div>
                                     )}
                                  </div>
                               </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                 </tbody>
              </table>
           </div>
        </div>
      </Modal>

      {/* Edit Booking Modal */}
      <Modal isOpen={isEditModalOpen} onClose={() => setIsEditModalOpen(false)} title="Edit Booking Details">
        <form onSubmit={handleUpdateBooking} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
             <div><label className="block text-xs font-bold text-gray-500 uppercase mb-1">Language To</label><input type="text" className="w-full p-2 border rounded-lg" value={editFormData.languageTo || ''} onChange={e => setEditFormData({...editFormData, languageTo: e.target.value})} /></div>
             <div><label className="block text-xs font-bold text-gray-500 uppercase mb-1">Date</label><input type="date" className="w-full p-2 border rounded-lg" value={editFormData.date || ''} onChange={e => setEditFormData({...editFormData, date: e.target.value})} /></div>
          </div>
          <div className="flex justify-end gap-3 pt-4 border-t"><Button variant="ghost" type="button" onClick={() => setIsEditModalOpen(false)}>Cancel</Button><Button type="submit" isLoading={processing}>Save Changes</Button></div>
        </form>
      </Modal>
    </div>
  );
};

export default AdminBookingDetails;
