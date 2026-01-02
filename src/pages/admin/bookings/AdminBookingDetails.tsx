import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { BookingService, InterpreterService } from '../../../services/api';
import { Booking, BookingAssignment, Interpreter, BookingStatus, AssignmentStatus, ServiceType } from '../../../types';
import { StatusBadge } from '../../../components/StatusBadge';
import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';
import { Modal } from '../../../components/ui/Modal';
/* Added missing Badge import */
import { Badge } from '../../../components/ui/Badge';
import { useToast } from '../../../context/ToastContext';
import { 
  Calendar, Clock, MapPin, Video, Globe2, ChevronLeft, 
  User, CheckCircle2, XCircle, Send, AlertCircle, Edit, Trash2, Search, UserPlus
} from 'lucide-react';

const AdminBookingDetails = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { showToast } = useToast();
  
  const [booking, setBooking] = useState<Booking | null>(null);
  const [assignments, setAssignments] = useState<BookingAssignment[]>([]);
  const [suggestedInterpreters, setSuggestedInterpreters] = useState<Interpreter[]>([]);
  const [allInterpreters, setAllInterpreters] = useState<Interpreter[]>([]);
  const [interpretersMap, setInterpretersMap] = useState<Record<string, Interpreter>>({});
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);

  // Search State for Manual Selection
  const [searchQuery, setSearchQuery] = useState('');

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
      const [bookingData, assignmentsData, interpretersList] = await Promise.all([
        BookingService.getById(bookingId),
        BookingService.getAssignmentsByBookingId(bookingId),
        InterpreterService.getAll()
      ]);

      setBooking(bookingData || null);
      setAssignments(assignmentsData);
      setAllInterpreters(interpretersList);
      
      // Map for easy lookup
      const map: Record<string, Interpreter> = {};
      interpretersList.forEach(i => map[i.id] = i);
      setInterpretersMap(map);

      if (bookingData) {
        // Find suggestions based on language
        const suggestions = await BookingService.findInterpretersByLanguage(bookingData.languageTo);
        setSuggestedInterpreters(suggestions);
      }
    } catch (error) {
      console.error("Failed to load data for booking:", error);
      showToast('Failed to load booking details', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenEdit = () => {
    if (!booking) return;
    setEditFormData({ ...booking });
    setIsEditModalOpen(true);
  };

  const handleUpdateBooking = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!booking) return;
    setProcessing(true);
    try {
      await BookingService.update(booking.id, editFormData);
      showToast('Booking updated successfully', 'success');
      setIsEditModalOpen(false);
      await loadData(booking.id);
    } catch (error) {
      showToast('Failed to update booking', 'error');
    } finally {
      setProcessing(false);
    }
  };

  const handleSendOffer = async (interpreterId: string) => {
    if (!booking) return;
    setProcessing(true);
    try {
      await BookingService.createAssignment(booking.id, interpreterId);
      showToast('Offer sent successfully', 'success');
      await loadData(booking.id);
    } catch (error) {
      showToast('Failed to send offer', 'error');
    } finally {
      setProcessing(false);
    }
  };

  const handleCancelOffer = async (assignmentId: string) => {
    if (!window.confirm('Are you sure you want to retract this offer? The interpreter will no longer see this job in their feed.')) return;
    setProcessing(true);
    try {
      await BookingService.declineOffer(assignmentId);
      showToast('Offer retracted successfully', 'info');
      if (id) await loadData(id);
    } catch (error) {
      console.error("Error retracting offer:", error);
      showToast('Failed to cancel offer', 'error');
    } finally {
      setProcessing(false);
    }
  };

  const handleConfirmAssignment = async (interpreterId: string) => {
    if (!booking) return;
    
    // 1. Conflict Check
    const conflictingBooking = await BookingService.checkScheduleConflict(
      interpreterId, 
      booking.date, 
      booking.startTime, 
      booking.durationMinutes,
      booking.id 
    );

    if (conflictingBooking) {
      const proceed = window.confirm(
        `SCHEDULE CONFLICT DETECTED!\n\n` +
        `This interpreter is already booked for:\n` +
        `${conflictingBooking.date} at ${conflictingBooking.startTime} (${conflictingBooking.durationMinutes} mins)\n\n` +
        `Do you want to proceed anyway?`
      );
      if (!proceed) return;
    } else {
      if (!window.confirm('Are you sure you want to confirm this interpreter? This will expire other offers.')) return;
    }
    
    setProcessing(true);
    try {
      await BookingService.assignInterpreterToBooking(booking.id, interpreterId);
      showToast('Interpreter confirmed for this job', 'success');
      await loadData(booking.id);
    } catch (error) {
      showToast('Failed to confirm assignment', 'error');
    } finally {
      setProcessing(false);
    }
  };

  const handleStatusChange = async (status: BookingStatus) => {
    if (!booking) return;
    setProcessing(true);
    try {
      await BookingService.updateStatus(booking.id, status);
      showToast(`Status updated to ${status}`, 'success');
      await loadData(booking.id);
    } catch (error) {
      showToast('Failed to update status', 'error');
    } finally {
      setProcessing(false);
    }
  };

  if (loading) return <div className="p-8 text-center text-gray-500">Loading booking details...</div>;
  if (!booking) return <div className="p-8 text-center text-red-500">Booking not found.</div>;

  const filteredManualList = searchQuery.length > 0 
    ? allInterpreters.filter(i => 
        i.status === 'ACTIVE' && 
        (i.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
         i.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
         i.languages.some(l => l.toLowerCase().includes(searchQuery.toLowerCase()))) &&
        !assignments.some(a => a.interpreterId === i.id)
      )
    : [];

  const activeSuggestions = suggestedInterpreters.filter(
    i => !assignments.some(a => a.interpreterId === i.id)
  );

  return (
    <div className="space-y-6 pb-20">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="flex items-center">
          <button 
            onClick={() => navigate('/admin/bookings')} 
            className="mr-4 p-2 rounded-full hover:bg-gray-200 transition-colors text-gray-500"
          >
            <ChevronLeft size={24} />
          </button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-gray-900">Booking #{booking.bookingRef || booking.id.substring(0, 6).toUpperCase()}</h1>
              <StatusBadge status={booking.status} />
            </div>
            <p className="text-gray-500 text-sm mt-1">Requested by {booking.clientName} on {new Date(booking.date).toLocaleDateString()}</p>
          </div>
        </div>

        <div className="flex gap-2">
          {(booking.status === BookingStatus.REQUESTED || booking.status === BookingStatus.OFFERED || booking.status === BookingStatus.SEARCHING) && (
            <Button 
              variant="secondary" 
              size="sm" 
              onClick={() => handleStatusChange(BookingStatus.CANCELLED)}
              disabled={processing}
              className="text-red-600 border-red-200 hover:bg-red-50"
            >
              Reject / Cancel
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* LEFT COLUMN: Job Details */}
        <div className="space-y-6 lg:col-span-2">
          <Card className="space-y-6">
            <div className="flex items-center justify-between border-b border-gray-100 pb-4">
              <h2 className="text-lg font-bold text-gray-900">Job Details</h2>
              <div className="flex items-center gap-2">
                {booking.interpreterId && (
                   <div className="flex items-center text-green-600 bg-green-50 px-3 py-1 rounded-full text-xs font-bold">
                     <CheckCircle2 size={14} className="mr-1.5" />
                     Assigned
                   </div>
                )}
                {booking.status !== BookingStatus.COMPLETED && booking.status !== BookingStatus.PAID && (
                  <Button variant="ghost" size="sm" onClick={handleOpenEdit} icon={Edit}>
                    Edit Job
                  </Button>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <div>
                  <label className="text-xs font-bold text-gray-400 uppercase">Language</label>
                  <div className="flex items-center mt-1">
                    <Globe2 size={18} className="text-blue-500 mr-2" />
                    <span className="font-medium text-gray-900">{booking.languageFrom} &rarr; {booking.languageTo}</span>
                  </div>
                </div>
                <div>
                  <label className="text-xs font-bold text-gray-400 uppercase">Service Type</label>
                  <div className="flex items-center mt-1">
                    {booking.locationType === 'ONLINE' ? (
                      <Video size={18} className="text-purple-500 mr-2" />
                    ) : (
                      <User size={18} className="text-blue-500 mr-2" />
                    )}
                    <span className="font-medium text-gray-900">{booking.serviceType}</span>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="text-xs font-bold text-gray-400 uppercase">Date & Time</label>
                  <div className="flex items-center mt-1">
                    <Calendar size={18} className="text-gray-500 mr-2" />
                    <span className="font-medium text-gray-900">
                      {new Date(booking.date).toLocaleDateString()}
                    </span>
                  </div>
                  <div className="flex items-center mt-1 ml-7">
                    <Clock size={16} className="text-gray-400 mr-2" />
                    <span className="text-sm text-gray-600">{booking.startTime} ({booking.durationMinutes} mins)</span>
                  </div>
                </div>
                <div>
                  <label className="text-xs font-bold text-gray-400 uppercase">Location</label>
                  <div className="flex items-start mt-1">
                    <MapPin size={18} className="text-red-500 mr-2 mt-0.5" />
                    <span className="font-medium text-gray-900 text-sm">
                      {booking.locationType === 'ONLINE' 
                        ? (booking.onlineLink ? <a href={booking.onlineLink} target="_blank" className="text-blue-600 hover:underline">{booking.onlineLink}</a> : 'Remote (No link yet)') 
                        : `${booking.address || 'No address'}, ${booking.postcode || ''}`
                      }
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div className="pt-4 border-t border-gray-100">
               <label className="text-xs font-bold text-gray-400 uppercase">Notes / Requirements</label>
               <p className="mt-1 text-sm text-gray-700 bg-gray-50 p-3 rounded-lg min-h-[60px]">
                 {booking.notes || 'No notes provided.'}
               </p>
            </div>
          </Card>
        </div>

        {/* RIGHT COLUMN: Matching */}
        <div className="space-y-6">
          {/* Section: Sent Offers / Status */}
          <Card className="bg-gray-50 border-blue-100">
             <h3 className="font-bold text-gray-900 mb-4 flex items-center">
               <Send size={16} className="mr-2 text-blue-600" />
               Sent Offers ({assignments.length})
             </h3>
             
             {assignments.length === 0 ? (
               <p className="text-sm text-gray-500 italic text-center py-4">No offers sent yet.</p>
             ) : (
               <div className="space-y-3">
                 {assignments.map(assign => {
                   const interpreter = interpretersMap[assign.interpreterId];
                   return (
                     <div key={assign.id} className="bg-white p-3 rounded-lg border border-gray-200 shadow-sm">
                        <div className="flex justify-between items-start mb-2">
                          <span className="font-bold text-sm text-gray-900">{interpreter?.name || 'Unknown'}</span>
                          <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-full
                            ${assign.status === AssignmentStatus.ACCEPTED ? 'bg-green-100 text-green-800' : 
                              assign.status === AssignmentStatus.DECLINED ? 'bg-red-100 text-red-800' : 
                              assign.status === AssignmentStatus.EXPIRED ? 'bg-gray-100 text-gray-600' : 
                              'bg-yellow-100 text-yellow-800'}
                          `}>
                            {assign.status}
                          </span>
                        </div>
                        <div className="text-xs text-gray-500 mb-3">
                           Sent: {new Date(assign.offeredAt).toLocaleDateString()}
                        </div>
                        
                        {assign.status === AssignmentStatus.ACCEPTED && booking.status !== BookingStatus.CONFIRMED && (
                          <Button 
                            size="sm" 
                            className="w-full bg-green-600 hover:bg-green-700"
                            onClick={() => handleConfirmAssignment(assign.interpreterId)}
                            disabled={processing}
                          >
                            Confirm Assignment
                          </Button>
                        )}
                        {assign.status === AssignmentStatus.OFFERED && (
                           <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-50">
                             <div className="text-xs text-blue-600 font-medium flex items-center">
                               <Clock size={12} className="mr-1" /> Awaiting response
                             </div>
                             <button 
                               onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleCancelOffer(assign.id); }}
                               className="text-[10px] text-red-600 hover:text-red-800 font-extrabold uppercase transition-colors px-2 py-1 rounded border border-red-200 hover:bg-red-50 cursor-pointer shadow-sm"
                               disabled={processing}
                             >
                               CANCEL OFFER
                             </button>
                           </div>
                        )}
                     </div>
                   );
                 })}
               </div>
             )}
          </Card>

          {/* Section: Suggested & Manual Selection */}
          {booking.status !== BookingStatus.CONFIRMED && booking.status !== BookingStatus.COMPLETED && (
            <Card>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-gray-900 flex items-center">
                    <User size={16} className="mr-2 text-purple-600" />
                    Suggested Interpreters
                  </h3>
                </div>

                {/* Manual Search Input */}
                <div className="relative">
                  <Search size={14} className="absolute left-2.5 top-2.5 text-gray-400" />
                  <input 
                    type="text" 
                    placeholder="Search all interpreters manually..." 
                    className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-xs outline-none focus:ring-1 focus:ring-blue-500"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
                
                {/* Search Results / Suggestions */}
                <div className="space-y-3 mt-4 max-h-[400px] overflow-y-auto pr-1">
                  {(searchQuery.length > 0 ? filteredManualList : activeSuggestions).length === 0 ? (
                    <div className="text-center py-6">
                      <AlertCircle size={24} className="mx-auto text-gray-300 mb-2" />
                      <p className="text-xs text-gray-500">
                        {searchQuery.length > 0 
                          ? `No active interpreters found matching "${searchQuery}"`
                          : `No matching suggestions for ${booking.languageTo}. Try manual search.`}
                      </p>
                    </div>
                  ) : (
                    (searchQuery.length > 0 ? filteredManualList : activeSuggestions).map(interpreter => (
                      <div key={interpreter.id} className="border border-gray-100 rounded-lg p-3 hover:bg-gray-50 transition-colors shadow-sm bg-white">
                        <div className="flex justify-between items-center mb-2">
                          <div>
                            <p className="font-bold text-sm text-gray-900">{interpreter.name}</p>
                            <p className="text-[10px] text-gray-500">{interpreter.regions.join(', ')}</p>
                          </div>
                          <div className="text-right">
                             <Badge variant={interpreter.status === 'ACTIVE' ? 'success' : 'warning'} className="text-[9px]">
                               {interpreter.status}
                             </Badge>
                          </div>
                        </div>
                        <div className="flex items-center justify-between mt-3 gap-2">
                           <div className="text-[10px] text-gray-400 truncate max-w-[100px]">
                              Qual: {interpreter.qualifications[0] || 'N/A'}
                           </div>
                           <div className="flex gap-1">
                            <button 
                              onClick={() => handleConfirmAssignment(interpreter.id)}
                              disabled={processing}
                              className="px-2 py-1 bg-green-50 text-green-700 border border-green-200 rounded text-[10px] font-bold hover:bg-green-100 transition-colors flex items-center"
                              title="Directly Assign"
                            >
                              <UserPlus size={12} className="mr-1" /> Assign
                            </button>
                            <button 
                              onClick={() => handleSendOffer(interpreter.id)}
                              disabled={processing}
                              className="px-2 py-1 border border-blue-200 text-blue-600 rounded text-[10px] font-bold hover:bg-blue-50 transition-colors"
                            >
                              Send Offer
                            </button>
                           </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </Card>
          )}
        </div>
      </div>

      {/* Edit Booking Modal */}
      <Modal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        title="Edit Booking Details"
        maxWidth="lg"
      >
        <form onSubmit={handleUpdateBooking} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Target Language</label>
              <input 
                type="text" 
                className="w-full p-2 border border-gray-300 rounded-lg text-sm"
                value={editFormData.languageTo || ''}
                onChange={e => setEditFormData({...editFormData, languageTo: e.target.value})}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Service Type</label>
              <select 
                className="w-full p-2 border border-gray-300 rounded-lg text-sm"
                value={editFormData.serviceType}
                onChange={e => setEditFormData({...editFormData, serviceType: e.target.value as ServiceType})}
              >
                {Object.values(ServiceType).map(type => (
                  <option key={type} value={type}>{type}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
              <input 
                type="date" 
                className="w-full p-2 border border-gray-300 rounded-lg text-sm"
                value={editFormData.date || ''}
                onChange={e => setEditFormData({...editFormData, date: e.target.value})}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Start Time</label>
              <input 
                type="time" 
                className="w-full p-2 border border-gray-300 rounded-lg text-sm"
                value={editFormData.startTime || ''}
                onChange={e => setEditFormData({...editFormData, startTime: e.target.value})}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Duration (Mins)</label>
              <input 
                type="number" 
                className="w-full p-2 border border-gray-300 rounded-lg text-sm"
                value={editFormData.durationMinutes || 0}
                onChange={e => setEditFormData({...editFormData, durationMinutes: parseInt(e.target.value)})}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Location Type</label>
              <select 
                className="w-full p-2 border border-gray-300 rounded-lg text-sm"
                value={editFormData.locationType}
                onChange={e => setEditFormData({...editFormData, locationType: e.target.value as any})}
              >
                <option value="ONSITE">On-site</option>
                <option value="ONLINE">Online</option>
              </select>
            </div>
          </div>

          {editFormData.locationType === 'ONSITE' ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
                <input 
                  type="text" 
                  className="w-full p-2 border border-gray-300 rounded-lg text-sm"
                  value={editFormData.address || ''}
                  onChange={e => setEditFormData({...editFormData, address: e.target.value})}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Postcode</label>
                <input 
                  type="text" 
                  className="w-full p-2 border border-gray-300 rounded-lg text-sm"
                  value={editFormData.postcode || ''}
                  onChange={e => setEditFormData({...editFormData, postcode: e.target.value})}
                />
              </div>
            </div>
          ) : (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Meeting Link</label>
              <input 
                type="text" 
                className="w-full p-2 border border-gray-300 rounded-lg text-sm"
                value={editFormData.onlineLink || ''}
                onChange={e => setEditFormData({...editFormData, onlineLink: e.target.value})}
              />
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notes / Special Instructions</label>
            <textarea 
              className="w-full p-2 border border-gray-300 rounded-lg text-sm h-24"
              value={editFormData.notes || ''}
              onChange={e => setEditFormData({...editFormData, notes: e.target.value})}
            />
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button variant="ghost" type="button" onClick={() => setIsEditModalOpen(false)}>Cancel</Button>
            <Button variant="primary" type="submit" isLoading={processing}>Save Changes</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

export default AdminBookingDetails;