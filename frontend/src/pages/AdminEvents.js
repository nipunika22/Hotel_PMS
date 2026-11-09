// frontend/src/pages/AdminEvents.js
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { 
  FaCalendarAlt, 
  FaUsers, 
  FaPlus, 
  FaEdit, 
  FaTrash, 
  FaCheck, 
  FaTimes, 
  FaSearch, 
  FaEye, 
  FaGlassCheers,
  FaMapMarkerAlt,
  FaClock,
  FaTag,
  FaExclamationTriangle,
  FaExternalLinkAlt,
  FaCheckCircle,
  FaInfoCircle,
  FaHistory,
  FaCalendarCheck,
  FaChevronLeft,
  FaChevronRight,
  FaToggleOn,
  FaToggleOff,
  FaUtensils,
  FaSync,
  FaSave,
  FaArrowLeft,
  FaArrowRight,
  FaShieldAlt,
  FaListUl,
  FaCalendarWeek
} from 'react-icons/fa';
import { eventAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { toast } from 'react-toastify';
import { format, addDays, subDays } from 'date-fns';
import './AdminEvents.css';
import './AdminPMS.css';
import './RestaurantExperience.css';

const AdminEvents = () => {
  const { user } = useAuth();
  const userRole = (user?.role || '').toLowerCase().trim();
  const canManage = ['admin', 'manager', 'staff'].includes(userRole);
  const canDelete = ['admin', 'manager'].includes(userRole);

  const [activeTab, setActiveTab] = useState(() => {
    const requested = new URLSearchParams(window.location.search).get('tab');
    return ['bookings', 'schedule', 'events', 'venues'].includes(requested) ? requested : 'bookings';
  });
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // ---------------------------------------------------------------------------
  // TAB 1: BOOKINGS & ENQUIRIES STATE
  // ---------------------------------------------------------------------------
  const [bookings, setBookings] = useState([]);
  const [bookingStatusFilter, setBookingStatusFilter] = useState('ALL');
  const [bookingVenueFilter, setBookingVenueFilter] = useState('ALL');
  const [bookingTypeFilter, setBookingTypeFilter] = useState('ALL');
  const [bookingDateFilter, setBookingDateFilter] = useState('');
  const [bookingSearch, setBookingSearch] = useState('');
  const [bookingPage, setBookingPage] = useState(1);
  const itemsPerPage = 10;

  // Booking details & status modal
  const [selectedBookingModal, setSelectedBookingModal] = useState(null);
  const [statusUpdateNotes, setStatusUpdateNotes] = useState('');
  const [statusActionLoading, setStatusActionLoading] = useState(false);
  const [conflictErrorNotice, setConflictErrorNotice] = useState(null);

  // Consequential confirmation modal (for CONFIRMED or COMPLETED)
  const [confirmActionModal, setConfirmActionModal] = useState(null); // { type: 'CONFIRMED' | 'COMPLETED', booking: {...} }

  // Rejection / Cancellation prompt dialog
  const [actionPromptModal, setActionPromptModal] = useState(null); // { type: 'REJECT' | 'CANCEL', booking: {...}, reason: '' }

  // Universal destructive confirmation modal (for Event Archive or Venue Delete)
  const [destructiveModal, setDestructiveModal] = useState(null); // { type: 'EVENT' | 'VENUE', item: {...}, title: '', description: '' }
  const [destructiveLoading, setDestructiveLoading] = useState(false);

  // ---------------------------------------------------------------------------
  // TAB 2: VENUE SCHEDULE & AVAILABILITY STATE (INDEPENDENT DATASET)
  // ---------------------------------------------------------------------------
  const [scheduleDate, setScheduleDate] = useState(() => format(new Date(), 'yyyy-MM-dd'));
  const [scheduleVenueFilter, setScheduleVenueFilter] = useState('ALL');
  const [scheduleViewMode, setScheduleViewMode] = useState('daily'); // 'daily' | 'weekly'
  const [scheduleBookings, setScheduleBookings] = useState([]);
  const [scheduleLoading, setScheduleLoading] = useState(false);

  // Live conflict / availability check tool
  const [availCheckForm, setAvailCheckForm] = useState({
    venueId: '',
    date: format(new Date(), 'yyyy-MM-dd'),
    startTime: '10:00',
    endTime: '15:00'
  });
  const [availCheckResult, setAvailCheckResult] = useState(null);
  const [availCheckLoading, setAvailCheckLoading] = useState(false);

  // ---------------------------------------------------------------------------
  // TAB 3: EVENTS CATALOG STATE
  // ---------------------------------------------------------------------------
  const [events, setEvents] = useState([]);
  const [eventStatusFilter, setEventStatusFilter] = useState('ALL');
  const [eventTypeFilter, setEventTypeFilter] = useState('ALL');
  const [eventSearch, setEventSearch] = useState('');
  const [showEventModal, setShowEventModal] = useState(false);
  const [editingEventId, setEditingEventId] = useState(null);
  const [selectedEventDetailsModal, setSelectedEventDetailsModal] = useState(null);
  const [savingEvent, setSavingEvent] = useState(false);

  const [eventForm, setEventForm] = useState({
    title: '',
    slug: '',
    eventType: 'weddings',
    shortDescription: '',
    description: '',
    venue: '',
    startDate: '',
    endDate: '',
    startTime: '09:00',
    endTime: '17:00',
    minCapacity: 20,
    maxCapacity: 250,
    expectedGuestCount: 100,
    pricingModel: 'Fixed Package',
    basePrice: '',
    currency: 'LKR',
    status: 'PUBLISHED',
    featured: false,
    coverImage: '',
    galleryText: '',
    termsAndConditions: '',
    contactEmail: '',
    contactPhone: ''
  });

  // ---------------------------------------------------------------------------
  // TAB 4: VENUES & SPACES INVENTORY STATE
  // ---------------------------------------------------------------------------
  const [venues, setVenues] = useState([]);
  const [showVenueModal, setShowVenueModal] = useState(false);
  const [editingVenueId, setEditingVenueId] = useState(null);
  const [selectedVenueDetailsModal, setSelectedVenueDetailsModal] = useState(null);
  const [savingVenue, setSavingVenue] = useState(false);

  const [newPackageInput, setNewPackageInput] = useState({
    name: '',
    event: 'Weddings & occasions',
    includes: '',
    price: '',
    currency: 'LKR'
  });

  const [venueForm, setVenueForm] = useState({
    name: '',
    slug: '',
    hotel: 'Serendib Sanctuary · Flagship Property',
    type: 'Indoor',
    area: 250,
    min: 20,
    max: 200,
    location: 'Colombo, Sri Lanka',
    description: '',
    image: '',
    galleryText: '',
    facilitiesText: 'Air conditioning, Sound system, Stage & lighting, Wi-Fi, Dedicated parking',
    seatingText: 'Banquet, Theatre, Classroom, Reception, U-Shape',
    packages: [],
    isActive: true
  });

  // ---------------------------------------------------------------------------
  // KEYBOARD ACCESSIBILITY: ESCAPE KEY DISMISSES ACTIVE MODAL
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        if (destructiveModal) setDestructiveModal(null);
        else if (confirmActionModal) setConfirmActionModal(null);
        else if (actionPromptModal) setActionPromptModal(null);
        else if (selectedBookingModal) setSelectedBookingModal(null);
        else if (showEventModal) setShowEventModal(false);
        else if (selectedEventDetailsModal) setSelectedEventDetailsModal(null);
        else if (showVenueModal) setShowVenueModal(false);
        else if (selectedVenueDetailsModal) setSelectedVenueDetailsModal(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    destructiveModal,
    confirmActionModal,
    actionPromptModal,
    selectedBookingModal,
    showEventModal,
    selectedEventDetailsModal,
    showVenueModal,
    selectedVenueDetailsModal
  ]);

  // ---------------------------------------------------------------------------
  // INITIALIZATION & TAB SWITCHING
  // ---------------------------------------------------------------------------
  useEffect(() => {
    loadInitialData();
  }, []);

  useEffect(() => {
    if (activeTab === 'bookings') {
      loadBookings();
    } else if (activeTab === 'schedule') {
      loadScheduleBookings(scheduleDate);
    } else if (activeTab === 'events') {
      loadEvents();
    } else if (activeTab === 'venues') {
      loadVenues();
    }
  }, [activeTab]);

  useEffect(() => {
    if (activeTab === 'schedule') {
      loadScheduleBookings(scheduleDate);
    }
  }, [scheduleDate]);

  const loadInitialData = async () => {
    try {
      setLoading(true);
      await Promise.all([
        loadStats(), 
        loadBookings(), 
        loadVenues(), 
        loadEvents(),
        loadScheduleBookings(scheduleDate)
      ]);
    } catch (err) {
      console.error('Failed to load initial event data:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleManualRefresh = async () => {
    setRefreshing(true);
    try {
      await Promise.all([
        loadStats(), 
        loadBookings(), 
        loadVenues(), 
        loadEvents(),
        loadScheduleBookings(scheduleDate)
      ]);
      toast.success('All Events & Banquets data refreshed');
    } catch (err) {
      toast.error('Failed to refresh data');
    } finally {
      setRefreshing(false);
    }
  };

  const loadStats = async () => {
    try {
      const res = await eventAPI.getDashboardStats();
      setStats(res.data);
    } catch (err) {
      console.warn('Dashboard stats fetch notice:', err.message);
    }
  };

  const loadBookings = async (overrides = {}) => {
    try {
      const status = overrides.status !== undefined ? overrides.status : bookingStatusFilter;
      const venue = overrides.venue !== undefined ? overrides.venue : bookingVenueFilter;
      const eventType = overrides.eventType !== undefined ? overrides.eventType : bookingTypeFilter;
      const date = overrides.date !== undefined ? overrides.date : bookingDateFilter;
      const search = overrides.search !== undefined ? overrides.search : bookingSearch;

      const params = {};
      if (status !== 'ALL') params.status = status;
      if (venue !== 'ALL') params.venue = venue;
      if (eventType !== 'ALL') params.eventType = eventType;
      if (date) params.date = date;
      if (search && search.trim()) params.search = search.trim();

      const res = await eventAPI.getAdminBookings(params);
      setBookings(res.data || []);
      setBookingPage(1);
    } catch (err) {
      toast.error('Failed to load event bookings & enquiries');
    }
  };

  const loadScheduleBookings = async (targetDate) => {
    try {
      setScheduleLoading(true);
      // Fetch all bookings for the target date so schedule view is independent of table filters
      const res = await eventAPI.getAdminBookings({ date: targetDate });
      setScheduleBookings(res.data || []);
    } catch (err) {
      console.warn('Failed to load schedule bookings for date:', targetDate);
    } finally {
      setScheduleLoading(false);
    }
  };

  const loadEvents = async (overrides = {}) => {
    try {
      const status = overrides.status !== undefined ? overrides.status : eventStatusFilter;
      const eventType = overrides.eventType !== undefined ? overrides.eventType : eventTypeFilter;
      const search = overrides.search !== undefined ? overrides.search : eventSearch;

      const params = {};
      if (status !== 'ALL') params.status = status;
      if (eventType !== 'ALL') params.eventType = eventType;
      if (search && search.trim()) params.search = search.trim();

      const res = await eventAPI.getAdminEvents(params);
      setEvents(res.data || []);
    } catch (err) {
      toast.error('Failed to load events catalog');
    }
  };

  const loadVenues = async () => {
    try {
      const res = await eventAPI.getAdminVenues();
      setVenues(res.data || []);
    } catch (err) {
      toast.error('Failed to load venues');
    }
  };

  // ---------------------------------------------------------------------------
  // BOOKINGS: STATUS WORKFLOW & CONFLICT RESOLUTION
  // ---------------------------------------------------------------------------
  const handleUpdateBookingStatus = async (bookingId, newStatus, reasonText = '') => {
    setConflictErrorNotice(null);
    try {
      setStatusActionLoading(true);
      const payload = {
        status: newStatus,
        notes: statusUpdateNotes
      };
      if (newStatus === 'REJECTED') payload.rejectionReason = reasonText;
      if (newStatus === 'CANCELLED') payload.cancellationReason = reasonText;

      const res = await eventAPI.updateBookingStatus(bookingId, payload);
      toast.success(res.data?.message || `Booking status updated to ${newStatus}`);
      setSelectedBookingModal(null);
      setActionPromptModal(null);
      setConfirmActionModal(null);
      setStatusUpdateNotes('');
      await Promise.all([loadBookings(), loadStats(), loadScheduleBookings(scheduleDate)]);
    } catch (err) {
      if (err.response?.status === 409) {
        const conflictData = err.response.data;
        const confBooking = conflictData?.conflictingBooking;
        const notice = {
          message: conflictData?.error || 'Conflicting confirmed booking exists for this venue & slot.',
          details: confBooking 
            ? `Conflicting booking #${confBooking.confirmationNumber} (${confBooking.date} ${confBooking.startTime}–${confBooking.endTime}) — ${confBooking.customerName || 'Reserved'}`
            : null
        };
        setConflictErrorNotice(notice);
        toast.error('Schedule Conflict: This venue already has a confirmed booking for this slot.');
      } else {
        const msg = err.response?.data?.error || 'Failed to update booking status';
        toast.error(msg);
      }
    } finally {
      setStatusActionLoading(false);
    }
  };

  const handleSaveInternalNotesOnly = async () => {
    if (!selectedBookingModal) return;
    try {
      setStatusActionLoading(true);
      const res = await eventAPI.updateBookingStatus(selectedBookingModal._id, {
        status: selectedBookingModal.status,
        notes: statusUpdateNotes
      });
      toast.success('Internal staff notes saved successfully');
      setSelectedBookingModal(res.data?.booking || { ...selectedBookingModal, internalNotes: statusUpdateNotes });
      loadBookings();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to update notes');
    } finally {
      setStatusActionLoading(false);
    }
  };

  const handleOpenReasonPrompt = (type, booking) => {
    setActionPromptModal({
      type, // 'REJECT' | 'CANCEL'
      booking,
      reason: ''
    });
  };

  const handleSubmitReasonAction = () => {
    if (!actionPromptModal) return;
    const { type, booking, reason } = actionPromptModal;
    if (!reason.trim()) {
      toast.error(`Please provide a reason for ${type === 'REJECT' ? 'rejecting' : 'cancelling'} this booking`);
      return;
    }
    const newStatus = type === 'REJECT' ? 'REJECTED' : 'CANCELLED';
    handleUpdateBookingStatus(booking._id, newStatus, reason.trim());
  };

  // ---------------------------------------------------------------------------
  // EVENT CATALOG MANAGEMENT
  // ---------------------------------------------------------------------------
  const handleOpenCreateEvent = () => {
    setEditingEventId(null);
    setEventForm({
      title: '',
      slug: '',
      eventType: 'weddings',
      shortDescription: '',
      description: '',
      venue: venues.find(v => v.isActive)?._id || venues[0]?._id || '',
      startDate: format(new Date(), 'yyyy-MM-dd'),
      endDate: format(new Date(), 'yyyy-MM-dd'),
      startTime: '09:00',
      endTime: '17:00',
      minCapacity: 20,
      maxCapacity: 250,
      expectedGuestCount: 100,
      pricingModel: 'Fixed Package',
      basePrice: '',
      currency: 'LKR',
      status: 'PUBLISHED',
      featured: false,
      coverImage: 'https://images.unsplash.com/photo-1519167758481-83f550bb49b3?auto=format&fit=crop&w=1200&q=85',
      galleryText: '',
      termsAndConditions: 'Reservations require a 30% advance deposit. Final guest counts must be confirmed 7 days prior.',
      contactEmail: 'events@serendibsanctuary.lk',
      contactPhone: '+94 11 234 5685'
    });
    setShowEventModal(true);
  };

  const handleOpenEditEvent = (evt) => {
    setEditingEventId(evt._id);
    setEventForm({
      title: evt.title || '',
      slug: evt.slug || '',
      eventType: evt.eventType || 'weddings',
      shortDescription: evt.shortDescription || '',
      description: evt.description || '',
      venue: evt.venue?._id || evt.venue || '',
      startDate: evt.startDate || '',
      endDate: evt.endDate || '',
      startTime: evt.startTime || '09:00',
      endTime: evt.endTime || '17:00',
      minCapacity: evt.minCapacity || 10,
      maxCapacity: evt.maxCapacity || 200,
      expectedGuestCount: evt.expectedGuestCount || 50,
      pricingModel: evt.pricingModel || 'Fixed Package',
      basePrice: evt.basePrice || '',
      currency: evt.currency || 'LKR',
      status: evt.status || 'PUBLISHED',
      featured: Boolean(evt.featured),
      coverImage: evt.coverImage || '',
      galleryText: (evt.gallery || []).join('\n'),
      termsAndConditions: evt.termsAndConditions || '',
      contactEmail: evt.contactEmail || '',
      contactPhone: evt.contactPhone || ''
    });
    setShowEventModal(true);
  };

  const handleSaveEvent = async (e) => {
    e.preventDefault();
    if (!eventForm.title.trim()) {
      toast.error('Event title is required');
      return;
    }
    if (!eventForm.startDate) {
      toast.error('Event start date is required');
      return;
    }
    if (eventForm.endDate && eventForm.endDate < eventForm.startDate) {
      toast.error('End date cannot precede start date');
      return;
    }
    if (Number(eventForm.minCapacity) < 1 || Number(eventForm.maxCapacity) < 1) {
      toast.error('Capacities must be positive numbers');
      return;
    }
    if (Number(eventForm.minCapacity) > Number(eventForm.maxCapacity)) {
      toast.error('Minimum capacity cannot exceed maximum capacity');
      return;
    }
    if (Number(eventForm.basePrice) < 0) {
      toast.error('Price cannot be negative');
      return;
    }

    const payload = {
      ...eventForm,
      minCapacity: Number(eventForm.minCapacity),
      maxCapacity: Number(eventForm.maxCapacity),
      expectedGuestCount: Number(eventForm.expectedGuestCount),
      basePrice: Number(eventForm.basePrice) || 0,
      gallery: eventForm.galleryText
        ? eventForm.galleryText.split('\n').map(s => s.trim()).filter(Boolean)
        : []
    };

    try {
      setSavingEvent(true);
      if (editingEventId) {
        await eventAPI.updateEvent(editingEventId, payload);
        toast.success('Event updated successfully');
      } else {
        await eventAPI.createEvent(payload);
        toast.success('Event created successfully');
      }
      setShowEventModal(false);
      await Promise.all([loadEvents(), loadStats()]);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to save event');
    } finally {
      setSavingEvent(false);
    }
  };

  const handleTogglePublish = async (evtId) => {
    try {
      const res = await eventAPI.togglePublish(evtId);
      toast.success(res.data?.message || 'Event publish status updated');
      await Promise.all([loadEvents(), loadStats()]);
    } catch (err) {
      toast.error('Failed to update publish status');
    }
  };

  const handlePromptArchiveEvent = (evt) => {
    const isArchived = evt.status === 'ARCHIVED';
    setDestructiveModal({
      type: 'EVENT',
      item: evt,
      title: isArchived ? 'Delete Archived Event' : 'Archive Hotel Event',
      description: isArchived
        ? `Are you sure you want to permanently remove event "${evt.title}"?`
        : `Are you sure you want to archive event "${evt.title}"? Historical customer booking records referencing this event will remain completely intact.`
    });
  };

  // ---------------------------------------------------------------------------
  // VENUE AND HALL MANAGEMENT
  // ---------------------------------------------------------------------------
  const handleOpenCreateVenue = () => {
    setEditingVenueId(null);
    setVenueForm({
      name: '',
      slug: '',
      hotel: 'Serendib Sanctuary · Flagship Property',
      type: 'Indoor',
      area: 250,
      min: 20,
      max: 200,
      location: 'Colombo, Sri Lanka',
      description: '',
      image: 'https://images.unsplash.com/photo-1519167758481-83f550bb49b3?auto=format&fit=crop&w=1200&q=85',
      galleryText: '',
      facilitiesText: 'Air conditioning, Sound system, Stage & lighting, Wi-Fi, Dedicated parking',
      seatingText: 'Banquet, Theatre, Classroom, Reception, U-Shape',
      packages: [],
      isActive: true
    });
    setNewPackageInput({
      name: '',
      event: 'Weddings & occasions',
      includes: '',
      price: '',
      currency: 'LKR'
    });
    setShowVenueModal(true);
  };

  const handleOpenEditVenue = (v) => {
    setEditingVenueId(v._id);
    setVenueForm({
      name: v.name || '',
      slug: v.slug || '',
      hotel: v.hotel || 'Serendib Sanctuary · Flagship Property',
      type: v.type || 'Indoor',
      area: v.area || 100,
      min: v.min || 10,
      max: v.max || 100,
      location: v.location || 'Colombo, Sri Lanka',
      description: v.description || '',
      image: v.image || '',
      galleryText: (v.gallery || []).join('\n'),
      facilitiesText: (v.facilities || []).join(', '),
      seatingText: (v.seating || []).join(', '),
      packages: v.packages ? [...v.packages] : [],
      isActive: v.isActive !== false
    });
    setNewPackageInput({
      name: '',
      event: 'Weddings & occasions',
      includes: '',
      price: '',
      currency: 'LKR'
    });
    setShowVenueModal(true);
  };

  const handleAddVenuePackage = () => {
    if (!newPackageInput.name.trim()) {
      toast.error('Package name is required');
      return;
    }
    if (newPackageInput.price && Number(newPackageInput.price) < 0) {
      toast.error('Package price cannot be negative');
      return;
    }
    const pkg = {
      name: newPackageInput.name.trim(),
      event: newPackageInput.event.trim() || 'Weddings & occasions',
      includes: newPackageInput.includes.trim(),
      price: Number(newPackageInput.price) || 0,
      currency: newPackageInput.currency || 'LKR'
    };
    setVenueForm(prev => ({
      ...prev,
      packages: [...prev.packages, pkg]
    }));
    setNewPackageInput({
      name: '',
      event: 'Weddings & occasions',
      includes: '',
      price: '',
      currency: 'LKR'
    });
  };

  const handleRemoveVenuePackage = (index) => {
    setVenueForm(prev => ({
      ...prev,
      packages: prev.packages.filter((_, i) => i !== index)
    }));
  };

  const handleSaveVenue = async (e) => {
    e.preventDefault();
    if (!venueForm.name.trim()) {
      toast.error('Venue name is required');
      return;
    }
    if (!venueForm.max || Number(venueForm.max) <= 0) {
      toast.error('Valid maximum capacity is required');
      return;
    }
    if (venueForm.min && Number(venueForm.min) > Number(venueForm.max)) {
      toast.error('Minimum capacity cannot exceed maximum capacity');
      return;
    }

    const payload = {
      ...venueForm,
      area: Number(venueForm.area) || 100,
      min: Number(venueForm.min) || 1,
      max: Number(venueForm.max),
      facilities: venueForm.facilitiesText.split(',').map((s) => s.trim()).filter(Boolean),
      seating: venueForm.seatingText.split(',').map((s) => s.trim()).filter(Boolean),
      gallery: venueForm.galleryText
        ? venueForm.galleryText.split('\n').map((s) => s.trim()).filter(Boolean)
        : []
    };

    try {
      setSavingVenue(true);
      if (editingVenueId) {
        await eventAPI.updateVenue(editingVenueId, payload);
        toast.success('Venue updated successfully');
      } else {
        await eventAPI.createVenue(payload);
        toast.success('Venue created successfully');
      }
      setShowVenueModal(false);
      await Promise.all([loadVenues(), loadStats()]);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to save venue');
    } finally {
      setSavingVenue(false);
    }
  };

  const handleToggleVenueActive = async (v) => {
    if (!canManage) {
      toast.error('You do not have permission to modify venue status');
      return;
    }
    try {
      const newActive = !v.isActive;
      await eventAPI.updateVenue(v._id, { isActive: newActive });
      toast.success(`Venue "${v.name}" is now ${newActive ? 'Active' : 'Deactivated'}`);
      await Promise.all([loadVenues(), loadStats()]);
    } catch (err) {
      toast.error('Failed to change venue active state');
    }
  };

  const handlePromptDeleteVenue = (v) => {
    setDestructiveModal({
      type: 'VENUE',
      item: v,
      title: 'Deactivate / Remove Venue',
      description: `Are you sure you want to delete or deactivate "${v.name}"? Historical bookings referencing this venue will remain completely intact.`
    });
  };

  // Universal destructive execution
  const handleExecuteDestructiveAction = async () => {
    if (!destructiveModal) return;
    const { type, item } = destructiveModal;
    try {
      setDestructiveLoading(true);
      if (type === 'EVENT') {
        const res = await eventAPI.deleteEvent(item._id);
        toast.success(res.data?.message || 'Event status updated');
        await Promise.all([loadEvents(), loadStats()]);
      } else if (type === 'VENUE') {
        const res = await eventAPI.deleteVenue(item._id);
        toast.success(res.data?.message || 'Venue updated');
        await Promise.all([loadVenues(), loadStats()]);
      }
      setDestructiveModal(null);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to complete destructive action');
    } finally {
      setDestructiveLoading(false);
    }
  };

  // ---------------------------------------------------------------------------
  // TAB 2: SCHEDULE & LIVE AVAILABILITY CHECKER
  // ---------------------------------------------------------------------------
  const handleCheckLiveAvailability = async (e) => {
    e.preventDefault();
    if (!availCheckForm.date || !availCheckForm.startTime || !availCheckForm.endTime) {
      toast.error('Date, start time, and end time are required');
      return;
    }
    try {
      setAvailCheckLoading(true);
      setAvailCheckResult(null);
      const res = await eventAPI.checkAvailability({
        venueId: availCheckForm.venueId || undefined,
        date: availCheckForm.date,
        startTime: availCheckForm.startTime,
        endTime: availCheckForm.endTime
      });
      setAvailCheckResult(res.data);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Availability query failed');
    } finally {
      setAvailCheckLoading(false);
    }
  };

  const handleScheduleDateShift = (days) => {
    const current = new Date(`${scheduleDate}T00:00:00`);
    const shifted = days > 0 ? addDays(current, days) : subDays(current, Math.abs(days));
    const newDateStr = format(shifted, 'yyyy-MM-dd');
    setScheduleDate(newDateStr);
  };

  // Derived: Venue schedule map using scheduleBookings (completely independent of Tab 1 table filters)
  const venueScheduleData = useMemo(() => {
    return venues.map(venue => {
      // Find all bookings for this venue on scheduleDate
      const venueBookings = scheduleBookings.filter(b => {
        const matchVenue = (b.venue?._id === venue._id || b.venue === venue._id || b.venueName === venue.name);
        return matchVenue && b.date === scheduleDate;
      }).sort((a, b) => (a.startTime || '').localeCompare(b.startTime || ''));

      // Detect conflicts among confirmed bookings for this venue
      const conflicts = [];
      const confirmed = venueBookings.filter(b => b.status === 'CONFIRMED');
      for (let i = 0; i < confirmed.length; i++) {
        for (let j = i + 1; j < confirmed.length; j++) {
          const b1 = confirmed[i];
          const b2 = confirmed[j];
          if (b1.startTime < b2.endTime && b1.endTime > b2.startTime) {
            conflicts.push({ b1, b2 });
          }
        }
      }

      return {
        venue,
        bookings: venueBookings,
        conflicts
      };
    }).filter(item => {
      if (scheduleVenueFilter === 'ALL') return true;
      return item.venue._id === scheduleVenueFilter;
    });
  }, [venues, scheduleBookings, scheduleDate, scheduleVenueFilter]);

  // Derived: Pagination for bookings
  const paginatedBookings = useMemo(() => {
    const startIndex = (bookingPage - 1) * itemsPerPage;
    return bookings.slice(startIndex, startIndex + itemsPerPage);
  }, [bookings, bookingPage]);

  const totalBookingPages = Math.ceil(bookings.length / itemsPerPage) || 1;

  // ---------------------------------------------------------------------------
  // STATUS BADGE RENDERER
  // ---------------------------------------------------------------------------
  const getStatusBadge = (status) => {
    const s = (status || '').toUpperCase();
    switch (s) {
      case 'CONFIRMED':
        return <span className="pms-pill pms-pill-success"><FaCheck size={10} /> Confirmed</span>;
      case 'PENDING':
        return <span className="pms-pill pms-pill-warning"><FaClock size={10} /> Pending Review</span>;
      case 'CANCELLED':
        return <span className="pms-pill pms-pill-danger"><FaTimes size={10} /> Cancelled</span>;
      case 'REJECTED':
        return <span className="pms-pill pms-pill-danger"><FaTimes size={10} /> Rejected</span>;
      case 'COMPLETED':
        return <span className="pms-pill pms-pill-info"><FaCheckCircle size={10} /> Completed</span>;
      case 'PUBLISHED':
        return <span className="pms-pill pms-pill-success"><FaCheck size={10} /> Published</span>;
      case 'DRAFT':
        return <span className="pms-pill pms-pill-warning">Draft</span>;
      case 'ARCHIVED':
        return <span className="pms-pill pms-pill-secondary">Archived</span>;
      default:
        return <span className="pms-pill pms-pill-secondary">{status}</span>;
    }
  };

  return (
    <div className="pms-content-wrapper">
      {/* ===================================================================== */}
      {/* 1. PAGE HEADER */}
      {/* ===================================================================== */}
      <div className="pms-page-header">
        <div>
          <span className="pms-page-eyebrow">HOTEL BANQUET & BANQUET SUITE OPERATIONS</span>
          <h1 className="pms-page-title">Events & Banquets</h1>
          <p className="pms-page-subtitle">
            Manage hotel events, venues, customer enquiries, bookings, and event schedules from one place.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <button 
            type="button"
            className="pms-btn pms-btn-secondary"
            onClick={handleManualRefresh}
            disabled={refreshing}
            title="Refresh All Event Data"
          >
            <FaSync className={refreshing ? 'fa-spin' : ''} /> {refreshing ? 'Refreshing...' : 'Refresh'}
          </button>
          <button 
            type="button"
            className="pms-btn pms-btn-secondary"
            onClick={() => window.open('/events', '_blank')}
            title="Preview Customer Events Portal"
          >
            <FaExternalLinkAlt /> Customer View
          </button>
          {canManage && activeTab === 'events' && (
            <button type="button" className="pms-btn pms-btn-primary" onClick={handleOpenCreateEvent}>
              <FaPlus /> New Hotel Event
            </button>
          )}
          {canManage && activeTab === 'venues' && (
            <button type="button" className="pms-btn pms-btn-primary" onClick={handleOpenCreateVenue}>
              <FaPlus /> Add Venue / Hall
            </button>
          )}
        </div>
      </div>

      {/* ===================================================================== */}
      {/* 2. LIVE DASHBOARD STATISTICS (6 INTERACTIVE KPI CARDS) */}
      {/* ===================================================================== */}
      <div className="pms-stats-grid">
        {/* Card 1: Pending Enquiries */}
        <div 
          className={`pms-stat-card ${activeTab === 'bookings' && bookingStatusFilter === 'PENDING' ? 'active-filter' : ''}`}
          onClick={() => {
            setActiveTab('bookings');
            setBookingStatusFilter('PENDING');
            loadBookings({ status: 'PENDING' });
          }}
          title="Click to view all pending customer requests"
        >
          <div className="pms-stat-header">
            <span className="pms-stat-label">Pending Enquiries</span>
            <div className="pms-stat-icon pms-stat-icon-amber">
              <FaClock />
            </div>
          </div>
          <div className="pms-stat-value">{stats?.pendingBookings ?? 0}</div>
          <div className="pms-stat-footer">Awaiting staff review</div>
        </div>

        {/* Card 2: Confirmed Bookings */}
        <div 
          className={`pms-stat-card ${activeTab === 'bookings' && bookingStatusFilter === 'CONFIRMED' ? 'active-filter' : ''}`}
          onClick={() => {
            setActiveTab('bookings');
            setBookingStatusFilter('CONFIRMED');
            loadBookings({ status: 'CONFIRMED' });
          }}
          title="Click to view confirmed bookings"
        >
          <div className="pms-stat-header">
            <span className="pms-stat-label">Confirmed Bookings</span>
            <div className="pms-stat-icon pms-stat-icon-emerald">
              <FaCheckCircle />
            </div>
          </div>
          <div className="pms-stat-value">{stats?.confirmedBookings ?? 0}</div>
          <div className="pms-stat-footer">Locked on venue schedule</div>
        </div>

        {/* Card 3: Total Events */}
        <div 
          className={`pms-stat-card ${activeTab === 'events' && eventStatusFilter === 'ALL' ? 'active-filter' : ''}`}
          onClick={() => {
            setActiveTab('events');
            setEventStatusFilter('ALL');
            loadEvents({ status: 'ALL' });
          }}
          title="Click to open events catalog"
        >
          <div className="pms-stat-header">
            <span className="pms-stat-label">Total Events</span>
            <div className="pms-stat-icon pms-stat-icon-blue">
              <FaGlassCheers />
            </div>
          </div>
          <div className="pms-stat-value">{stats?.totalEvents ?? 0}</div>
          <div className="pms-stat-footer">Catalog items in hotel database</div>
        </div>

        {/* Card 4: Published Events */}
        <div 
          className={`pms-stat-card ${activeTab === 'events' && eventStatusFilter === 'PUBLISHED' ? 'active-filter' : ''}`}
          onClick={() => {
            setActiveTab('events');
            setEventStatusFilter('PUBLISHED');
            loadEvents({ status: 'PUBLISHED' });
          }}
          title="Click to view published events"
        >
          <div className="pms-stat-header">
            <span className="pms-stat-label">Published Events</span>
            <div className="pms-stat-icon pms-stat-icon-emerald">
              <FaCheck />
            </div>
          </div>
          <div className="pms-stat-value">{stats?.publishedEvents ?? 0}</div>
          <div className="pms-stat-footer">Visible to prospective guests</div>
        </div>

        {/* Card 5: Upcoming Events */}
        <div 
          className="pms-stat-card"
          onClick={() => {
            setActiveTab('events');
            setEventStatusFilter('PUBLISHED');
            loadEvents({ status: 'PUBLISHED' });
          }}
          title="Click to view upcoming events"
        >
          <div className="pms-stat-header">
            <span className="pms-stat-label">Upcoming Events</span>
            <div className="pms-stat-icon pms-stat-icon-indigo">
              <FaCalendarAlt />
            </div>
          </div>
          <div className="pms-stat-value">{stats?.upcomingEvents ?? 0}</div>
          <div className="pms-stat-footer">Scheduled from today onward</div>
        </div>

        {/* Card 6: Active Venues */}
        <div 
          className={`pms-stat-card ${activeTab === 'venues' ? 'active-filter' : ''}`}
          onClick={() => {
            setActiveTab('venues');
          }}
          title="Click to view venue inventory"
        >
          <div className="pms-stat-header">
            <span className="pms-stat-label">Active Venues</span>
            <div className="pms-stat-icon pms-stat-icon-indigo">
              <FaMapMarkerAlt />
            </div>
          </div>
          <div className="pms-stat-value">{stats?.totalVenues ?? 0}</div>
          <div className="pms-stat-footer">Available halls & banquet spaces</div>
        </div>
      </div>

      {/* ===================================================================== */}
      {/* 3. NAVIGATION TABS BAR */}
      {/* ===================================================================== */}
      <div className="pms-tabs-bar">
        <button
          type="button"
          className={`pms-tab-btn ${activeTab === 'bookings' ? 'active' : ''}`}
          onClick={() => setActiveTab('bookings')}
        >
          <FaUsers /> Customer Requests & Bookings ({bookings.length})
        </button>

        <button
          type="button"
          className={`pms-tab-btn ${activeTab === 'schedule' ? 'active' : ''}`}
          onClick={() => setActiveTab('schedule')}
        >
          <FaCalendarCheck /> Venue Schedule & Availability
        </button>

        <button
          type="button"
          className={`pms-tab-btn ${activeTab === 'events' ? 'active' : ''}`}
          onClick={() => setActiveTab('events')}
        >
          <FaGlassCheers /> Events Catalog ({events.length})
        </button>

        <button
          type="button"
          className={`pms-tab-btn ${activeTab === 'venues' ? 'active' : ''}`}
          onClick={() => setActiveTab('venues')}
        >
          <FaMapMarkerAlt /> Venues & Spaces ({venues.length})
        </button>
      </div>

      {/* ===================================================================== */}
      {/* TAB 1: CUSTOMER ENQUIRIES & BOOKING MANAGEMENT */}
      {/* ===================================================================== */}
      {activeTab === 'bookings' && (
        <div className="pms-card">
          {/* Multi-Parameter Filters Toolbar */}
          <div className="pms-card-header">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
              <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flex: '1 1 320px' }}>
                <div className="pms-search-box" style={{ width: '100%' }}>
                  <FaSearch className="pms-search-icon" />
                  <input
                    type="text"
                    placeholder="Search customer name, email, phone, reference..."
                    value={bookingSearch}
                    onChange={(e) => setBookingSearch(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') loadBookings({ search: e.target.value });
                    }}
                  />
                </div>
                <button 
                  type="button" 
                  className="pms-btn pms-btn-secondary" 
                  onClick={() => loadBookings({ search: bookingSearch })}
                >
                  Search
                </button>
              </div>

              <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
                {/* Status Filter */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <span style={{ fontSize: '0.8rem', color: '#64748B', fontWeight: 600 }}>Status:</span>
                  <select
                    className="pms-select"
                    value={bookingStatusFilter}
                    onChange={(e) => {
                      const val = e.target.value;
                      setBookingStatusFilter(val);
                      loadBookings({ status: val });
                    }}
                    style={{ minWidth: '130px' }}
                  >
                    <option value="ALL">All Statuses</option>
                    <option value="PENDING">Pending Review</option>
                    <option value="CONFIRMED">Confirmed</option>
                    <option value="COMPLETED">Completed</option>
                    <option value="CANCELLED">Cancelled</option>
                    <option value="REJECTED">Rejected</option>
                  </select>
                </div>

                {/* Venue Filter */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <span style={{ fontSize: '0.8rem', color: '#64748B', fontWeight: 600 }}>Venue:</span>
                  <select
                    className="pms-select"
                    value={bookingVenueFilter}
                    onChange={(e) => {
                      const val = e.target.value;
                      setBookingVenueFilter(val);
                      loadBookings({ venue: val });
                    }}
                    style={{ minWidth: '140px' }}
                  >
                    <option value="ALL">All Venues</option>
                    {venues.map(v => (
                      <option key={v._id} value={v._id}>{v.name}</option>
                    ))}
                  </select>
                </div>

                {/* Category Filter */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <span style={{ fontSize: '0.8rem', color: '#64748B', fontWeight: 600 }}>Type:</span>
                  <select
                    className="pms-select"
                    value={bookingTypeFilter}
                    onChange={(e) => {
                      const val = e.target.value;
                      setBookingTypeFilter(val);
                      loadBookings({ eventType: val });
                    }}
                    style={{ minWidth: '130px' }}
                  >
                    <option value="ALL">All Types</option>
                    <option value="weddings">Weddings</option>
                    <option value="corporate">Corporate</option>
                    <option value="office-parties">Office Parties</option>
                    <option value="private-celebrations">Celebrations</option>
                    <option value="banquet">Banquet & Gala</option>
                    <option value="entertainment">Entertainment</option>
                  </select>
                </div>

                {/* Date Filter */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <span style={{ fontSize: '0.8rem', color: '#64748B', fontWeight: 600 }}>Date:</span>
                  <input
                    type="date"
                    className="pms-input"
                    value={bookingDateFilter}
                    onChange={(e) => {
                      const val = e.target.value;
                      setBookingDateFilter(val);
                      loadBookings({ date: val });
                    }}
                    style={{ padding: '0.35rem 0.5rem', fontSize: '0.85rem' }}
                  />
                </div>

                {(bookingStatusFilter !== 'ALL' || bookingVenueFilter !== 'ALL' || bookingTypeFilter !== 'ALL' || bookingDateFilter || bookingSearch) && (
                  <button
                    type="button"
                    className="pms-btn pms-btn-sm pms-btn-secondary"
                    onClick={() => {
                      setBookingStatusFilter('ALL');
                      setBookingVenueFilter('ALL');
                      setBookingTypeFilter('ALL');
                      setBookingDateFilter('');
                      setBookingSearch('');
                      loadBookings({ status: 'ALL', venue: 'ALL', eventType: 'ALL', date: '', search: '' });
                    }}
                  >
                    Reset
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Bookings Table */}
          <div className="pms-table-container">
            <table className="pms-table">
              <thead>
                <tr>
                  <th>Confirmation Ref</th>
                  <th>Customer</th>
                  <th>Event Type</th>
                  <th>Venue</th>
                  <th>Requested Date & Slot</th>
                  <th>Guests</th>
                  <th>Package / Price</th>
                  <th>Status</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {bookings.length === 0 ? (
                  <tr>
                    <td colSpan="9" style={{ textAlign: 'center', padding: '3.5rem', color: '#64748B' }}>
                      <FaInfoCircle size={28} style={{ marginBottom: '0.5rem', color: '#94A3B8' }} />
                      <div>No booking requests or enquiries match the specified filters.</div>
                    </td>
                  </tr>
                ) : (
                  paginatedBookings.map((b) => (
                    <tr key={b._id}>
                      <td>
                        <strong style={{ color: 'var(--evt-brass)', letterSpacing: '0.02em' }}>
                          {b.confirmationNumber}
                        </strong>
                        <div style={{ fontSize: '0.75rem', color: '#94A3B8' }}>
                          {format(new Date(b.createdAt), 'MMM d, yyyy')}
                        </div>
                      </td>
                      <td>
                        <strong style={{ color: '#0F172A' }}>{b.customerName}</strong>
                        <div style={{ fontSize: '0.8rem', color: '#64748B' }}>{b.email}</div>
                        <div style={{ fontSize: '0.8rem', color: '#64748B' }}>{b.phone}</div>
                      </td>
                      <td>
                        <span style={{ textTransform: 'capitalize', fontWeight: 500 }}>
                          {b.eventType?.replace('-', ' ')}
                        </span>
                        {b.event?.title && (
                          <div style={{ fontSize: '0.75rem', color: '#64748B' }}>
                            Ref: {b.event.title}
                          </div>
                        )}
                      </td>
                      <td>
                        <strong>{b.venue?.name || b.venueName || 'Unassigned'}</strong>
                        {b.venue?.isActive === false && (
                          <div style={{ fontSize: '0.7rem', color: '#DC2626' }}>⚠️ Inactive Venue</div>
                        )}
                      </td>
                      <td>
                        <div style={{ fontWeight: 600 }}>{b.date}</div>
                        <small style={{ color: '#64748B' }}>
                          {b.startTime} – {b.endTime}
                        </small>
                      </td>
                      <td>
                        <strong>{b.guestCount}</strong>
                      </td>
                      <td>
                        {b.selectedPackage && (
                          <div style={{ fontSize: '0.8rem', fontWeight: 600, color: '#334155' }}>
                            <FaTag size={10} style={{ marginRight: '3px' }} /> {b.selectedPackage}
                          </div>
                        )}
                        {b.estimatedPrice > 0 ? (
                          <div style={{ fontSize: '0.8rem', color: '#16A34A', fontWeight: 600 }}>
                            Rs. {Number(b.estimatedPrice).toLocaleString()}
                          </div>
                        ) : (
                          <div style={{ fontSize: '0.75rem', color: '#94A3B8' }}>Price upon quotation</div>
                        )}
                      </td>
                      <td>{getStatusBadge(b.status)}</td>
                      <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <button
                          type="button"
                          className="pms-btn pms-btn-sm pms-btn-secondary"
                          onClick={() => {
                            setSelectedBookingModal(b);
                            setStatusUpdateNotes(b.internalNotes || '');
                            setConflictErrorNotice(null);
                          }}
                          title="View Full Details & Manage Status"
                          style={{ marginRight: '0.35rem' }}
                        >
                          <FaEye /> Review
                        </button>
                        {canManage && b.status === 'PENDING' && (
                          <>
                            <button
                              type="button"
                              className="pms-btn pms-btn-sm pms-btn-primary"
                              onClick={() => {
                                setConflictErrorNotice(null);
                                setConfirmActionModal({ type: 'CONFIRMED', booking: b });
                              }}
                              title="Confirm Request & Lock Venue"
                              style={{ marginRight: '0.35rem' }}
                            >
                              <FaCheck /> Confirm
                            </button>
                            <button
                              type="button"
                              className="pms-btn pms-btn-sm pms-btn-danger"
                              onClick={() => handleOpenReasonPrompt('REJECT', b)}
                              title="Reject Request"
                            >
                              <FaTimes />
                            </button>
                          </>
                        )}
                        {canManage && b.status === 'CONFIRMED' && (
                          <button
                            type="button"
                            className="pms-btn pms-btn-sm pms-btn-primary"
                            onClick={() => {
                              setConflictErrorNotice(null);
                              setConfirmActionModal({ type: 'COMPLETED', booking: b });
                            }}
                            title="Mark Completed"
                          >
                            <FaCheckCircle /> Complete
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination Controls */}
          {totalBookingPages > 1 && (
            <div 
              style={{ 
                display: 'flex', 
                justifyContent: 'space-between', 
                alignItems: 'center', 
                padding: '0.75rem 1.5rem', 
                borderTop: '1px solid #E2E8F0',
                background: '#F8FAFC'
              }}
            >
              <span style={{ fontSize: '0.85rem', color: '#64748B' }}>
                Showing {(bookingPage - 1) * itemsPerPage + 1}–{Math.min(bookingPage * itemsPerPage, bookings.length)} of {bookings.length} requests
              </span>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <button
                  type="button"
                  className="pms-btn pms-btn-sm pms-btn-secondary"
                  disabled={bookingPage <= 1}
                  onClick={() => setBookingPage(prev => Math.max(1, prev - 1))}
                >
                  <FaChevronLeft size={10} /> Previous
                </button>
                <span style={{ fontSize: '0.85rem', fontWeight: 600, padding: '0 0.5rem' }}>
                  {bookingPage} / {totalBookingPages}
                </span>
                <button
                  type="button"
                  className="pms-btn pms-btn-sm pms-btn-secondary"
                  disabled={bookingPage >= totalBookingPages}
                  onClick={() => setBookingPage(prev => Math.min(totalBookingPages, prev + 1))}
                >
                  Next <FaChevronRight size={10} />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ===================================================================== */}
      {/* TAB 2: VENUE SCHEDULE & AVAILABILITY VISIBILITY */}
      {/* ===================================================================== */}
      {activeTab === 'schedule' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {/* Schedule Controls Header */}
          <div className="pms-card" style={{ padding: '1.25rem 1.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.1rem', color: '#0F172A' }}>
                  Daily Venue Master Schedule
                </h3>
                <p style={{ margin: '0.2rem 0 0', fontSize: '0.85rem', color: '#64748B' }}>
                  View scheduled banquets, reserved time slots, and verify venue availability.
                </p>
              </div>

              <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
                {/* Date Controls with Quick Shift */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  <button 
                    type="button" 
                    className="pms-btn pms-btn-sm pms-btn-secondary"
                    onClick={() => handleScheduleDateShift(-1)}
                    title="Previous Day"
                  >
                    <FaArrowLeft size={10} />
                  </button>
                  <input
                    type="date"
                    className="pms-input"
                    value={scheduleDate}
                    onChange={(e) => setScheduleDate(e.target.value)}
                    style={{ padding: '0.4rem 0.65rem' }}
                  />
                  <button 
                    type="button" 
                    className="pms-btn pms-btn-sm pms-btn-secondary"
                    onClick={() => handleScheduleDateShift(1)}
                    title="Next Day"
                  >
                    <FaArrowRight size={10} />
                  </button>
                  <button 
                    type="button" 
                    className="pms-btn pms-btn-sm pms-btn-secondary"
                    onClick={() => setScheduleDate(format(new Date(), 'yyyy-MM-dd'))}
                  >
                    Today
                  </button>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <label style={{ fontSize: '0.85rem', fontWeight: 600, color: '#475569' }}>Filter Venue:</label>
                  <select
                    className="pms-select"
                    value={scheduleVenueFilter}
                    onChange={(e) => setScheduleVenueFilter(e.target.value)}
                  >
                    <option value="ALL">All Venues & Halls</option>
                    {venues.map(v => (
                      <option key={v._id} value={v._id}>{v.name}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          </div>

          {/* Interactive Live Conflict / Availability Checker Tool */}
          <div className="pms-card" style={{ padding: '1.25rem 1.5rem', background: '#F8FAFC', border: '1px solid #CBD5E1' }}>
            <h4 style={{ margin: '0 0 0.75rem 0', fontSize: '0.95rem', color: '#1E293B', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <FaClock style={{ color: 'var(--evt-brass)' }} /> Instant Venue Conflict & Availability Verification
            </h4>
            <form onSubmit={handleCheckLiveAvailability} style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <div style={{ flex: '1 1 200px' }}>
                <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748B' }}>Venue</label>
                <select
                  className="pms-select"
                  value={availCheckForm.venueId}
                  onChange={(e) => setAvailCheckForm({ ...availCheckForm, venueId: e.target.value })}
                  required
                >
                  <option value="">Select a venue...</option>
                  {venues.map(v => (
                    <option key={v._id} value={v._id}>{v.name} ({v.type}) {!v.isActive ? '(Inactive)' : ''}</option>
                  ))}
                </select>
              </div>

              <div style={{ flex: '1 1 140px' }}>
                <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748B' }}>Date</label>
                <input
                  type="date"
                  className="pms-input"
                  value={availCheckForm.date}
                  onChange={(e) => setAvailCheckForm({ ...availCheckForm, date: e.target.value })}
                  required
                />
              </div>

              <div style={{ flex: '1 1 110px' }}>
                <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748B' }}>Start Time</label>
                <input
                  type="time"
                  className="pms-input"
                  value={availCheckForm.startTime}
                  onChange={(e) => setAvailCheckForm({ ...availCheckForm, startTime: e.target.value })}
                  required
                />
              </div>

              <div style={{ flex: '1 1 110px' }}>
                <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748B' }}>End Time</label>
                <input
                  type="time"
                  className="pms-input"
                  value={availCheckForm.endTime}
                  onChange={(e) => setAvailCheckForm({ ...availCheckForm, endTime: e.target.value })}
                  required
                />
              </div>

              <button
                type="submit"
                className="pms-btn pms-btn-primary"
                disabled={availCheckLoading}
                style={{ height: '38px', padding: '0 1.25rem' }}
              >
                {availCheckLoading ? 'Verifying...' : 'Check Availability'}
              </button>
            </form>

            {availCheckResult && (
              <div 
                style={{ 
                  marginTop: '1rem', 
                  padding: '0.85rem 1.15rem', 
                  borderRadius: '6px',
                  background: availCheckResult.available ? '#DCFCE7' : '#FEE2E2',
                  border: `1px solid ${availCheckResult.available ? '#86EFAC' : '#FCA5A5'}`,
                  color: availCheckResult.available ? '#166534' : '#991B1B',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.75rem'
                }}
              >
                {availCheckResult.available ? (
                  <FaCheckCircle size={18} />
                ) : (
                  <FaExclamationTriangle size={18} />
                )}
                <div>
                  <strong>{availCheckResult.available ? 'Space is Available!' : 'Conflict Detected!'}</strong>
                  <div style={{ fontSize: '0.85rem' }}>{availCheckResult.message}</div>
                </div>
              </div>
            )}
          </div>

          {/* Venue Timeline Cards */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            {scheduleLoading ? (
              <div className="pms-card" style={{ padding: '3rem', textAlign: 'center', color: '#64748B' }}>
                <div style={{ display: 'inline-block', marginBottom: '0.5rem' }}>Loading venue schedule...</div>
              </div>
            ) : venueScheduleData.length === 0 ? (
              <div className="pms-card" style={{ padding: '3rem', textAlign: 'center', color: '#64748B' }}>
                No venues configured matching the criteria.
              </div>
            ) : (
              venueScheduleData.map(({ venue, bookings: vBookings, conflicts }) => (
                <div key={venue._id} className="pms-card" style={{ padding: '1.25rem 1.5rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #F1F5F9', paddingBottom: '0.75rem', marginBottom: '1rem' }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                        <h4 style={{ margin: 0, fontSize: '1.1rem', color: '#0F172A' }}>{venue.name}</h4>
                        <span className="pms-pill pms-pill-secondary">{venue.type}</span>
                        {venue.isActive ? (
                          <span className="pms-pill pms-pill-success">Active</span>
                        ) : (
                          <span className="pms-pill pms-pill-danger">Inactive</span>
                        )}
                      </div>
                      <div style={{ fontSize: '0.8rem', color: '#64748B', marginTop: '0.2rem' }}>
                        Max Capacity: {venue.max} guests &bull; {venue.location}
                      </div>
                    </div>

                    <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#475569' }}>
                      {vBookings.length} {vBookings.length === 1 ? 'Slot' : 'Slots'} Scheduled on {scheduleDate}
                    </div>
                  </div>

                  {/* Conflict Banner if any overlapping confirmed bookings */}
                  {conflicts.length > 0 && (
                    <div 
                      style={{ 
                        marginBottom: '1rem', 
                        padding: '0.75rem 1rem', 
                        background: '#FEF2F2', 
                        border: '1px solid #F87171', 
                        borderRadius: '6px', 
                        color: '#991B1B',
                        fontSize: '0.85rem'
                      }}
                    >
                      <strong style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <FaExclamationTriangle /> Critical Schedule Warning: Confirmed Overlap Detected!
                      </strong>
                      {conflicts.map((c, i) => (
                        <div key={i} style={{ marginTop: '0.25rem' }}>
                          Overlap between <strong>{c.b1.confirmationNumber}</strong> ({c.b1.startTime}–{c.b1.endTime}) and <strong>{c.b2.confirmationNumber}</strong> ({c.b2.startTime}–{c.b2.endTime})
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Scheduled Slots for Venue */}
                  {vBookings.length === 0 ? (
                    <div style={{ padding: '1.5rem', background: '#F8FAFC', borderRadius: '6px', textAlign: 'center', color: '#94A3B8', fontSize: '0.9rem' }}>
                      No banquet bookings or enquiries scheduled for {venue.name} on {scheduleDate}.
                    </div>
                  ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '0.85rem' }}>
                      {vBookings.map(b => (
                        <div 
                          key={b._id}
                          style={{
                            border: `1px solid ${b.status === 'CONFIRMED' ? '#86EFAC' : '#CBD5E1'}`,
                            borderRadius: '8px',
                            background: b.status === 'CONFIRMED' ? '#F0FDF4' : '#FFFFFF',
                            padding: '0.85rem 1rem',
                            display: 'flex',
                            flexDirection: 'column',
                            justifyContent: 'space-between',
                            gap: '0.5rem'
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <div>
                              <strong style={{ color: 'var(--evt-brass)', fontSize: '0.85rem' }}>
                                {b.confirmationNumber}
                              </strong>
                              <div style={{ fontWeight: 600, fontSize: '0.95rem', color: '#0F172A' }}>
                                {b.customerName}
                              </div>
                              <div style={{ fontSize: '0.8rem', color: '#64748B', textTransform: 'capitalize' }}>
                                {b.eventType} &bull; {b.guestCount} guests
                              </div>
                            </div>
                            <div>{getStatusBadge(b.status)}</div>
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem', fontWeight: 600, color: '#334155' }}>
                            <FaClock size={12} style={{ color: 'var(--evt-brass)' }} />
                            <span>{b.startTime} – {b.endTime}</span>
                          </div>

                          <div style={{ borderTop: '1px solid #E2E8F0', paddingTop: '0.5rem', display: 'flex', justifyContent: 'flex-end' }}>
                            <button
                              type="button"
                              className="pms-btn pms-btn-sm pms-btn-secondary"
                              onClick={() => {
                                setSelectedBookingModal(b);
                                setStatusUpdateNotes(b.internalNotes || '');
                                setConflictErrorNotice(null);
                              }}
                            >
                              <FaEye /> View Request
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* TAB 3: HOTEL EVENTS CATALOG */}
      {/* ===================================================================== */}
      {activeTab === 'events' && (
        <div className="pms-card">
          <div className="pms-card-header" style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flex: '1 1 300px' }}>
              <div className="pms-search-box" style={{ width: '100%' }}>
                <FaSearch className="pms-search-icon" />
                <input
                  type="text"
                  placeholder="Search events by title or description..."
                  value={eventSearch}
                  onChange={(e) => setEventSearch(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') loadEvents({ search: e.target.value });
                  }}
                />
              </div>
              <button 
                type="button" 
                className="pms-btn pms-btn-secondary" 
                onClick={() => loadEvents({ search: eventSearch })}
              >
                Search
              </button>
            </div>

            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <span style={{ fontSize: '0.8rem', color: '#64748B', fontWeight: 600 }}>Status:</span>
                <select
                  className="pms-select"
                  value={eventStatusFilter}
                  onChange={(e) => {
                    const val = e.target.value;
                    setEventStatusFilter(val);
                    loadEvents({ status: val });
                  }}
                >
                  <option value="ALL">All Statuses</option>
                  <option value="PUBLISHED">Published</option>
                  <option value="DRAFT">Draft</option>
                  <option value="CANCELLED">Cancelled</option>
                  <option value="COMPLETED">Completed</option>
                  <option value="ARCHIVED">Archived</option>
                </select>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <span style={{ fontSize: '0.8rem', color: '#64748B', fontWeight: 600 }}>Category:</span>
                <select
                  className="pms-select"
                  value={eventTypeFilter}
                  onChange={(e) => {
                    const val = e.target.value;
                    setEventTypeFilter(val);
                    loadEvents({ eventType: val });
                  }}
                >
                  <option value="ALL">All Categories</option>
                  <option value="weddings">Weddings</option>
                  <option value="corporate">Corporate</option>
                  <option value="office-parties">Office Parties</option>
                  <option value="private-celebrations">Celebrations</option>
                  <option value="banquet">Banquet & Gala</option>
                  <option value="entertainment">Entertainment</option>
                </select>
              </div>
            </div>
          </div>

          <div className="pms-table-container">
            <table className="pms-table">
              <thead>
                <tr>
                  <th>Event Title & Preview</th>
                  <th>Category</th>
                  <th>Venue</th>
                  <th>Date & Timings</th>
                  <th>Capacity</th>
                  <th>Pricing</th>
                  <th>Status</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {events.length === 0 ? (
                  <tr>
                    <td colSpan="8" style={{ textAlign: 'center', padding: '3.5rem', color: '#64748B' }}>
                      <FaInfoCircle size={28} style={{ marginBottom: '0.5rem', color: '#94A3B8' }} />
                      <div>No events found matching filters. Click "+ New Hotel Event" to create one.</div>
                    </td>
                  </tr>
                ) : (
                  events.map((evt) => (
                    <tr key={evt._id}>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                          {evt.coverImage && (
                            <img 
                              src={evt.coverImage} 
                              alt="" 
                              style={{ width: '44px', height: '44px', borderRadius: '6px', objectFit: 'cover' }} 
                            />
                          )}
                          <div>
                            <strong>{evt.title}</strong>
                            {evt.featured && (
                              <span style={{ marginLeft: '0.5rem', fontSize: '0.68rem', fontWeight: 700, padding: '0.1rem 0.4rem', background: '#FEF3C7', color: '#92400E', borderRadius: '4px' }}>
                                FEATURED
                              </span>
                            )}
                            <div style={{ fontSize: '0.8rem', color: '#64748B', maxWidth: '280px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {evt.shortDescription || evt.description}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td>
                        <span style={{ textTransform: 'capitalize', fontWeight: 500 }}>{evt.eventType}</span>
                      </td>
                      <td>{evt.venue?.name || 'General Space'}</td>
                      <td>
                        <div style={{ fontWeight: 600 }}>{evt.startDate}</div>
                        <small style={{ color: '#64748B' }}>{evt.startTime} – {evt.endTime}</small>
                      </td>
                      <td>
                        <div>{evt.minCapacity}–{evt.maxCapacity} guests</div>
                        <small style={{ color: '#64748B' }}>Exp: {evt.expectedGuestCount}</small>
                      </td>
                      <td>
                        {evt.basePrice > 0 ? (
                          <div>
                            <strong>Rs. {Number(evt.basePrice).toLocaleString()}</strong>
                            <div style={{ fontSize: '0.75rem', color: '#64748B' }}>{evt.pricingModel}</div>
                          </div>
                        ) : (
                          <span style={{ color: '#16A34A', fontWeight: 600 }}>Complimentary / Free</span>
                        )}
                      </td>
                      <td>{getStatusBadge(evt.status)}</td>
                      <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <button
                          type="button"
                          className="pms-btn pms-btn-sm pms-btn-secondary"
                          onClick={() => setSelectedEventDetailsModal(evt)}
                          title="View Full Event Details"
                          style={{ marginRight: '0.35rem' }}
                        >
                          <FaEye />
                        </button>
                        <button
                          type="button"
                          className="pms-btn pms-btn-sm pms-btn-secondary"
                          onClick={() => window.open('/events', '_blank')}
                          title="Preview Customer Page"
                          style={{ marginRight: '0.35rem' }}
                        >
                          <FaExternalLinkAlt />
                        </button>
                        {canManage && (
                          <>
                            <button
                              type="button"
                              className="pms-btn pms-btn-sm pms-btn-secondary"
                              onClick={() => handleTogglePublish(evt._id)}
                              title="Toggle Draft/Publish"
                              style={{ marginRight: '0.35rem' }}
                            >
                              {evt.status === 'PUBLISHED' ? 'Unpublish' : 'Publish'}
                            </button>
                            <button
                              type="button"
                              className="pms-btn pms-btn-sm pms-btn-secondary"
                              onClick={() => handleOpenEditEvent(evt)}
                              title="Edit Event Details"
                              style={{ marginRight: '0.35rem' }}
                            >
                              <FaEdit />
                            </button>
                          </>
                        )}
                        {canDelete && (
                          <button
                            type="button"
                            className="pms-btn pms-btn-sm pms-btn-danger"
                            onClick={() => handlePromptArchiveEvent(evt)}
                            title="Archive/Delete Event"
                          >
                            <FaTrash />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* TAB 4: VENUES & SPACES INVENTORY */}
      {/* ===================================================================== */}
      {activeTab === 'venues' && (
        <div className="pms-card">
          <div className="pms-table-container">
            <table className="pms-table">
              <thead>
                <tr>
                  <th>Venue Name & Property</th>
                  <th>Type</th>
                  <th>Floor Area</th>
                  <th>Capacity (Min - Max)</th>
                  <th>Facilities</th>
                  <th>Seating Styles</th>
                  <th>Upcoming Bookings</th>
                  <th>Status</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {venues.length === 0 ? (
                  <tr>
                    <td colSpan="9" style={{ textAlign: 'center', padding: '3.5rem', color: '#64748B' }}>
                      <FaInfoCircle size={28} style={{ marginBottom: '0.5rem', color: '#94A3B8' }} />
                      <div>No banquet halls or event venues found. Click "+ Add Venue / Hall" to create one.</div>
                    </td>
                  </tr>
                ) : (
                  venues.map((v) => {
                    const upcomingCount = bookings.filter(b => 
                      (b.venue?._id === v._id || b.venue === v._id || b.venueName === v.name) && 
                      b.status === 'CONFIRMED'
                    ).length;

                    return (
                      <tr key={v._id}>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                            {v.image && (
                              <img 
                                src={v.image} 
                                alt="" 
                                style={{ width: '44px', height: '44px', borderRadius: '6px', objectFit: 'cover' }} 
                              />
                            )}
                            <div>
                              <strong>{v.name}</strong>
                              <div style={{ fontSize: '0.75rem', color: '#64748B' }}>{v.hotel || 'Flagship Hotel'}</div>
                              <div style={{ fontSize: '0.75rem', color: '#94A3B8' }}>{v.location}</div>
                            </div>
                          </div>
                        </td>
                        <td>
                          <span className="pms-pill pms-pill-secondary">{v.type}</span>
                        </td>
                        <td>{v.area} m²</td>
                        <td>
                          <strong>{v.min}–{v.max}</strong> guests
                        </td>
                        <td>
                          <div style={{ maxWidth: '200px', fontSize: '0.8rem', color: '#475569' }}>
                            {(v.facilities || []).slice(0, 3).join(', ')}
                            {(v.facilities || []).length > 3 && '...'}
                          </div>
                        </td>
                        <td>
                          <div style={{ maxWidth: '180px', fontSize: '0.8rem', color: '#475569' }}>
                            {(v.seating || []).slice(0, 3).join(', ')}
                          </div>
                        </td>
                        <td>
                          <span style={{ fontWeight: 600, color: upcomingCount > 0 ? '#16A34A' : '#64748B' }}>
                            {upcomingCount} confirmed
                          </span>
                        </td>
                        <td>
                          <button
                            type="button"
                            onClick={() => handleToggleVenueActive(v)}
                            disabled={!canManage}
                            style={{ 
                              background: 'none', 
                              border: 'none', 
                              cursor: canManage ? 'pointer' : 'default', 
                              padding: 0,
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '0.35rem'
                            }}
                            title={canManage ? "Click to toggle active status" : "Staff with management permissions can toggle status"}
                          >
                            {v.isActive ? (
                              <span className="pms-pill pms-pill-success">
                                <FaToggleOn size={14} /> Active
                              </span>
                            ) : (
                              <span className="pms-pill pms-pill-secondary">
                                <FaToggleOff size={14} /> Inactive
                              </span>
                            )}
                          </button>
                        </td>
                        <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                          <button
                            type="button"
                            className="pms-btn pms-btn-sm pms-btn-secondary"
                            onClick={() => setSelectedVenueDetailsModal(v)}
                            title="View Venue Details & Upcoming Bookings"
                            style={{ marginRight: '0.35rem' }}
                          >
                            <FaEye />
                          </button>
                          {canManage && (
                            <button
                              type="button"
                              className="pms-btn pms-btn-sm pms-btn-secondary"
                              onClick={() => handleOpenEditVenue(v)}
                              title="Edit Venue"
                              style={{ marginRight: '0.35rem' }}
                            >
                              <FaEdit />
                            </button>
                          )}
                          {canDelete && (
                            <button
                              type="button"
                              className="pms-btn pms-btn-sm pms-btn-danger"
                              onClick={() => handlePromptDeleteVenue(v)}
                              title="Deactivate / Delete Venue"
                            >
                              <FaTrash />
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL 1: BOOKING REVIEW, REQUIREMENTS & AUDIT TRAIL */}
      {/* ===================================================================== */}
      {selectedBookingModal && (
        <div 
          className="pms-modal-backdrop" 
          onClick={(e) => {
            if (e.target === e.currentTarget && !statusActionLoading) {
              setSelectedBookingModal(null);
            }
          }}
          role="dialog"
          aria-modal="true"
        >
          <div className="pms-modal-dialog" style={{ maxWidth: '750px' }}>
            <div className="pms-modal-header">
              <div>
                <h3 style={{ margin: 0 }}>
                  Event Request Details &bull; {selectedBookingModal.confirmationNumber}
                </h3>
                <small style={{ color: '#64748B' }}>
                  Received on {format(new Date(selectedBookingModal.createdAt), 'MMMM d, yyyy · HH:mm')}
                </small>
              </div>
              <button
                type="button"
                className="pms-modal-close"
                onClick={() => setSelectedBookingModal(null)}
              >
                &times;
              </button>
            </div>

            <div className="pms-modal-body" style={{ maxHeight: '72vh', overflowY: 'auto' }}>
              {/* Conflict Error Notice inside Modal */}
              {conflictErrorNotice && (
                <div style={{ marginBottom: '1.25rem', padding: '0.85rem 1rem', background: '#FEE2E2', border: '1px solid #F87171', borderRadius: '6px', color: '#991B1B' }}>
                  <div style={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <FaExclamationTriangle /> {conflictErrorNotice.message}
                  </div>
                  {conflictErrorNotice.details && (
                    <div style={{ fontSize: '0.85rem', marginTop: '0.25rem' }}>
                      {conflictErrorNotice.details}
                    </div>
                  )}
                </div>
              )}

              {/* Summary Overview Grid */}
              <div 
                style={{ 
                  display: 'grid', 
                  gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', 
                  gap: '1rem', 
                  background: '#F8FAFC', 
                  padding: '1.25rem', 
                  borderRadius: '8px', 
                  marginBottom: '1.25rem',
                  border: '1px solid #E2E8F0'
                }}
              >
                <div><strong>Customer:</strong> {selectedBookingModal.customerName}</div>
                <div><strong>Email:</strong> {selectedBookingModal.email}</div>
                <div><strong>Phone:</strong> {selectedBookingModal.phone}</div>
                <div><strong>Event Type:</strong> <span style={{ textTransform: 'capitalize' }}>{selectedBookingModal.eventType}</span></div>
                <div><strong>Venue:</strong> {selectedBookingModal.venue?.name || selectedBookingModal.venueName || 'Not specified'}</div>
                <div><strong>Event Date:</strong> {selectedBookingModal.date}</div>
                <div><strong>Timings:</strong> {selectedBookingModal.startTime} – {selectedBookingModal.endTime}</div>
                <div><strong>Expected Guests:</strong> {selectedBookingModal.guestCount}</div>
                <div><strong>Current Status:</strong> {getStatusBadge(selectedBookingModal.status)}</div>
                {selectedBookingModal.selectedPackage && (
                  <div><strong>Package:</strong> {selectedBookingModal.selectedPackage}</div>
                )}
                {selectedBookingModal.estimatedPrice > 0 && (
                  <div><strong>Estimated Price:</strong> Rs. {Number(selectedBookingModal.estimatedPrice).toLocaleString()}</div>
                )}
                {selectedBookingModal.event?.title && (
                  <div><strong>Associated Event:</strong> {selectedBookingModal.event.title}</div>
                )}
              </div>

              {/* Detailed Event Requirements */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem', marginBottom: '1.25rem' }}>
                <h4 style={{ margin: '0.5rem 0 0 0', fontSize: '0.95rem', color: '#0F172A', borderBottom: '1px solid #E2E8F0', paddingBottom: '0.4rem' }}>
                  Customer Specifications & Requirements
                </h4>

                {selectedBookingModal.specialRequests && (
                  <div style={{ padding: '0.85rem', background: '#FEF3C7', color: '#92400E', borderRadius: '6px', fontSize: '0.875rem' }}>
                    <strong>Special Requests:</strong> {selectedBookingModal.specialRequests}
                  </div>
                )}

                {selectedBookingModal.cateringRequirements && (
                  <div style={{ fontSize: '0.875rem', background: '#F8FAFC', padding: '0.75rem', borderRadius: '6px' }}>
                    <strong><FaUtensils size={12} style={{ marginRight: '4px' }} /> Catering Requirements:</strong> {selectedBookingModal.cateringRequirements}
                  </div>
                )}

                {selectedBookingModal.decorationRequirements && (
                  <div style={{ fontSize: '0.875rem', background: '#F8FAFC', padding: '0.75rem', borderRadius: '6px' }}>
                    <strong>Decoration Requirements:</strong> {selectedBookingModal.decorationRequirements}
                  </div>
                )}

                {selectedBookingModal.equipmentRequirements && (
                  <div style={{ fontSize: '0.875rem', background: '#F8FAFC', padding: '0.75rem', borderRadius: '6px' }}>
                    <strong>Equipment / AV Requirements:</strong> {selectedBookingModal.equipmentRequirements}
                  </div>
                )}

                {selectedBookingModal.seatingArrangement && (
                  <div style={{ fontSize: '0.875rem', background: '#F8FAFC', padding: '0.75rem', borderRadius: '6px' }}>
                    <strong>Seating Arrangement:</strong> {selectedBookingModal.seatingArrangement}
                  </div>
                )}

                {selectedBookingModal.rejectionReason && (
                  <div style={{ padding: '0.75rem', background: '#FEE2E2', color: '#991B1B', borderRadius: '6px', fontSize: '0.875rem' }}>
                    <strong>Rejection Reason:</strong> {selectedBookingModal.rejectionReason}
                  </div>
                )}

                {selectedBookingModal.cancellationReason && (
                  <div style={{ padding: '0.75rem', background: '#FEE2E2', color: '#991B1B', borderRadius: '6px', fontSize: '0.875rem' }}>
                    <strong>Cancellation Reason:</strong> {selectedBookingModal.cancellationReason}
                  </div>
                )}
              </div>

              {/* Internal Staff Notes */}
              <div className="pms-form-group" style={{ marginBottom: '1.25rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                  <label className="pms-form-label" style={{ margin: 0 }}>
                    Internal Staff Notes (Private — not visible to customers):
                  </label>
                  {canManage && (
                    <button
                      type="button"
                      className="pms-btn pms-btn-sm pms-btn-secondary"
                      onClick={handleSaveInternalNotesOnly}
                      disabled={statusActionLoading}
                    >
                      <FaSave /> Save Notes
                    </button>
                  )}
                </div>
                <textarea
                  className="pms-textarea"
                  rows="2"
                  placeholder="Record deposit status, vendor arrangements, or administrative notes..."
                  value={statusUpdateNotes}
                  onChange={(e) => setStatusUpdateNotes(e.target.value)}
                  disabled={!canManage}
                />
              </div>

              {/* Audit Log / History Trail */}
              {selectedBookingModal.auditLog && selectedBookingModal.auditLog.length > 0 && (
                <div style={{ marginTop: '1rem', borderTop: '1px solid #E2E8F0', paddingTop: '1rem' }}>
                  <h4 style={{ margin: '0 0 0.75rem 0', fontSize: '0.9rem', color: '#475569', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <FaHistory /> Audit Log & Lifecycle History
                  </h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '160px', overflowY: 'auto' }}>
                    {selectedBookingModal.auditLog.map((log, idx) => (
                      <div 
                        key={idx}
                        style={{ 
                          fontSize: '0.78rem', 
                          padding: '0.5rem 0.75rem', 
                          background: '#F8FAFC', 
                          borderRadius: '4px',
                          borderLeft: '3px solid var(--evt-brass)'
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 600, color: '#1E293B' }}>
                          <span>{log.action}</span>
                          <span style={{ color: '#94A3B8' }}>{format(new Date(log.timestamp), 'MMM d, yyyy HH:mm')}</span>
                        </div>
                        {log.notes && <div style={{ color: '#64748B', marginTop: '0.2rem' }}>{log.notes}</div>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="pms-modal-footer" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
              <button
                type="button"
                className="pms-btn pms-btn-secondary"
                onClick={() => setSelectedBookingModal(null)}
              >
                Close
              </button>

              {canManage && (
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  {selectedBookingModal.status === 'PENDING' && (
                    <>
                      <button
                        type="button"
                        className="pms-btn pms-btn-danger"
                        disabled={statusActionLoading}
                        onClick={() => handleOpenReasonPrompt('REJECT', selectedBookingModal)}
                      >
                        <FaTimes /> Reject Request
                      </button>
                      <button
                        type="button"
                        className="pms-btn pms-btn-primary"
                        disabled={statusActionLoading}
                        onClick={() => {
                          setConflictErrorNotice(null);
                          setConfirmActionModal({ type: 'CONFIRMED', booking: selectedBookingModal });
                        }}
                      >
                        <FaCheck /> Confirm & Lock Venue
                      </button>
                    </>
                  )}

                  {selectedBookingModal.status === 'CONFIRMED' && (
                    <>
                      <button
                        type="button"
                        className="pms-btn pms-btn-danger"
                        disabled={statusActionLoading}
                        onClick={() => handleOpenReasonPrompt('CANCEL', selectedBookingModal)}
                      >
                        Cancel Booking
                      </button>
                      <button
                        type="button"
                        className="pms-btn pms-btn-primary"
                        disabled={statusActionLoading}
                        onClick={() => {
                          setConflictErrorNotice(null);
                          setConfirmActionModal({ type: 'COMPLETED', booking: selectedBookingModal });
                        }}
                      >
                        <FaCheckCircle /> Mark Completed
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL 2: CONFIRMATION PROMPT DIALOG (CONFIRM OR COMPLETE) */}
      {/* ===================================================================== */}
      {confirmActionModal && (
        <div className="pms-modal-backdrop" style={{ zIndex: 1150 }} role="dialog" aria-modal="true">
          <div className="pms-modal-dialog" style={{ maxWidth: '480px' }}>
            <div className="pms-modal-header">
              <h3>
                {confirmActionModal.type === 'CONFIRMED' ? 'Confirm Event Booking' : 'Mark Event Booking as Completed'}
              </h3>
              <button
                type="button"
                className="pms-modal-close"
                onClick={() => setConfirmActionModal(null)}
              >
                &times;
              </button>
            </div>

            <div className="pms-modal-body">
              {conflictErrorNotice && (
                <div style={{ marginBottom: '1rem', padding: '0.85rem', background: '#FEE2E2', border: '1px solid #F87171', borderRadius: '6px', color: '#991B1B', fontSize: '0.85rem' }}>
                  <div style={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <FaExclamationTriangle /> {conflictErrorNotice.message}
                  </div>
                  {conflictErrorNotice.details && (
                    <div style={{ marginTop: '0.25rem' }}>{conflictErrorNotice.details}</div>
                  )}
                </div>
              )}

              <p style={{ margin: '0 0 1rem 0', fontSize: '0.92rem', color: '#1E293B' }}>
                {confirmActionModal.type === 'CONFIRMED' 
                  ? `Are you sure you want to officially confirm booking ${confirmActionModal.booking.confirmationNumber}?`
                  : `Are you sure you want to mark booking ${confirmActionModal.booking.confirmationNumber} as completed? Once completed, the status cannot be reverted.`}
              </p>

              <div style={{ background: '#F8FAFC', padding: '0.85rem', borderRadius: '6px', fontSize: '0.85rem', marginBottom: '1rem' }}>
                <div><strong>Customer:</strong> {confirmActionModal.booking.customerName}</div>
                <div><strong>Venue:</strong> {confirmActionModal.booking.venue?.name || confirmActionModal.booking.venueName || 'Unassigned'}</div>
                <div><strong>Date:</strong> {confirmActionModal.booking.date} ({confirmActionModal.booking.startTime} – {confirmActionModal.booking.endTime})</div>
                <div><strong>Guests:</strong> {confirmActionModal.booking.guestCount}</div>
              </div>

              {confirmActionModal.type === 'CONFIRMED' && (
                <div style={{ fontSize: '0.85rem', color: '#059669', background: '#ECFDF5', padding: '0.75rem', borderRadius: '6px' }}>
                  <FaInfoCircle /> Confirming this reservation will reserve the venue slot and reject subsequent overlapping booking requests.
                </div>
              )}
            </div>

            <div className="pms-modal-footer">
              <button
                type="button"
                className="pms-btn pms-btn-secondary"
                onClick={() => setConfirmActionModal(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="pms-btn pms-btn-primary"
                disabled={statusActionLoading}
                onClick={() => handleUpdateBookingStatus(confirmActionModal.booking._id, confirmActionModal.type)}
              >
                {statusActionLoading 
                  ? 'Processing...' 
                  : (confirmActionModal.type === 'CONFIRMED' ? 'Yes, Confirm & Lock Venue' : 'Yes, Mark as Completed')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL 3: REJECTION / CANCELLATION REASON PROMPT */}
      {/* ===================================================================== */}
      {actionPromptModal && (
        <div className="pms-modal-backdrop" style={{ zIndex: 1200 }} role="dialog" aria-modal="true">
          <div className="pms-modal-dialog" style={{ maxWidth: '480px' }}>
            <div className="pms-modal-header">
              <h3>
                {actionPromptModal.type === 'REJECT' ? 'Reject Booking Request' : 'Cancel Confirmed Booking'}
              </h3>
              <button
                type="button"
                className="pms-modal-close"
                onClick={() => setActionPromptModal(null)}
              >
                &times;
              </button>
            </div>

            <div className="pms-modal-body">
              <p style={{ margin: '0 0 1rem 0', fontSize: '0.9rem', color: '#475569' }}>
                Please specify a reason for {actionPromptModal.type === 'REJECT' ? 'rejecting' : 'cancelling'} request <strong>{actionPromptModal.booking.confirmationNumber}</strong>. This reason will be logged in the audit trail.
              </p>

              <div className="pms-form-group">
                <label className="pms-form-label">Reason *</label>
                <textarea
                  className="pms-textarea"
                  rows="3"
                  placeholder={actionPromptModal.type === 'REJECT' ? 'e.g., Venue booked for private government gala / capacity exceeded' : 'e.g., Client requested cancellation due to schedule change'}
                  value={actionPromptModal.reason}
                  onChange={(e) => setActionPromptModal({ ...actionPromptModal, reason: e.target.value })}
                  required
                />
              </div>
            </div>

            <div className="pms-modal-footer">
              <button
                type="button"
                className="pms-btn pms-btn-secondary"
                onClick={() => setActionPromptModal(null)}
              >
                Back
              </button>
              <button
                type="button"
                className="pms-btn pms-btn-danger"
                disabled={statusActionLoading}
                onClick={handleSubmitReasonAction}
              >
                {statusActionLoading ? 'Processing...' : (actionPromptModal.type === 'REJECT' ? 'Confirm Rejection' : 'Confirm Cancellation')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL 4: UNIVERSAL DESTRUCTIVE CONFIRMATION MODAL */}
      {/* ===================================================================== */}
      {destructiveModal && (
        <div className="pms-modal-backdrop" style={{ zIndex: 1250 }} role="dialog" aria-modal="true">
          <div className="pms-modal-dialog" style={{ maxWidth: '480px' }}>
            <div className="pms-modal-header">
              <h3 style={{ color: '#991B1B' }}>
                <FaExclamationTriangle style={{ marginRight: '6px' }} />
                {destructiveModal.title}
              </h3>
              <button
                type="button"
                className="pms-modal-close"
                onClick={() => setDestructiveModal(null)}
              >
                &times;
              </button>
            </div>

            <div className="pms-modal-body">
              <p style={{ margin: '0 0 1rem 0', fontSize: '0.92rem', color: '#1E293B' }}>
                {destructiveModal.description}
              </p>

              <div style={{ background: '#F8FAFC', padding: '0.85rem', borderRadius: '6px', fontSize: '0.85rem' }}>
                <div><strong>Item:</strong> {destructiveModal.item.name || destructiveModal.item.title}</div>
                {destructiveModal.item.slug && <div><strong>Slug:</strong> {destructiveModal.item.slug}</div>}
              </div>
            </div>

            <div className="pms-modal-footer">
              <button
                type="button"
                className="pms-btn pms-btn-secondary"
                onClick={() => setDestructiveModal(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="pms-btn pms-btn-danger"
                disabled={destructiveLoading}
                onClick={handleExecuteDestructiveAction}
              >
                {destructiveLoading ? 'Processing...' : 'Confirm Action'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL 5: CREATE / EDIT EVENT */}
      {/* ===================================================================== */}
      {showEventModal && (
        <div className="pms-modal-backdrop" role="dialog" aria-modal="true">
          <div className="pms-modal-dialog" style={{ maxWidth: '720px' }}>
            <div className="pms-modal-header">
              <h3>{editingEventId ? 'Edit Hotel Event' : 'Create New Hotel Event'}</h3>
              <button type="button" className="pms-modal-close" onClick={() => setShowEventModal(false)}>
                &times;
              </button>
            </div>

            <form onSubmit={handleSaveEvent}>
              <div className="pms-modal-body" style={{ maxHeight: '72vh', overflowY: 'auto' }}>
                <div className="pms-form-group">
                  <label className="pms-form-label">Event Title *</label>
                  <input
                    type="text"
                    className="pms-input"
                    value={eventForm.title}
                    onChange={(e) => setEventForm({ ...eventForm, title: e.target.value })}
                    required
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div className="pms-form-group">
                    <label className="pms-form-label">Category</label>
                    <select
                      className="pms-select"
                      value={eventForm.eventType}
                      onChange={(e) => setEventForm({ ...eventForm, eventType: e.target.value })}
                    >
                      <option value="weddings">Weddings & Occasions</option>
                      <option value="corporate">Corporate Events</option>
                      <option value="office-parties">Office Parties</option>
                      <option value="private-celebrations">Private Celebrations</option>
                      <option value="banquet">Banquet & Gala</option>
                      <option value="entertainment">Hotel Entertainment</option>
                    </select>
                  </div>

                  <div className="pms-form-group">
                    <label className="pms-form-label">Associated Venue</label>
                    <select
                      className="pms-select"
                      value={eventForm.venue}
                      onChange={(e) => setEventForm({ ...eventForm, venue: e.target.value })}
                    >
                      <option value="">No Venue / General Hotel Space</option>
                      {venues.map((v) => (
                        <option key={v._id} value={v._id}>
                          {v.name} ({v.type}) {!v.isActive ? '(Inactive)' : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div className="pms-form-group">
                    <label className="pms-form-label">Start Date *</label>
                    <input
                      type="date"
                      className="pms-input"
                      value={eventForm.startDate}
                      onChange={(e) => setEventForm({ ...eventForm, startDate: e.target.value })}
                      required
                    />
                  </div>

                  <div className="pms-form-group">
                    <label className="pms-form-label">End Date</label>
                    <input
                      type="date"
                      className="pms-input"
                      value={eventForm.endDate}
                      onChange={(e) => setEventForm({ ...eventForm, endDate: e.target.value })}
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div className="pms-form-group">
                    <label className="pms-form-label">Start Time</label>
                    <input
                      type="time"
                      className="pms-input"
                      value={eventForm.startTime}
                      onChange={(e) => setEventForm({ ...eventForm, startTime: e.target.value })}
                    />
                  </div>

                  <div className="pms-form-group">
                    <label className="pms-form-label">End Time</label>
                    <input
                      type="time"
                      className="pms-input"
                      value={eventForm.endTime}
                      onChange={(e) => setEventForm({ ...eventForm, endTime: e.target.value })}
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem' }}>
                  <div className="pms-form-group">
                    <label className="pms-form-label">Min Capacity</label>
                    <input
                      type="number"
                      className="pms-input"
                      min="1"
                      value={eventForm.minCapacity}
                      onChange={(e) => setEventForm({ ...eventForm, minCapacity: e.target.value })}
                    />
                  </div>

                  <div className="pms-form-group">
                    <label className="pms-form-label">Max Capacity *</label>
                    <input
                      type="number"
                      className="pms-input"
                      min="1"
                      value={eventForm.maxCapacity}
                      onChange={(e) => setEventForm({ ...eventForm, maxCapacity: e.target.value })}
                      required
                    />
                  </div>

                  <div className="pms-form-group">
                    <label className="pms-form-label">Expected Guests</label>
                    <input
                      type="number"
                      className="pms-input"
                      min="1"
                      value={eventForm.expectedGuestCount}
                      onChange={(e) => setEventForm({ ...eventForm, expectedGuestCount: e.target.value })}
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem' }}>
                  <div className="pms-form-group">
                    <label className="pms-form-label">Pricing Model</label>
                    <select
                      className="pms-select"
                      value={eventForm.pricingModel}
                      onChange={(e) => setEventForm({ ...eventForm, pricingModel: e.target.value })}
                    >
                      <option value="Fixed Package">Fixed Package</option>
                      <option value="Per Person">Per Person</option>
                      <option value="Per Table">Per Table</option>
                      <option value="Free">Free / Complimentary</option>
                      <option value="Custom Quote">Custom Quote</option>
                    </select>
                  </div>

                  <div className="pms-form-group">
                    <label className="pms-form-label">Base Price (LKR)</label>
                    <input
                      type="number"
                      className="pms-input"
                      min="0"
                      placeholder="0 for complimentary"
                      value={eventForm.basePrice}
                      onChange={(e) => setEventForm({ ...eventForm, basePrice: e.target.value })}
                    />
                  </div>

                  <div className="pms-form-group">
                    <label className="pms-form-label">Lifecycle Status</label>
                    <select
                      className="pms-select"
                      value={eventForm.status}
                      onChange={(e) => setEventForm({ ...eventForm, status: e.target.value })}
                    >
                      <option value="PUBLISHED">Published</option>
                      <option value="DRAFT">Draft</option>
                      <option value="CANCELLED">Cancelled</option>
                      <option value="COMPLETED">Completed</option>
                      <option value="ARCHIVED">Archived</option>
                    </select>
                  </div>
                </div>

                <div className="pms-form-group">
                  <label className="pms-form-label">Short Summary / Tagline</label>
                  <input
                    type="text"
                    className="pms-input"
                    value={eventForm.shortDescription}
                    onChange={(e) => setEventForm({ ...eventForm, shortDescription: e.target.value })}
                  />
                </div>

                <div className="pms-form-group">
                  <label className="pms-form-label">Full Description</label>
                  <textarea
                    className="pms-textarea"
                    rows="3"
                    value={eventForm.description}
                    onChange={(e) => setEventForm({ ...eventForm, description: e.target.value })}
                  />
                </div>

                <div className="pms-form-group">
                  <label className="pms-form-label">Cover Image URL</label>
                  <input
                    type="url"
                    className="pms-input"
                    placeholder="https://..."
                    value={eventForm.coverImage}
                    onChange={(e) => setEventForm({ ...eventForm, coverImage: e.target.value })}
                  />
                  {eventForm.coverImage && (
                    <div style={{ marginTop: '0.5rem' }}>
                      <img 
                        src={eventForm.coverImage} 
                        alt="Preview" 
                        style={{ height: '70px', borderRadius: '4px', objectFit: 'cover' }} 
                        onError={(e) => { e.target.style.display = 'none'; }}
                      />
                    </div>
                  )}
                </div>

                <div className="pms-form-group">
                  <label className="pms-form-label">Gallery Image URLs (one per line)</label>
                  <textarea
                    className="pms-textarea"
                    rows="2"
                    placeholder="https://images.unsplash.com/...&#10;https://images.unsplash.com/..."
                    value={eventForm.galleryText}
                    onChange={(e) => setEventForm({ ...eventForm, galleryText: e.target.value })}
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div className="pms-form-group">
                    <label className="pms-form-label">Contact Email</label>
                    <input
                      type="email"
                      className="pms-input"
                      value={eventForm.contactEmail}
                      onChange={(e) => setEventForm({ ...eventForm, contactEmail: e.target.value })}
                    />
                  </div>

                  <div className="pms-form-group">
                    <label className="pms-form-label">Contact Phone</label>
                    <input
                      type="text"
                      className="pms-input"
                      value={eventForm.contactPhone}
                      onChange={(e) => setEventForm({ ...eventForm, contactPhone: e.target.value })}
                    />
                  </div>
                </div>

                <div className="pms-form-group">
                  <label className="pms-form-label">Terms & Conditions</label>
                  <textarea
                    className="pms-textarea"
                    rows="2"
                    value={eventForm.termsAndConditions}
                    onChange={(e) => setEventForm({ ...eventForm, termsAndConditions: e.target.value })}
                  />
                </div>

                <div style={{ display: 'flex', gap: '1.5rem', marginTop: '0.5rem' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={eventForm.featured}
                      onChange={(e) => setEventForm({ ...eventForm, featured: e.target.checked })}
                    />
                    <span>Feature on customer homepage & banquets showcase</span>
                  </label>
                </div>
              </div>

              <div className="pms-modal-footer">
                <button type="button" className="pms-btn pms-btn-secondary" onClick={() => setShowEventModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="pms-btn pms-btn-primary" disabled={savingEvent}>
                  {savingEvent ? 'Saving Event...' : (editingEventId ? 'Update Event' : 'Create Event')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL 6: VIEW EVENT DETAILS MODAL */}
      {/* ===================================================================== */}
      {selectedEventDetailsModal && (
        <div className="pms-modal-backdrop" role="dialog" aria-modal="true">
          <div className="pms-modal-dialog" style={{ maxWidth: '680px' }}>
            <div className="pms-modal-header">
              <div>
                <h3 style={{ margin: 0 }}>{selectedEventDetailsModal.title}</h3>
                <small style={{ color: '#64748B' }}>
                  Slug: {selectedEventDetailsModal.slug} &bull; Type: {selectedEventDetailsModal.eventType}
                </small>
              </div>
              <button
                type="button"
                className="pms-modal-close"
                onClick={() => setSelectedEventDetailsModal(null)}
              >
                &times;
              </button>
            </div>

            <div className="pms-modal-body" style={{ maxHeight: '72vh', overflowY: 'auto' }}>
              {selectedEventDetailsModal.coverImage && (
                <img 
                  src={selectedEventDetailsModal.coverImage} 
                  alt={selectedEventDetailsModal.title}
                  style={{ width: '100%', height: '200px', objectFit: 'cover', borderRadius: '8px', marginBottom: '1rem' }}
                />
              )}

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem', background: '#F8FAFC', padding: '1rem', borderRadius: '8px', marginBottom: '1rem' }}>
                <div><strong>Status:</strong> {getStatusBadge(selectedEventDetailsModal.status)}</div>
                <div><strong>Venue:</strong> {selectedEventDetailsModal.venue?.name || 'General Space'}</div>
                <div><strong>Date:</strong> {selectedEventDetailsModal.startDate} {selectedEventDetailsModal.endDate ? `to ${selectedEventDetailsModal.endDate}` : ''}</div>
                <div><strong>Timings:</strong> {selectedEventDetailsModal.startTime} – {selectedEventDetailsModal.endTime}</div>
                <div><strong>Capacity:</strong> {selectedEventDetailsModal.minCapacity}–{selectedEventDetailsModal.maxCapacity} guests</div>
                <div><strong>Pricing:</strong> {selectedEventDetailsModal.basePrice > 0 ? `Rs. ${Number(selectedEventDetailsModal.basePrice).toLocaleString()} (${selectedEventDetailsModal.pricingModel})` : 'Complimentary'}</div>
              </div>

              {selectedEventDetailsModal.shortDescription && (
                <div style={{ marginBottom: '1rem' }}>
                  <strong>Summary:</strong>
                  <p style={{ margin: '0.25rem 0 0', color: '#475569' }}>{selectedEventDetailsModal.shortDescription}</p>
                </div>
              )}

              {selectedEventDetailsModal.description && (
                <div style={{ marginBottom: '1rem' }}>
                  <strong>Full Description:</strong>
                  <p style={{ margin: '0.25rem 0 0', color: '#475569', whiteSpace: 'pre-line' }}>{selectedEventDetailsModal.description}</p>
                </div>
              )}

              {(selectedEventDetailsModal.contactEmail || selectedEventDetailsModal.contactPhone) && (
                <div style={{ background: '#F1F5F9', padding: '0.75rem 1rem', borderRadius: '6px', marginBottom: '1rem', fontSize: '0.85rem' }}>
                  <strong>Event Inquiries Contact:</strong> {selectedEventDetailsModal.contactEmail} &bull; {selectedEventDetailsModal.contactPhone}
                </div>
              )}

              {selectedEventDetailsModal.termsAndConditions && (
                <div style={{ fontSize: '0.8rem', color: '#64748B' }}>
                  <strong>Terms & Conditions:</strong> {selectedEventDetailsModal.termsAndConditions}
                </div>
              )}
            </div>

            <div className="pms-modal-footer">
              <button
                type="button"
                className="pms-btn pms-btn-secondary"
                onClick={() => setSelectedEventDetailsModal(null)}
              >
                Close
              </button>
              <button
                type="button"
                className="pms-btn pms-btn-secondary"
                onClick={() => window.open('/events', '_blank')}
                title="Preview Customer Page"
              >
                <FaExternalLinkAlt /> Customer View
              </button>
              {canManage && (
                <button
                  type="button"
                  className="pms-btn pms-btn-primary"
                  onClick={() => {
                    const evt = selectedEventDetailsModal;
                    setSelectedEventDetailsModal(null);
                    handleOpenEditEvent(evt);
                  }}
                >
                  <FaEdit /> Edit Event
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL 7: CREATE / EDIT VENUE */}
      {/* ===================================================================== */}
      {showVenueModal && (
        <div className="pms-modal-backdrop" role="dialog" aria-modal="true">
          <div className="pms-modal-dialog" style={{ maxWidth: '720px' }}>
            <div className="pms-modal-header">
              <h3>{editingVenueId ? 'Edit Event Venue / Hall' : 'Add New Event Venue / Hall'}</h3>
              <button type="button" className="pms-modal-close" onClick={() => setShowVenueModal(false)}>
                &times;
              </button>
            </div>

            <form onSubmit={handleSaveVenue}>
              <div className="pms-modal-body" style={{ maxHeight: '72vh', overflowY: 'auto' }}>
                <div className="pms-form-group">
                  <label className="pms-form-label">Venue Name *</label>
                  <input
                    type="text"
                    className="pms-input"
                    value={venueForm.name}
                    onChange={(e) => setVenueForm({ ...venueForm, name: e.target.value })}
                    required
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div className="pms-form-group">
                    <label className="pms-form-label">Venue Type</label>
                    <select
                      className="pms-select"
                      value={venueForm.type}
                      onChange={(e) => setVenueForm({ ...venueForm, type: e.target.value })}
                    >
                      <option value="Indoor">Indoor Banquet Hall</option>
                      <option value="Outdoor">Outdoor Lawn / Terrace</option>
                      <option value="Hybrid">Hybrid Space</option>
                    </select>
                  </div>

                  <div className="pms-form-group">
                    <label className="pms-form-label">Floor Area (m²)</label>
                    <input
                      type="number"
                      className="pms-input"
                      value={venueForm.area}
                      onChange={(e) => setVenueForm({ ...venueForm, area: e.target.value })}
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div className="pms-form-group">
                    <label className="pms-form-label">Minimum Capacity</label>
                    <input
                      type="number"
                      className="pms-input"
                      min="1"
                      value={venueForm.min}
                      onChange={(e) => setVenueForm({ ...venueForm, min: e.target.value })}
                    />
                  </div>

                  <div className="pms-form-group">
                    <label className="pms-form-label">Maximum Capacity *</label>
                    <input
                      type="number"
                      className="pms-input"
                      min="1"
                      value={venueForm.max}
                      onChange={(e) => setVenueForm({ ...venueForm, max: e.target.value })}
                      required
                    />
                  </div>
                </div>

                <div className="pms-form-group">
                  <label className="pms-form-label">Location / Wing</label>
                  <input
                    type="text"
                    className="pms-input"
                    value={venueForm.location}
                    onChange={(e) => setVenueForm({ ...venueForm, location: e.target.value })}
                  />
                </div>

                <div className="pms-form-group">
                  <label className="pms-form-label">Facilities (comma-separated)</label>
                  <input
                    type="text"
                    className="pms-input"
                    value={venueForm.facilitiesText}
                    onChange={(e) => setVenueForm({ ...venueForm, facilitiesText: e.target.value })}
                  />
                </div>

                <div className="pms-form-group">
                  <label className="pms-form-label">Seating Styles (comma-separated)</label>
                  <input
                    type="text"
                    className="pms-input"
                    value={venueForm.seatingText}
                    onChange={(e) => setVenueForm({ ...venueForm, seatingText: e.target.value })}
                  />
                </div>

                <div className="pms-form-group">
                  <label className="pms-form-label">Cover Image URL</label>
                  <input
                    type="url"
                    className="pms-input"
                    value={venueForm.image}
                    onChange={(e) => setVenueForm({ ...venueForm, image: e.target.value })}
                  />
                  {venueForm.image && (
                    <div style={{ marginTop: '0.5rem' }}>
                      <img 
                        src={venueForm.image} 
                        alt="Venue Preview" 
                        style={{ height: '70px', borderRadius: '4px', objectFit: 'cover' }} 
                        onError={(e) => { e.target.style.display = 'none'; }}
                      />
                    </div>
                  )}
                </div>

                <div className="pms-form-group">
                  <label className="pms-form-label">Gallery Image URLs (one per line)</label>
                  <textarea
                    className="pms-textarea"
                    rows="2"
                    placeholder="https://...&#10;https://..."
                    value={venueForm.galleryText}
                    onChange={(e) => setVenueForm({ ...venueForm, galleryText: e.target.value })}
                  />
                </div>

                <div className="pms-form-group">
                  <label className="pms-form-label">Venue Description</label>
                  <textarea
                    className="pms-textarea"
                    rows="3"
                    value={venueForm.description}
                    onChange={(e) => setVenueForm({ ...venueForm, description: e.target.value })}
                  />
                </div>

                {/* Venue Packages Management */}
                <div style={{ borderTop: '1px solid #E2E8F0', paddingTop: '1rem', marginBottom: '1rem' }}>
                  <label className="pms-form-label" style={{ marginBottom: '0.5rem' }}>
                    Event Packages & Catering Options ({venueForm.packages?.length || 0})
                  </label>

                  {venueForm.packages && venueForm.packages.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginBottom: '0.75rem' }}>
                      {venueForm.packages.map((pkg, idx) => (
                        <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#F8FAFC', padding: '0.5rem 0.75rem', borderRadius: '4px', fontSize: '0.85rem' }}>
                          <div>
                            <strong>{pkg.name}</strong> &bull; Rs. {Number(pkg.price).toLocaleString()}
                            <div style={{ fontSize: '0.75rem', color: '#64748B' }}>{pkg.includes || 'Standard banquet inclusions'}</div>
                          </div>
                          <button
                            type="button"
                            className="pms-btn pms-btn-sm pms-btn-danger"
                            onClick={() => handleRemoveVenuePackage(idx)}
                          >
                            <FaTrash size={10} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr auto', gap: '0.5rem', alignItems: 'flex-end', background: '#F1F5F9', padding: '0.75rem', borderRadius: '6px' }}>
                    <div>
                      <span style={{ fontSize: '0.75rem', fontWeight: 600 }}>Pkg Name</span>
                      <input
                        type="text"
                        className="pms-input"
                        placeholder="e.g. Royal Wedding"
                        value={newPackageInput.name}
                        onChange={(e) => setNewPackageInput({ ...newPackageInput, name: e.target.value })}
                      />
                    </div>
                    <div>
                      <span style={{ fontSize: '0.75rem', fontWeight: 600 }}>Price (LKR)</span>
                      <input
                        type="number"
                        min="0"
                        className="pms-input"
                        placeholder="Price"
                        value={newPackageInput.price}
                        onChange={(e) => setNewPackageInput({ ...newPackageInput, price: e.target.value })}
                      />
                    </div>
                    <div>
                      <span style={{ fontSize: '0.75rem', fontWeight: 600 }}>Inclusions</span>
                      <input
                        type="text"
                        className="pms-input"
                        placeholder="Inclusions summary"
                        value={newPackageInput.includes}
                        onChange={(e) => setNewPackageInput({ ...newPackageInput, includes: e.target.value })}
                      />
                    </div>
                    <button
                      type="button"
                      className="pms-btn pms-btn-sm pms-btn-primary"
                      onClick={handleAddVenuePackage}
                      style={{ height: '36px' }}
                    >
                      <FaPlus /> Add
                    </button>
                  </div>
                </div>

                <div style={{ marginTop: '0.5rem' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={venueForm.isActive}
                      onChange={(e) => setVenueForm({ ...venueForm, isActive: e.target.checked })}
                    />
                    <span>Venue is Active (accepts new bookings)</span>
                  </label>
                </div>
              </div>

              <div className="pms-modal-footer">
                <button type="button" className="pms-btn pms-btn-secondary" onClick={() => setShowVenueModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="pms-btn pms-btn-primary" disabled={savingVenue}>
                  {savingVenue ? 'Saving Venue...' : (editingVenueId ? 'Update Venue' : 'Create Venue')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL 8: VIEW VENUE DETAILS MODAL (WITH UPCOMING BOOKINGS) */}
      {/* ===================================================================== */}
      {selectedVenueDetailsModal && (
        <div className="pms-modal-backdrop" role="dialog" aria-modal="true">
          <div className="pms-modal-dialog" style={{ maxWidth: '680px' }}>
            <div className="pms-modal-header">
              <div>
                <h3 style={{ margin: 0 }}>{selectedVenueDetailsModal.name}</h3>
                <small style={{ color: '#64748B' }}>
                  {selectedVenueDetailsModal.type} Hall &bull; {selectedVenueDetailsModal.location}
                </small>
              </div>
              <button
                type="button"
                className="pms-modal-close"
                onClick={() => setSelectedVenueDetailsModal(null)}
              >
                &times;
              </button>
            </div>

            <div className="pms-modal-body" style={{ maxHeight: '72vh', overflowY: 'auto' }}>
              {selectedVenueDetailsModal.image && (
                <img 
                  src={selectedVenueDetailsModal.image} 
                  alt={selectedVenueDetailsModal.name}
                  style={{ width: '100%', height: '200px', objectFit: 'cover', borderRadius: '8px', marginBottom: '1rem' }}
                />
              )}

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem', background: '#F8FAFC', padding: '1rem', borderRadius: '8px', marginBottom: '1rem' }}>
                <div><strong>Status:</strong> {selectedVenueDetailsModal.isActive ? <span className="pms-pill pms-pill-success">Active</span> : <span className="pms-pill pms-pill-danger">Inactive</span>}</div>
                <div><strong>Area:</strong> {selectedVenueDetailsModal.area} m²</div>
                <div><strong>Capacity:</strong> {selectedVenueDetailsModal.min}–{selectedVenueDetailsModal.max} guests</div>
                <div><strong>Type:</strong> {selectedVenueDetailsModal.type}</div>
              </div>

              {selectedVenueDetailsModal.description && (
                <div style={{ marginBottom: '1rem' }}>
                  <strong>Description:</strong>
                  <p style={{ margin: '0.25rem 0 0', color: '#475569' }}>{selectedVenueDetailsModal.description}</p>
                </div>
              )}

              {selectedVenueDetailsModal.facilities && selectedVenueDetailsModal.facilities.length > 0 && (
                <div style={{ marginBottom: '1rem' }}>
                  <strong>Facilities:</strong>
                  <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginTop: '0.35rem' }}>
                    {selectedVenueDetailsModal.facilities.map((fac, i) => (
                      <span key={i} className="pms-pill pms-pill-secondary">{fac}</span>
                    ))}
                  </div>
                </div>
              )}

              {selectedVenueDetailsModal.seating && selectedVenueDetailsModal.seating.length > 0 && (
                <div style={{ marginBottom: '1rem' }}>
                  <strong>Seating Arrangements:</strong>
                  <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginTop: '0.35rem' }}>
                    {selectedVenueDetailsModal.seating.map((seat, i) => (
                      <span key={i} className="pms-pill pms-pill-secondary">{seat}</span>
                    ))}
                  </div>
                </div>
              )}

              {/* Upcoming Confirmed Bookings for this Venue */}
              {(() => {
                const upcomingVenueBookings = bookings.filter(b => 
                  (b.venue?._id === selectedVenueDetailsModal._id || b.venue === selectedVenueDetailsModal._id || b.venueName === selectedVenueDetailsModal.name) &&
                  b.status === 'CONFIRMED'
                );

                return (
                  <div style={{ marginBottom: '1rem' }}>
                    <strong>Upcoming Confirmed Bookings ({upcomingVenueBookings.length}):</strong>
                    {upcomingVenueBookings.length === 0 ? (
                      <div style={{ fontSize: '0.85rem', color: '#64748B', background: '#F8FAFC', padding: '0.75rem', borderRadius: '4px', marginTop: '0.35rem' }}>
                        No upcoming confirmed bookings for this venue.
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginTop: '0.35rem' }}>
                        {upcomingVenueBookings.slice(0, 5).map(b => (
                          <div key={b._id} style={{ background: '#F0FDF4', border: '1px solid #BBF7D0', padding: '0.5rem 0.75rem', borderRadius: '4px', fontSize: '0.85rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>
                              <strong style={{ color: 'var(--evt-brass)' }}>{b.confirmationNumber}</strong> &bull; {b.customerName}
                              <div style={{ fontSize: '0.75rem', color: '#64748B' }}>{b.date} ({b.startTime}–{b.endTime}) &bull; {b.guestCount} guests</div>
                            </div>
                            <span className="pms-pill pms-pill-success"><FaCheck size={10} /> Confirmed</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })()}

              {selectedVenueDetailsModal.packages && selectedVenueDetailsModal.packages.length > 0 && (
                <div style={{ marginBottom: '1rem' }}>
                  <strong>Packages:</strong>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginTop: '0.35rem' }}>
                    {selectedVenueDetailsModal.packages.map((pkg, i) => (
                      <div key={i} style={{ background: '#F8FAFC', padding: '0.5rem 0.75rem', borderRadius: '4px', fontSize: '0.85rem' }}>
                        <strong>{pkg.name}</strong> &bull; Rs. {Number(pkg.price).toLocaleString()}
                        {pkg.includes && <div style={{ fontSize: '0.75rem', color: '#64748B' }}>{pkg.includes}</div>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="pms-modal-footer">
              <button
                type="button"
                className="pms-btn pms-btn-secondary"
                onClick={() => setSelectedVenueDetailsModal(null)}
              >
                Close
              </button>
              {canManage && (
                <button
                  type="button"
                  className="pms-btn pms-btn-primary"
                  onClick={() => {
                    const v = selectedVenueDetailsModal;
                    setSelectedVenueDetailsModal(null);
                    handleOpenEditVenue(v);
                  }}
                >
                  <FaEdit /> Edit Venue
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminEvents;
