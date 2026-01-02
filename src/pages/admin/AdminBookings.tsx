import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useBookings } from '../../hooks/useBookings';
import { StatusBadge } from '../../components/StatusBadge';
import { Search, Filter, MapPin, Video, User, Plus } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Spinner } from '../../components/ui/Spinner';
import { Alert } from '../../components/ui/Alert';
import { EmptyState } from '../../components/ui/EmptyState';
import { Card } from '../../components/ui/Card';
import { Modal } from '../../components/ui/Modal';
import { ClientService, BookingService } from '../../services/api';
import { Client, ServiceType, BookingStatus } from '../../types';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';
import { useSettings } from '../../context/SettingsContext';

export const AdminBookings = () => {
  const { bookings = [], loading, error, refresh } = useBookings();
  const { settings } = useSettings();
  const [filter, setFilter] = useState('');
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { user } = useAuth();

  // Create Modal State
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [clients, setClients] = useState<Client[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    clientId: '',
    serviceType: ServiceType.FACE_TO_FACE,
    languageFrom: 'English',
    languageTo: '',
    date: '',
    startTime: '',
    durationMinutes: 60,
    locationType: 'ONSITE' as 'ONSITE' | 'ONLINE',
    address: '',
    postcode: '',
    onlineLink: '',
    costCode: '',
    notes: ''
  });

  useEffect(() => {
    ClientService.getAll().then(setClients);
  }, []);

  const handleOpenCreate = () => {
    setFormData({
      clientId: '',
      serviceType: ServiceType.FACE_TO_FACE,
      languageFrom: 'English',
      languageTo: '',
      date: '',
      startTime: '',
      durationMinutes: 60,
      locationType: 'ONSITE',
      address: '',
      postcode: '',
      onlineLink: '',
      costCode: '',
      notes: ''
    });
    setIsCreateModalOpen(true);
  };

  const handleCreateBooking = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.clientId) {
      showToast('Please select a client', 'error');
      return;
    }
    if (!formData.languageTo) {
      showToast('Please select a target language', 'error');
      return;
    }

    setIsSubmitting(true);
    try {
      const selectedClient = clients.find(c => c.id === formData.clientId);
      
      await BookingService.create({
        ...formData,
        clientName: selectedClient?.companyName || 'Unknown Client',
        requestedByUserId: user?.id
      });

      showToast('Booking created successfully', 'success');
      setIsCreateModalOpen(false);
      refresh();
    } catch (err) {
      console.error(err);
      showToast('Failed to create booking', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Safe String Helper
  const safe = (val: any) => String(val ?? "").toLowerCase();

  const filteredBookings = (bookings || []).filter(b => {
    const q = safe(filter);
    return safe(b.clientName).includes(q) ||
           safe(b.status).includes(q) ||
           safe(b.bookingRef).includes(q) ||
           safe(b.languageTo).includes(q);
  });

  const inputClasses = "w-full p-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white text-gray-900";

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">All Bookings</h1>
          <p className="text-gray-500 text-sm">Manage system-wide requests</p>
        </div>
        <Button onClick={handleOpenCreate} icon={Plus}>
          Create Booking
        </Button>
      </div>

      {/* Filters */}
      <Card padding="sm" className="flex gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
          <input 
            type="text" 
            placeholder="Search clients, ref (e.g. LL-123) or status..." 
            className="pl-10 pr-4 py-2 border-none w-full focus:ring-0 outline-none text-sm bg-transparent text-gray-900"
            value={filter}
            onChange={e => setFilter(e.target.value)}
          />
        </div>
        <div className="border-l border-gray-200 pl-4">
           <Button variant="ghost" size="sm" icon={Filter}>Filters</Button>
        </div>
      </Card>

      {/* Content */}
      {error && <Alert type="error" message={error} />}
      
      {loading ? (
        <div className="py-12 text-center">
          <Spinner size="lg" className="mx-auto mb-4" />
          <p className="text-gray-500">Loading bookings...</p>
        </div>
      ) : filteredBookings.length === 0 ? (
        <EmptyState 
          title="No bookings found" 
          description={filter ? "Try adjusting your search filters." : "There are no bookings in the system yet."}
          actionLabel={filter ? "Clear Filters" : "Refresh"}
          onAction={filter ? () => setFilter('') : refresh}
        />
      ) : (
        <Card padding="none">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Ref / Date</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Client</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Details</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Assigned</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Action</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredBookings.map((booking) => (
                  <tr key={booking.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      <div className="font-bold text-blue-600">{booking.bookingRef || '---'}</div>
                      <div className="font-medium mt-1">{booking.date ? new Date(booking.date).toLocaleDateString() : 'TBD'}</div>
                      <div className="text-gray-500 text-xs">{booking.startTime || '--:--'}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">
                        {booking.clientName || 'Unnamed'}
                        {!booking.clientId && (
                          <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-orange-100 text-orange-800">
                            Guest
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-gray-500">{booking.costCode || 'No Ref'}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                       <div className="text-sm text-gray-900">{booking.languageFrom} &rarr; {booking.languageTo}</div>
                       <div className="flex items-center text-xs text-gray-500 mt-1">
                          {booking.locationType === 'ONLINE' ? <Video size={12} className="mr-1"/> : <MapPin size={12} className="mr-1"/>}
                          {booking.serviceType}
                       </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {booking.interpreterName ? (
                        <span className="text-blue-600 font-medium flex items-center">
                          <User size={12} className="mr-1" />
                          {booking.interpreterName}
                        </span>
                      ) : (
                        <span className="text-gray-400 italic">Unassigned</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <StatusBadge status={booking.status || 'UNKNOWN'} />
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <Button 
                        variant="ghost" 
                        size="sm"
                        onClick={() => navigate(`/admin/bookings/${booking.id}`)}
                      >
                        Manage
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Create Booking Modal */}
      <Modal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        title="Create New Booking"
        maxWidth="lg"
      >
        <form onSubmit={handleCreateBooking} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <label className="block text-sm font-bold text-gray-700 mb-1">Client *</label>
              <select 
                required
                className={inputClasses}
                value={formData.clientId}
                onChange={e => setFormData({...formData, clientId: e.target.value})}
              >
                <option value="">Select a client...</option>
                {clients.map(c => (
                  <option key={c.id} value={c.id}>{c.companyName}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-bold text-gray-700 mb-1">Target Language *</label>
              <select 
                required
                className={inputClasses}
                value={formData.languageTo}
                onChange={e => setFormData({...formData, languageTo: e.target.value})}
              >
                <option value="">Select language...</option>
                {(settings?.masterData?.priorityLanguages || []).map(lang => (
                  <option key={lang} value={lang}>{lang}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-bold text-gray-700 mb-1">Service Type</label>
              <select 
                className={inputClasses}
                value={formData.serviceType}
                onChange={e => setFormData({...formData, serviceType: e.target.value as ServiceType})}
              >
                {Object.values(ServiceType).map(type => (
                  <option key={type} value={type}>{type}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-bold text-gray-700 mb-1">Date *</label>
              <input 
                type="date" required
                className={inputClasses}
                value={formData.date}
                onChange={e => setFormData({...formData, date: e.target.value})}
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">Start Time *</label>
                <input 
                  type="time" required
                  className={inputClasses}
                  value={formData.startTime}
                  onChange={e => setFormData({...formData, startTime: e.target.value})}
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">Duration (Min)</label>
                <input 
                  type="number" required min="15" step="15"
                  className={inputClasses}
                  value={formData.durationMinutes}
                  onChange={e => setFormData({...formData, durationMinutes: parseInt(e.target.value)})}
                />
              </div>
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm font-bold text-gray-700 mb-1">Location Type</label>
              <div className="flex gap-4 p-2.5 bg-gray-100 rounded-lg border border-gray-200">
                <label className="flex items-center cursor-pointer text-gray-700 font-medium text-sm">
                  <input 
                    type="radio" 
                    name="locationType" 
                    value="ONSITE"
                    checked={formData.locationType === 'ONSITE'}
                    onChange={() => setFormData({...formData, locationType: 'ONSITE'})}
                    className="mr-2 w-4 h-4 text-blue-600 focus:ring-blue-500"
                  />
                  On-site
                </label>
                <label className="flex items-center cursor-pointer text-gray-700 font-medium text-sm">
                  <input 
                    type="radio" 
                    name="locationType" 
                    value="ONLINE"
                    checked={formData.locationType === 'ONLINE'}
                    onChange={() => setFormData({...formData, locationType: 'ONLINE'})}
                    className="mr-2 w-4 h-4 text-blue-600 focus:ring-blue-500"
                  />
                  Online / Remote
                </label>
              </div>
            </div>

            {formData.locationType === 'ONSITE' ? (
              <>
                <div className="md:col-span-2">
                  <label className="block text-sm font-bold text-gray-700 mb-1">Street Address</label>
                  <input 
                    type="text" required
                    placeholder="Full address"
                    className={inputClasses}
                    value={formData.address}
                    onChange={e => setFormData({...formData, address: e.target.value})}
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-1">Postcode</label>
                  <input 
                    type="text" required
                    placeholder="Postcode"
                    className={inputClasses}
                    value={formData.postcode}
                    onChange={e => setFormData({...formData, postcode: e.target.value})}
                  />
                </div>
              </>
            ) : (
              <div className="md:col-span-2">
                <label className="block text-sm font-bold text-gray-700 mb-1">Meeting Link (Optional)</label>
                <input 
                  type="text"
                  placeholder="Zoom, Teams, etc."
                  className={inputClasses}
                  value={formData.onlineLink}
                  onChange={e => setFormData({...formData, onlineLink: e.target.value})}
                />
              </div>
            )}

            <div>
              <label className="block text-sm font-bold text-gray-700 mb-1">Cost Code / Reference</label>
              <input 
                type="text"
                placeholder="e.g. PO-1234"
                className={inputClasses}
                value={formData.costCode}
                onChange={e => setFormData({...formData, costCode: e.target.value})}
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-bold text-gray-700 mb-1">Notes / Instructions</label>
            <textarea 
              rows={3}
              className={inputClasses}
              value={formData.notes}
              onChange={e => setFormData({...formData, notes: e.target.value})}
              placeholder="Any specific requirements..."
            />
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
            <Button variant="ghost" type="button" onClick={() => setIsCreateModalOpen(false)}>Cancel</Button>
            <Button variant="primary" type="submit" isLoading={isSubmitting}>Create Booking</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};