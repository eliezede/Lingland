import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
    Building2, Globe2, MapPin, Video,
    Search, ChevronLeft, Save, Plus, X, Phone, Mail,
    Calendar, Check, UserPlus, Info, CreditCard, ChevronRight, Zap
} from 'lucide-react';
import { ClientService, InterpreterService, BookingService } from '../../../services/api';
import { Client, Interpreter, ServiceType, BookingStatus } from '../../../types';
import { useClients } from '../../../context/ClientContext';
import { useToast } from '../../../context/ToastContext';
import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';
import { Modal } from '../../../components/ui/Modal';
import { useAuth } from '../../../context/AuthContext';
import { AddressService, UkAddress } from '../../../services/addressService';
import { PostcodeLookup } from '../../../components/ui/PostcodeLookup';

export const AdminNewBooking = () => {
    const navigate = useNavigate();
    const { user } = useAuth();
    const { showToast } = useToast();
    const { id } = useParams<{ id: string }>();
    const isEditMode = !!id;
    const { clientsMap } = useClients();

    const [loading, setLoading] = useState(false);
    const clients = Object.values(clientsMap);
    const [interpreters, setInterpreters] = useState<Interpreter[]>([]);
    const [searchingInterpreter, setSearchingInterpreter] = useState('');
    const [organizationId, setOrganizationId] = useState<string>('');
    const [availableLanguages, setAvailableLanguages] = useState<string[]>([]);
    const [clientModalOpen, setClientModalOpen] = useState(false);
    const [clientSearchQuery, setClientSearchQuery] = useState('');

    const [clientSource, setClientSource] = useState<'EXISTING' | 'GUEST'>('GUEST');
    const [selectedClient, setSelectedClient] = useState<Client | null>(null);
    const [selectedInterpreter, setSelectedInterpreter] = useState<Interpreter | null>(null);

    const [formData, setFormData] = useState({
        costCode: '',
        serviceType: ServiceType.FACE_TO_FACE,
        languageFrom: 'English',
        languageTo: '',
        date: '',
        startTime: '',
        durationMinutes: 60,
        locationType: 'ONSITE' as 'ONSITE' | 'ONLINE',
        address: '',
        postcode: '',
        houseNumber: '',
        onlineLink: '',
        notes: '',
        genderPreference: 'None' as 'Male' | 'Female' | 'None',
        organization: '',
        contactName: '',
        contactEmail: '',
        contactPhone: '',
        // Translation-specific fields
        translationFormat: 'Only Word',
        translationFormatOther: '',
        quoteRequested: false,
        sourceFiles: [] as string[],
        deliveryEmail: '',
        lat: undefined as number | undefined,
        lng: undefined as number | undefined
    });

    const isTranslation = formData.serviceType === ServiceType.TRANSLATION;

    useEffect(() => {
        loadInitialData();
        if (isEditMode) {
            loadBookingData();
        }
    }, [id]);

    const loadBookingData = async () => {
        if (!id) return;
        setLoading(true);
        try {
            const booking = await BookingService.getById(id);
            if (booking) {
                // Populate form data
                setFormData({
                    costCode: booking.costCode || '',
                    serviceType: booking.serviceType,
                    languageFrom: booking.languageFrom || 'English',
                    languageTo: booking.languageTo || '',
                    date: booking.date,
                    startTime: booking.startTime,
                    durationMinutes: booking.durationMinutes,
                    locationType: booking.locationType,
                    address: booking.address || '',
                    postcode: booking.postcode || '',
                    houseNumber: booking.houseNumber || '',
                    onlineLink: booking.onlineLink || '',
                    notes: booking.notes || '',
                    genderPreference: booking.genderPreference || 'None',
                    organization: booking.guestContact?.organisation || '',
                    contactName: booking.guestContact?.name || '',
                    contactEmail: booking.guestContact?.email || '',
                    contactPhone: booking.guestContact?.phone || '',
                    translationFormat: booking.translationFormat || 'Only Word',
                    translationFormatOther: booking.translationFormatOther || '',
                    quoteRequested: !!booking.quoteRequested,
                    sourceFiles: booking.sourceFiles || [],
                    deliveryEmail: booking.deliveryEmail || '',
                    lat: booking.lat,
                    lng: booking.lng
                });
                
                if (booking.organizationId) {
                    setOrganizationId(booking.organizationId);
                }

                if (booking.clientId) {
                    setClientSource('EXISTING');
                    const client = clientsMap[booking.clientId];
                    if (client) setSelectedClient(client);
                } else {
                    setClientSource('GUEST');
                }

                if (booking.interpreterId) {
                    const int = await InterpreterService.getById(booking.interpreterId);
                    if (int) setSelectedInterpreter(int);
                }
            }
        } catch (e) {
            showToast('Failed to load booking data', 'error');
        } finally {
            setLoading(false);
        }
    };

    const loadInitialData = async () => {
        try {
            const i = await InterpreterService.getAll();
            const activeInts = i.filter(int => int.status === 'ACTIVE');
            setInterpreters(activeInts);

            // Extract unique languages
            const allLangs = activeInts.flatMap(int => int.languages);
            const uniqueLangs = Array.from(new Set(allLangs)).sort();
            setAvailableLanguages(uniqueLangs);
        } catch (e) {
            console.error("Failed to load data", e);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!formData.languageTo || !formData.date || !formData.startTime) {
            showToast('Please fill in all required fields', 'error');
            return;
        }

        setLoading(true);
        try {
            const bookingData: any = {
                costCode: formData.costCode,
                serviceType: formData.serviceType,
                languageFrom: formData.languageFrom,
                languageTo: formData.languageTo,
                date: formData.date,
                startTime: formData.startTime,
                durationMinutes: formData.durationMinutes,
                locationType: formData.locationType,
                address: formData.address,
                postcode: formData.postcode,
                onlineLink: formData.onlineLink,
                notes: formData.notes,
                genderPreference: formData.genderPreference,
                organizationId: organizationId || (user as any)?.organizationId || 'lingland-main',
                status: selectedInterpreter ? 'PENDING_ASSIGNMENT' : 'INCOMING',
                requestedByUserId: user?.id || 'admin',
                updatedAt: new Date().toISOString(),
                // Translation-specific fields
                translationFormat: formData.translationFormat,
                translationFormatOther: formData.translationFormatOther,
                quoteRequested: formData.quoteRequested,
                sourceFiles: formData.sourceFiles,
                deliveryEmail: formData.deliveryEmail || formData.contactEmail,
                lat: formData.lat,
                lng: formData.lng
            };

            if (clientSource === 'EXISTING' && selectedClient) {
                bookingData.clientId = selectedClient.id;
                bookingData.clientName = selectedClient.companyName;
                bookingData.guestContact = {
                    name: formData.contactName || selectedClient.contactPerson,
                    email: formData.contactEmail || selectedClient.email,
                    phone: formData.contactPhone,
                    organisation: selectedClient.companyName
                };
            } else {
                bookingData.clientName = formData.organization || 'Guest Client';
                bookingData.guestContact = {
                    name: formData.contactName,
                    email: formData.contactEmail,
                    phone: formData.contactPhone,
                    organisation: formData.organization
                };
            }

            if (selectedInterpreter) {
                bookingData.interpreterId = selectedInterpreter.id;
                bookingData.interpreterName = selectedInterpreter.name;
            }

            if (isEditMode) {
                await BookingService.update(id!, bookingData);
                showToast('Booking updated successfully', 'success');
            } else {
                bookingData.bookingRef = `LL-${Math.floor(1000 + Math.random() * 9000)}`;
                bookingData.createdAt = new Date().toISOString();
                await BookingService.create(bookingData);
                showToast('Booking created successfully', 'success');
            }
            navigate('/admin/bookings');
        } catch (error) {
            showToast('Failed to create booking', 'error');
        } finally {
            setLoading(false);
        }
    };

    const labelClasses = "block text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.15em] mb-2 ml-1";
    const inputClasses = "w-full p-4 bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-800 rounded-2xl focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 dark:focus:border-blue-700 focus:outline-none transition-all text-slate-900 dark:text-white font-medium placeholder:text-slate-300 dark:placeholder:text-slate-600";

    const filteredClientsForModal = clients.filter(c =>
        c.companyName.toLowerCase().includes(clientSearchQuery.toLowerCase()) ||
        c.contactPerson.toLowerCase().includes(clientSearchQuery.toLowerCase())
    );

    const filteredInterpreters = interpreters.filter(i =>
        i.name.toLowerCase().includes(searchingInterpreter.toLowerCase()) ||
        i.languages.some(l => l.toLowerCase().includes(searchingInterpreter.toLowerCase()))
    );

    return (
        <div className="space-y-6 pb-20 animate-in fade-in slide-in-from-bottom-4 duration-700">
            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div className="flex items-center gap-4">
                    <button
                        onClick={() => navigate('/admin/bookings')}
                        className="p-3 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all shadow-sm"
                    >
                        <ChevronLeft size={20} />
                    </button>
                    <div>
                        <h1 className="text-3xl font-black text-slate-900 dark:text-white tracking-tight">
                            {isEditMode ? 'Edit Booking Record' : 'Create Manual Booking'}
                        </h1>
                        <p className="text-slate-500 dark:text-slate-400 font-medium">
                            {isEditMode ? `Updating ${formData.organization || 'Booking'}` : 'Register a request received via email or phone'}
                        </p>
                    </div>
                </div>
            </div>

            <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-12 gap-6">

                {/* Left Column: Client & Essentials */}
                <div className="lg:col-span-7 space-y-6">

                    {/* Billing Information */}
                    <Card padding="lg">
                        <div className="flex items-center gap-3 mb-8">
                            <div className="bg-amber-50 dark:bg-amber-900/10 p-3 rounded-2xl text-amber-600 dark:text-amber-400">
                                <CreditCard size={24} />
                            </div>
                            <h2 className="text-xl font-black text-slate-900 dark:text-white">Billing Information</h2>
                        </div>
                        <div>
                            <label htmlFor="costCode" className={labelClasses}>Purchase Order / Cost Code</label>
                            <input
                                type="text"
                                id="costCode"
                                name="costCode"
                                autoComplete="off"
                                className={inputClasses + " font-mono"}
                                placeholder="e.g. PO-2024-001 or CC-HR-99"
                                value={formData.costCode}
                                onChange={e => setFormData({ ...formData, costCode: e.target.value })}
                            />
                            {selectedClient && (
                                <p className="mt-2 text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase italic">
                                    Default format for this client: {selectedClient.defaultCostCodeType}
                                </p>
                            )}
                        </div>
                    </Card>

                    {/* Client Selection */}
                    <Card padding="lg">
                        <div className="flex items-center gap-3 mb-8">
                            <div className="bg-blue-50 dark:bg-blue-900/10 p-3 rounded-2xl text-blue-600 dark:text-blue-400">
                                <Building2 size={24} />
                            </div>
                            <h2 className="text-xl font-black text-slate-900 dark:text-white">Client Information</h2>
                        </div>

                        <div className="flex p-1 bg-slate-100 dark:bg-slate-800/50 rounded-2xl mb-8">
                            <button
                                type="button"
                                onClick={() => setClientSource('GUEST')}
                                className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${clientSource === 'GUEST' ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-sm' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-200'}`}
                            >
                                Guest / New Client
                            </button>
                            <button
                                type="button"
                                onClick={() => setClientSource('EXISTING')}
                                className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${clientSource === 'EXISTING' ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-sm' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-200'}`}
                            >
                                Existing Registered Client
                            </button>
                        </div>

                        {clientSource === 'EXISTING' ? (
                            <div className="space-y-6">
                                <div>
                                    <label className={labelClasses}>Search Registered Client</label>

                                    {!selectedClient ? (
                                        <button
                                            type="button"
                                            onClick={() => setClientModalOpen(true)}
                                            className="w-full flex items-center gap-3 p-4 bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-800 rounded-2xl hover:bg-slate-100 dark:hover:bg-slate-800/80 hover:border-blue-200 dark:hover:border-blue-900/50 transition-all text-left group"
                                        >
                                            <Search className="text-slate-400 dark:text-slate-600 group-hover:text-blue-500 transition-colors" size={18} />
                                            <span className="text-slate-400 dark:text-slate-500 font-medium group-hover:text-slate-600 dark:group-hover:text-slate-300 transition-colors">Click to browse and select a client...</span>
                                        </button>
                                    ) : (
                                        <div className="flex items-center justify-between p-4 bg-blue-50 dark:bg-blue-900/10 border border-blue-100 dark:border-blue-900/30 rounded-2xl">
                                            <div className="flex items-center gap-4">
                                                <div className="bg-blue-600 p-2 rounded-xl text-white">
                                                    <Check size={16} />
                                                </div>
                                                <div>
                                                    <div className="text-sm font-black text-blue-900 dark:text-blue-100">{selectedClient.companyName}</div>
                                                    <div className="text-[10px] font-bold text-blue-600 dark:text-blue-400 uppercase tracking-widest">{selectedClient.contactPerson}</div>
                                                </div>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => setSelectedClient(null)}
                                                className="p-2 text-blue-400 hover:text-blue-600 dark:hover:text-blue-200 transition-colors"
                                            >
                                                <X size={18} />
                                            </button>
                                        </div>
                                    )}
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div>
                                        <label htmlFor="contactName" className={labelClasses}>Request Member Name</label>
                                        <input
                                            type="text"
                                            id="contactName"
                                            name="contactName"
                                            autoComplete="name"
                                            className={inputClasses}
                                            placeholder="Person who called/emailed"
                                            value={formData.contactName}
                                            onChange={e => setFormData({ ...formData, contactName: e.target.value })}
                                        />
                                    </div>
                                    <div>
                                        <label htmlFor="contactPhone" className={labelClasses}>Direct Contact Number</label>
                                        <input
                                            type="tel"
                                            id="contactPhone"
                                            name="contactPhone"
                                            autoComplete="tel"
                                            className={inputClasses}
                                            placeholder="+44 0000 000000"
                                            value={formData.contactPhone}
                                            onChange={e => setFormData({ ...formData, contactPhone: e.target.value })}
                                        />
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div className="space-y-6">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div className="md:col-span-2">
                                        <label htmlFor="organization" className={labelClasses}>Organization / Company</label>
                                        <input
                                            type="text"
                                            id="organization"
                                            name="organization"
                                            autoComplete="organization"
                                            className={inputClasses}
                                            placeholder="e.g. British Council"
                                            value={formData.organization}
                                            onChange={e => setFormData({ ...formData, organization: e.target.value })}
                                        />
                                    </div>
                                    <div>
                                        <label htmlFor="guestContactName" className={labelClasses}>Contact Person</label>
                                        <input
                                            type="text"
                                            id="guestContactName"
                                            name="guestContactName"
                                            autoComplete="name"
                                            className={inputClasses}
                                            placeholder="Full Name"
                                            value={formData.contactName}
                                            onChange={e => setFormData({ ...formData, contactName: e.target.value })}
                                        />
                                    </div>
                                    <div>
                                        <label htmlFor="guestContactEmail" className={labelClasses}>Email Address</label>
                                        <input
                                            type="email"
                                            id="guestContactEmail"
                                            name="guestContactEmail"
                                            autoComplete="email"
                                            className={inputClasses}
                                            placeholder="email@example.com"
                                            value={formData.contactEmail}
                                            onChange={e => setFormData({ ...formData, contactEmail: e.target.value })}
                                        />
                                    </div>
                                </div>
                            </div>
                        )}
                    </Card>

                    {/* Service Details */}
                    <Card padding="lg">
                        <div className="flex items-center gap-3 mb-8">
                            <div className="bg-emerald-50 dark:bg-emerald-900/10 p-3 rounded-2xl text-emerald-600 dark:text-emerald-400">
                                <Globe2 size={24} />
                            </div>
                            <h2 className="text-xl font-black text-slate-900 dark:text-white">Service Logistics</h2>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                            <div>
                                <label className={labelClasses}>Language Category</label>
                                <select
                                    id="serviceType"
                                    name="serviceType"
                                    className={inputClasses}
                                    value={formData.serviceType}
                                    onChange={e => setFormData({ ...formData, serviceType: e.target.value as ServiceType })}
                                >
                                    {Object.values(ServiceType).map(type => (
                                        <option key={type} value={type}>{type}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className={labelClasses}>Target Language</label>
                                <select
                                    required
                                    id="languageTo"
                                    name="languageTo"
                                    className={inputClasses}
                                    value={formData.languageTo}
                                    onChange={e => setFormData({ ...formData, languageTo: e.target.value })}
                                >
                                    <option value="">Select Target Language...</option>
                                    {availableLanguages.map(lang => (
                                        <option key={lang} value={lang}>{lang}</option>
                                    ))}
                                </select>
                            </div>

                            <div>
                                <label className={labelClasses}>Date of Service</label>
                                <div className="relative">
                                    <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                                    <input
                                        type="date"
                                        required
                                        id="date"
                                        name="date"
                                        className={inputClasses + " pl-12"}
                                        value={formData.date}
                                        onChange={e => setFormData({ ...formData, date: e.target.value })}
                                    />
                                </div>
                            </div>

                             <div className={isTranslation ? 'hidden' : ''}>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className={labelClasses}>Time</label>
                                        <input
                                            type="time"
                                            required={!isTranslation}
                                            id="startTime"
                                            name="startTime"
                                            className={inputClasses}
                                            value={formData.startTime}
                                            onChange={e => setFormData({ ...formData, startTime: e.target.value })}
                                        />
                                    </div>
                                    <div>
                                        <label className={labelClasses}>Dur. (min)</label>
                                        <input
                                            type="number"
                                            required={!isTranslation}
                                            id="durationMinutes"
                                            name="durationMinutes"
                                            className={inputClasses}
                                            value={formData.durationMinutes}
                                            onChange={e => setFormData({ ...formData, durationMinutes: parseInt(e.target.value) })}
                                        />
                                    </div>
                                </div>
                            </div>

                            <div className={isTranslation ? 'hidden' : ''}>
                                <label className={labelClasses}>Interpreter Gender Preference</label>
                                <div className="grid grid-cols-3 gap-3">
                                    {['None', 'Male', 'Female'].map(gender => (
                                        <button
                                            key={gender}
                                            type="button"
                                            onClick={() => setFormData({ ...formData, genderPreference: gender as any })}
                                            className={`py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border-2 ${formData.genderPreference === gender ? 'bg-blue-600 border-blue-600 text-white shadow-md' : 'bg-white dark:bg-slate-900 border-slate-100 dark:border-slate-800 text-slate-400 dark:text-slate-500 hover:border-slate-200 dark:hover:border-slate-700'}`}
                                        >
                                            {gender}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>

                        {!isTranslation && (
                            <div className="mt-8 pt-8 border-t border-slate-50 dark:border-slate-800 animate-in fade-in slide-in-from-top-2">
                                <label className={labelClasses}>Meeting Method</label>
                                <div className="grid grid-cols-2 gap-4">
                                    <button
                                        type="button"
                                        onClick={() => setFormData({ ...formData, locationType: 'ONSITE' })}
                                        className={`flex flex-col items-center justify-center p-6 border-2 rounded-2xl transition-all ${formData.locationType === 'ONSITE' ? 'bg-blue-600 border-blue-600 text-white shadow-lg shadow-blue-200 dark:shadow-none' : 'bg-white dark:bg-slate-900 border-slate-100 dark:border-slate-800 text-slate-400 dark:text-slate-500 hover:border-slate-200 dark:hover:border-slate-700'}`}
                                    >
                                        <MapPin size={24} className="mb-2" />
                                        <span className="text-[10px] font-black uppercase tracking-widest">Face to Face</span>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setFormData({ ...formData, locationType: 'ONLINE' })}
                                        className={`flex flex-col items-center justify-center p-6 border-2 rounded-2xl transition-all ${formData.locationType === 'ONLINE' ? 'bg-indigo-600 border-indigo-600 text-white shadow-lg shadow-indigo-200 dark:shadow-none' : 'bg-white dark:bg-slate-900 border-slate-100 dark:border-slate-800 text-slate-400 dark:text-slate-500 hover:border-slate-200 dark:hover:border-slate-700'}`}
                                    >
                                        <Video size={24} className="mb-2" />
                                        <span className="text-[10px] font-black uppercase tracking-widest">Remote / Video</span>
                                    </button>
                                </div>

                                {formData.locationType === 'ONSITE' ? (
                                        <div className="md:col-span-3">
                                            <label className={labelClasses}>Job Location Address</label>
                                            <PostcodeLookup 
                                                onAddressSelected={(addr: UkAddress) => {
                                                    setFormData({
                                                        ...formData,
                                                        address: addr.street || addr.formattedAddress,
                                                        houseNumber: addr.houseNumber || '',
                                                        postcode: addr.postcode,
                                                        lat: addr.lat,
                                                        lng: addr.lng
                                                    });
                                                }}
                                                className="mb-2"
                                            />
                                            <p className="mt-2 text-[10px] text-slate-400 font-bold uppercase tracking-wider flex items-center gap-1.5 ml-1">
                                                <div className="w-1 h-1 rounded-full bg-blue-500" />
                                                Include house number for exact matches (e.g. "10 SW1A 1AA")
                                            </p>
                                            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-4">
                                                <div>
                                                    <label htmlFor="jobHouseNumber" className={labelClasses}>House/Flat #</label>
                                                    <input
                                                        type="text"
                                                        id="jobHouseNumber"
                                                        name="jobHouseNumber"
                                                        autoComplete="address-line2"
                                                        className={inputClasses}
                                                        placeholder="e.g. 42B"
                                                        value={formData.houseNumber}
                                                        onChange={e => setFormData({ ...formData, houseNumber: e.target.value })}
                                                    />
                                                </div>
                                                <div className="md:col-span-2">
                                                    <label htmlFor="jobAddress" className={labelClasses}>Street Address</label>
                                                    <input
                                                        type="text"
                                                        id="jobAddress"
                                                        name="jobAddress"
                                                        autoComplete="address-line1"
                                                        className={inputClasses}
                                                        placeholder="Street, Building name..."
                                                        value={formData.address}
                                                        onChange={e => setFormData({ ...formData, address: e.target.value, lat: undefined, lng: undefined })}
                                                    />
                                                </div>
                                                <div>
                                                    <label htmlFor="jobPostcode" className={labelClasses}>Postcode</label>
                                                    <input
                                                        type="text"
                                                        id="jobPostcode"
                                                        name="jobPostcode"
                                                        autoComplete="postal-code"
                                                        className={inputClasses + " uppercase"}
                                                        placeholder="SW1A 1AA"
                                                        value={formData.postcode}
                                                        onChange={e => setFormData({ ...formData, postcode: e.target.value, lat: undefined, lng: undefined })}
                                                    />
                                                </div>
                                            </div>
                                            {formData.lat && (
                                                <p className="mt-2 text-[10px] text-green-600 font-bold uppercase tracking-widest flex items-center gap-1">
                                                    <Check size={10} /> Geocoding Active: {formData.lat.toFixed(4)}, {formData.lng?.toFixed(4)}
                                                </p>
                                            )}
                                        </div>
                                ) : (
                                    <div className="mt-6 animate-in fade-in slide-in-from-top-2">
                                        <label htmlFor="onlineLink" className={labelClasses}>Meeting Link / Platform</label>
                                        <input
                                            type="text"
                                            id="onlineLink"
                                            name="onlineLink"
                                            autoComplete="url"
                                            className={inputClasses}
                                            placeholder="e.g. MS Teams Link, Zoom ID, or 'TBC'"
                                            value={formData.onlineLink}
                                            onChange={e => setFormData({ ...formData, onlineLink: e.target.value })}
                                        />
                                    </div>
                                )}
                            </div>
                        )}

                        {isTranslation && (
                            <div className="mt-8 pt-8 border-t border-slate-50 dark:border-slate-800 space-y-8 animate-in fade-in slide-in-from-top-4">
                                <div>
                                    <label className={labelClasses}>Format of Translated Text</label>
                                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                                        {['Body of Email', 'Only Word', 'Only Pdf', 'Word+Pdf', 'Leaflet', 'Other'].map(format => (
                                            <button
                                                key={format}
                                                type="button"
                                                onClick={() => setFormData({ ...formData, translationFormat: format })}
                                                className={`py-3 px-4 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border-2 ${formData.translationFormat === format ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white dark:bg-slate-900 border-slate-100 dark:border-slate-800 text-slate-400 dark:text-slate-500'}`}
                                            >
                                                {format}
                                            </button>
                                        ))}
                                    </div>
                                    {formData.translationFormat === 'Other' && (
                                        <input
                                            type="text"
                                            id="translationFormatOther"
                                            name="translationFormatOther"
                                            className={inputClasses + " mt-3"}
                                            placeholder="Please specify format..."
                                            value={formData.translationFormatOther}
                                            onChange={e => setFormData({ ...formData, translationFormatOther: e.target.value })}
                                        />
                                    )}
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                    <div>
                                        <label className={labelClasses}>Standard Rates / Quote</label>
                                        <div className="flex p-1 bg-slate-100 dark:bg-slate-800/50 rounded-2xl">
                                            <button
                                                type="button"
                                                onClick={() => setFormData({ ...formData, quoteRequested: false })}
                                                className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${!formData.quoteRequested ? 'bg-emerald-500 text-white shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                                            >
                                                Standard Rates
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setFormData({ ...formData, quoteRequested: true })}
                                                className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${formData.quoteRequested ? 'bg-rose-500 text-white shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                                            >
                                                Please Quote First
                                            </button>
                                        </div>
                                    </div>
                                    <div>
                                        <label className={labelClasses}>Delivery Email Address</label>
                                        <input
                                            type="email"
                                            id="deliveryEmail"
                                            name="deliveryEmail"
                                            className={inputClasses}
                                            placeholder="Where to send the translation..."
                                            value={formData.deliveryEmail}
                                            onChange={e => setFormData({ ...formData, deliveryEmail: e.target.value })}
                                        />
                                    </div>
                                </div>
                            </div>
                        )}
                    </Card>
                </div>

                {/* Right Column: Assignment & Notes */}
                <div className="lg:col-span-5 space-y-6">

                    {/* Internal Notes */}
                    <div className="bg-slate-900 dark:bg-blue-950 rounded-[2.5rem] p-8 lg:p-10 text-white shadow-2xl shadow-slate-900/20">
                        <div className="flex items-center gap-3 mb-8">
                            <div className="bg-white/10 p-3 rounded-2xl text-white">
                                <Info size={24} />
                            </div>
                            <h2 className="text-xl font-black">Admin Notes</h2>
                        </div>
                        <textarea
                            id="notes"
                            name="notes"
                            className="w-full h-40 bg-white/5 border border-white/10 rounded-2xl p-6 outline-none focus:ring-4 focus:ring-white/5 focus:border-white/20 transition-all text-white font-medium placeholder:text-white/20 resize-none"
                            placeholder="Any special instructions or case notes for the interpreter..."
                            value={formData.notes}
                            onChange={e => setFormData({ ...formData, notes: e.target.value })}
                        />
                    </div>

                    {/* Interpreter Assignment */}
                    <Card padding="lg" className="relative overflow-hidden group">
                        <div className="absolute top-0 right-0 w-32 h-32 bg-amber-50 dark:bg-amber-900/10 rounded-full -mr-10 -mt-10 blur-2xl group-hover:scale-110 transition-transform duration-700"></div>

                        <div className="relative z-10">
                            <div className="flex items-center gap-3 mb-8">
                                <div className="bg-amber-50 dark:bg-amber-900/10 p-3 rounded-2xl text-amber-600 dark:text-amber-400">
                                    <UserPlus size={24} />
                                </div>
                                <h2 className="text-xl font-black text-slate-900 dark:text-white">Immediate Assignment</h2>
                            </div>

                            <div className="relative">
                                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-600" size={18} />
                                <input
                                    type="text"
                                    id="interpreterSearch"
                                    name="interpreterSearch"
                                    className={inputClasses + " pl-12 bg-slate-50 dark:bg-slate-800/50"}
                                    placeholder="Search for an interpreter..."
                                    value={searchingInterpreter}
                                    onChange={(e) => setSearchingInterpreter(e.target.value)}
                                />
                            </div>

                            {searchingInterpreter && !selectedInterpreter && (
                                <div className="mt-4 border border-slate-100 dark:border-slate-800 rounded-2xl max-h-60 overflow-y-auto p-2 bg-slate-50/50 dark:bg-slate-900/50">
                                    {filteredInterpreters.map(i => (
                                        <button
                                            key={i.id}
                                            type="button"
                                            onClick={() => {
                                                setSelectedInterpreter(i);
                                                setSearchingInterpreter('');
                                            }}
                                            className="w-full flex items-center justify-between p-4 hover:bg-white dark:hover:bg-slate-800 rounded-xl transition-all text-left shadow-sm shadow-transparent hover:shadow-slate-200/50 dark:hover:shadow-none mb-1"
                                        >
                                            <div className="flex items-center gap-3">
                                                <div className="w-10 h-10 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-full flex items-center justify-center font-black text-sm">
                                                    {i.name.charAt(0)}
                                                </div>
                                                <div>
                                                    <div className="flex items-center gap-2">
                                                        <div className="text-sm font-bold text-slate-900 dark:text-white">{i.name}</div>
                                                        {i.acceptsDirectAssignment && (
                                                            <Zap size={12} className="text-amber-500 fill-amber-500 animate-pulse" />
                                                        )}
                                                    </div>
                                                    <div className="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase">{i.languages.slice(0, 2).join(', ')}</div>
                                                </div>
                                            </div>
                                            <Plus size={16} className="text-slate-300 dark:text-slate-700" />
                                        </button>
                                    ))}
                                    {filteredInterpreters.length === 0 && (
                                        <div className="p-10 text-center">
                                            <p className="text-xs text-slate-400 dark:text-slate-500 font-bold">No matches found</p>
                                        </div>
                                    )}
                                </div>
                            )}

                            {selectedInterpreter && (
                                <div className="mt-6 flex items-center justify-between p-6 bg-slate-900 dark:bg-slate-950 text-white rounded-[2rem] shadow-xl shadow-slate-200 dark:shadow-none">
                                    <div className="flex items-center gap-4">
                                        <div className="w-12 h-12 bg-white/10 rounded-2xl flex items-center justify-center text-white font-black text-lg">
                                            {selectedInterpreter.name.charAt(0)}
                                        </div>
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <div className="text-sm font-black">{selectedInterpreter.name}</div>
                                                {selectedInterpreter.acceptsDirectAssignment && (
                                                    <Zap size={14} className="text-amber-400 fill-amber-400" />
                                                )}
                                            </div>
                                            <div className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mt-0.5">Assigned Directly</div>
                                        </div>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => setSelectedInterpreter(null)}
                                        className="p-2 text-white/30 hover:text-white transition-colors"
                                    >
                                        <X size={20} />
                                    </button>
                                </div>
                            )}

                            {!selectedInterpreter && !searchingInterpreter && (
                                <div className="mt-8 flex items-start gap-4 p-6 bg-slate-50 dark:bg-slate-900/50 rounded-[2rem] border border-slate-100 dark:border-slate-800">
                                    <div className="text-blue-500 dark:text-blue-400 mt-1">
                                        <Info size={16} />
                                    </div>
                                    <p className="text-[11px] font-bold text-slate-400 dark:text-slate-500 leading-relaxed uppercase tracking-wider">
                                        If left empty, this job will be created as a <span className="text-blue-600 dark:text-blue-400">Pending Request</span> and sent to the general bidding pool.
                                    </p>
                                </div>
                            )}
                        </div>
                    </Card>

                    {/* Submit Action */}
                    <div className="pt-4">
                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full h-20 bg-blue-600 text-white rounded-[2.5rem] font-black uppercase tracking-[0.2em] text-[12px] shadow-2xl shadow-blue-200 dark:shadow-none hover:bg-blue-700 hover:-translate-y-1 transition-all active:scale-95 flex items-center justify-center gap-4 group"
                        >
                            {loading ? (
                                <div className="w-6 h-6 border-4 border-white/20 border-t-white rounded-full animate-spin"></div>
                            ) : (
                                <>
                                    <Save size={20} className="group-hover:scale-110 transition-transform" />
                                    {isEditMode ? 'Save Changes' : 'Publish Booking'}
                                </>
                            )}
                        </button>
                        <p className="text-center mt-6 text-[9px] font-black text-slate-300 dark:text-slate-700 uppercase tracking-[0.3em]">
                            Validated Secure Submission • Lingland V3
                        </p>
                    </div>
                </div>
            </form>

            {/* Client Selection Modal */}
            <Modal
                isOpen={clientModalOpen}
                onClose={() => {
                    setClientModalOpen(false);
                    setClientSearchQuery('');
                }}
                title="Select Registered Client"
                maxWidth="2xl"
            >
                <div className="space-y-4">
                    <div className="relative">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                        <input
                            type="text"
                            id="clientSearch"
                            name="clientSearch"
                            className="w-full pl-12 pr-4 py-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all text-slate-900 dark:text-white font-medium placeholder:text-slate-400"
                            placeholder="Search by company name or contact person..."
                            value={clientSearchQuery}
                            onChange={(e) => setClientSearchQuery(e.target.value)}
                            autoFocus
                        />
                    </div>

                    <div className="max-h-96 overflow-y-auto space-y-2 pr-2">
                        {filteredClientsForModal.length > 0 ? (
                            filteredClientsForModal.map(c => (
                                <button
                                    key={c.id}
                                    type="button"
                                    onClick={() => {
                                        setSelectedClient(c);
                                        setClientModalOpen(false);
                                        setClientSearchQuery('');
                                    }}
                                    className="w-full flex items-center gap-4 p-4 bg-white dark:bg-slate-900 hover:bg-blue-50 dark:hover:bg-blue-900/20 border border-slate-100 dark:border-slate-800 hover:border-blue-200 dark:hover:border-blue-800 rounded-xl transition-all text-left group"
                                >
                                    <div className="bg-slate-100 dark:bg-slate-800 group-hover:bg-blue-100 dark:group-hover:bg-blue-900/40 p-3 rounded-lg text-slate-400 dark:text-slate-500 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                                        <Building2 size={20} />
                                    </div>
                                    <div className="flex-1">
                                        <div className="text-sm font-bold text-slate-900 dark:text-white group-hover:text-blue-900 dark:group-hover:text-blue-100 transition-colors">{c.companyName}</div>
                                        <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{c.contactPerson}</div>
                                        <div className="text-[10px] text-slate-400 dark:text-slate-500 font-medium mt-1">{c.email}</div>
                                    </div>
                                    <ChevronRight size={18} className="text-slate-300 dark:text-slate-700 group-hover:text-blue-500 dark:group-hover:text-blue-400 transition-colors" />
                                </button>
                            ))
                        ) : (
                            <div className="text-center py-12">
                                <Building2 size={48} className="mx-auto text-slate-300 dark:text-slate-700 mb-4" />
                                <p className="text-slate-500 dark:text-slate-400 font-medium">No clients found</p>
                                <p className="text-xs text-slate-400 dark:text-slate-600 mt-1">Try adjusting your search query</p>
                            </div>
                        )}
                    </div>

                    {filteredClientsForModal.length > 0 && (
                        <div className="pt-3 border-t border-slate-100 dark:border-slate-800">
                            <p className="text-xs text-slate-400 dark:text-slate-600 text-center">
                                Showing {filteredClientsForModal.length} of {clients.length} registered clients
                            </p>
                        </div>
                    )}
                </div>
            </Modal>
        </div>
    );
};
