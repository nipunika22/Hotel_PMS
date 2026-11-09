import React, { useMemo, useState, useEffect } from 'react';
import { Link, useNavigate, useParams, useSearchParams, useLocation } from 'react-router-dom';
import { 
  FaArrowLeft, 
  FaArrowRight, 
  FaCheck, 
  FaChevronRight, 
  FaRegCalendarAlt, 
  FaUsers, 
  FaMapMarkerAlt, 
  FaUtensils, 
  FaConciergeBell,
  FaSpinner
} from 'react-icons/fa';
import CustomerLayout from '../components/CustomerLayout';
import { useAuth } from '../context/AuthContext';
import { eventCategories as defaultCategories, eventHalls as defaultHalls } from '../config/eventData';
import { eventAPI } from '../services/api';
import './RestaurantExperience.css';
import './Events.css';

const Events = () => {
  const { category: categorySlug, hallId } = useParams();
  const [search] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { user, isAuthenticated } = useAuth();

  // Dynamic datasets from backend with fallback to defaults
  const [categories, setCategories] = useState(defaultCategories);
  const [halls, setHalls] = useState(defaultHalls);
  const [loadingData, setLoadingData] = useState(false);
  const [isSampleData, setIsSampleData] = useState(false);

  useEffect(() => {
    let isMounted = true;
    const fetchEventData = async () => {
      try {
        setLoadingData(true);
        const [venuesRes, typesRes] = await Promise.allSettled([
          eventAPI.getVenues(),
          eventAPI.getEventTypes()
        ]);

        if (!isMounted) return;

        const rawVenues = Array.isArray(venuesRes.value?.data)
          ? venuesRes.value.data
          : Array.isArray(venuesRes.value?.data?.data)
          ? venuesRes.value.data.data
          : null;

        if (venuesRes.status === 'fulfilled' && rawVenues && rawVenues.length > 0) {
          const mappedVenues = rawVenues.map((v) => ({
            ...v,
            id: v.slug || v._id,
            hotel: v.hotel || 'Serendib Sanctuary · Flagship Property',
            packages: v.packages || []
          }));
          setHalls(mappedVenues);
          setIsSampleData(false);
        } else {
          setIsSampleData(true);
        }

        const rawTypes = Array.isArray(typesRes.value?.data)
          ? typesRes.value.data
          : Array.isArray(typesRes.value?.data?.data)
          ? typesRes.value.data.data
          : null;

        if (typesRes.status === 'fulfilled' && rawTypes && rawTypes.length > 0) {
          setCategories(rawTypes);
        }
      } catch (err) {
        console.warn('Using default event configuration:', err.message);
        setIsSampleData(true);
      } finally {
        if (isMounted) setLoadingData(false);
      }
    };

    fetchEventData();
    return () => { isMounted = false; };
  }, []);

  const selectedCategory = categories.find((c) => c.slug === categorySlug);
  const hall = halls.find((h) => h.id === hallId || h.slug === hallId || h._id === hallId);
  const isBooking = location.pathname.endsWith('/book');

  const [galleryIndex, setGalleryIndex] = useState(0);
  const [filters, setFilters] = useState({ location: '', venue: '', capacity: '' });
  const [submitted, setSubmitted] = useState(false);
  const [submittedBooking, setSubmittedBooking] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [errors, setErrors] = useState({});

  const [form, setForm] = useState({
    name: user?.name || '',
    email: user?.email || '',
    phone: user?.phone || '',
    category: categorySlug || '',
    hotel: hall?.hotel || '',
    hall: hall?.id || hall?.slug || '',
    date: '',
    start: '',
    end: '',
    guests: '',
    seating: '',
    package: search.get('package') || '',
    catering: '',
    decorations: '',
    equipment: '',
    notes: ''
  });

  // Pre-fill contact details if authenticated customer
  useEffect(() => {
    if (user) {
      setForm((prev) => ({
        ...prev,
        name: prev.name || user.name || '',
        email: prev.email || user.email || '',
        phone: prev.phone || user.phone || ''
      }));
    }
  }, [user]);

  // Keep form hall in sync when hall loads
  useEffect(() => {
    if (hall) {
      setForm((prev) => ({
        ...prev,
        hotel: hall.hotel || prev.hotel,
        hall: hall.id || hall.slug || prev.hall
      }));
    }
  }, [hall]);

  const packages = hall?.packages || [];

  const matching = useMemo(
    () =>
      halls
        .filter(
          (h) =>
            (!categorySlug || (h.categories && h.categories.includes(categorySlug))) &&
            (!filters.location || (h.location && h.location.toLowerCase().includes(filters.location.toLowerCase()))) &&
            (!filters.venue || h.type === filters.venue) &&
            (!filters.capacity || (h.max && h.max >= Number(filters.capacity)))
        )
        .sort((a, b) => a.name.localeCompare(b.name)),
    [categorySlug, filters, halls]
  );

  const change = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
    if (errors[e.target.name]) {
      setErrors((prev) => ({ ...prev, [e.target.name]: '' }));
    }
  };

  const validate = () => {
    let e = {};
    if (!form.name.trim()) e.name = 'Please enter your name.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) e.email = 'Enter a valid email address.';
    if (!/^[+0-9()\s-]{7,20}$/.test(form.phone)) e.phone = 'Enter a valid contact number.';
    if (!form.category) e.category = 'Choose an event category.';
    if (!form.date) e.date = 'Choose an event date.';
    else if (new Date(form.date + 'T00:00:00') < new Date(new Date().toDateString()))
      e.date = 'Choose today or a future date.';
    if (!form.start) e.start = 'Choose a start time.';
    if (!form.end) e.end = 'Choose an end time.';
    else if (form.start && form.end <= form.start) e.end = 'End time must be after start time.';
    if (!form.guests || Number(form.guests) < (hall?.min || 1))
      e.guests = 'Guest count is below the venue minimum.';
    else if (hall && Number(form.guests) > hall.max) e.guests = 'Guest count exceeds the venue maximum.';
    if (!form.seating) e.seating = 'Select a seating arrangement.';
    if (!form.package && packages.length > 0) e.package = 'Choose a package.';
    setErrors(e);
    return !Object.keys(e).length;
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!validate()) return;

    try {
      setSubmitting(true);
      setSubmitError('');

      const payload = {
        name: form.name,
        email: form.email,
        phone: form.phone,
        category: form.category,
        date: form.date,
        start: form.start,
        end: form.end,
        guests: Number(form.guests),
        seating: form.seating,
        package: form.package,
        catering: form.catering,
        decorations: form.decorations,
        equipment: form.equipment,
        notes: form.notes,
        hall: hall?.slug || hall?.id || form.hall,
        hotel: hall?.hotel || form.hotel
      };

      const res = await eventAPI.createBooking(payload);
      setSubmittedBooking(res.data?.booking || payload);
      setSubmitted(true);
    } catch (err) {
      console.error('Booking submission error:', err);
      const msg = err.response?.data?.error || 'Failed to submit event request. Please check details and try again.';
      setSubmitError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const goBook = (h, cat = categorySlug) =>
    navigate('/events/' + (cat || h.categories[0]) + '/' + (h.slug || h.id) + '/book');

  return (
    <CustomerLayout variant={!categorySlug && !hallId ? 'transparent' : 'solid'}>
      <div className="events-page">
        {!categorySlug && !hallId ? (
          <>
            <section
              className="events-hero rest-hero-cinema"
              style={{
                backgroundImage:
                  'linear-gradient(90deg,rgba(10,24,25,.76),rgba(10,24,25,.12)),url(' +
                  (halls[0]?.image || categories[0]?.image) +
                  ')'
              }}
            >
              <div className="events-hero-overlay rest-hero-overlay" />
              <div className="events-hero-content rest-hero-content">
                <span className="rest-badge-pill">WEDDINGS · GATHERINGS · CELEBRATIONS</span>
                <h1 className="rest-hero-title">Celebrate Every Occasion</h1>
                <p className="rest-hero-subtitle">
                  Discover inspiring spaces for weddings, meetings, and meaningful celebrations at Serendib Sanctuary.
                </p>
                <div className="events-hero-actions rest-hero-actions">
                  <a href="#event-categories" className="rest-btn-primary">
                    Explore Our Venues <FaArrowRight />
                  </a>
                </div>
              </div>
              <span className="events-hero-note">A considered setting for gathering well</span>
            </section>
            <section className="events-intro">
              <div className="events-intro-copy">
                <span className="events-eyebrow dark">GATHER WITH INTENTION</span>
                <h2>A welcoming setting for every gathering</h2>
                <p>
                  From milestone celebrations to focused meetings, explore event spaces and ideas to help shape an occasion around the people and moments that matter.
                </p>
                <p>
                  Browse our distinct venues below, then open a category to explore the spaces and details available.
                </p>
              </div>
              <img
                src={halls[1]?.image || halls[0]?.image || categories[0]?.image}
                alt="Event setting"
                loading="lazy"
              />
            </section>
            <section id="event-categories" className="events-section">
              <div className="events-heading">
                <span className="events-eyebrow dark">FIND YOUR OCCASION</span>
                <h2>Gather for what matters</h2>
                <p>Each occasion deserves a setting of its own. Find yours across our curated event experiences.</p>
              </div>
              <div className="events-category-grid">
                {categories.map((c, i) => (
                  <Link to={'/events/' + c.slug} className="events-category-card" key={c.slug}>
                    <img src={c.image} alt="" />
                    <span className="events-card-shade" />
                    <span className="events-card-count">
                      0{i + 1} / 0{categories.length}
                    </span>
                    <div className="events-card-copy">
                      <h3>{c.title}</h3>
                      <p>{c.short}</p>
                      <span className="events-card-link">
                        Explore Events <FaArrowRight />
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            </section>
            <section id="event-spaces" className="events-spaces">
              <header className="events-heading">
                <span className="events-eyebrow dark">A PLACE FOR YOUR OCCASION</span>
                <h2>Our Event Spaces</h2>
                <p>
                  Explore our luxury event spaces and halls. Each space offers distinct dimensions, seating configurations, and audiovisual facilities.
                </p>
              </header>
              <div className="events-space-grid">
                {halls.map((h) => (
                  <Link
                    className="events-space-card"
                    key={h.id || h.slug || h._id}
                    to={'/events/' + (h.categories[0] || 'weddings') + '/' + (h.slug || h.id)}
                  >
                    <div className="events-space-image">
                      <img src={h.image} alt={h.name} loading="lazy" />
                      <span>{h.type.toUpperCase()} VENUE</span>
                    </div>
                    <div className="events-space-copy">
                      <span className="events-space-type">{h.type} · {h.area} m²</span>
                      <h3>{h.name}</h3>
                      <p>{h.description}</p>
                      <div className="events-space-meta">
                        <span>
                          <FaUsers />
                          {h.min}–{h.max} guests
                        </span>
                        <span>{(h.facilities || []).slice(0, 2).join(' · ')}</span>
                      </div>
                      <span className="events-card-link">
                        Explore Space <FaArrowRight />
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            </section>
            <section className="events-special">
              <header className="events-heading">
                <span className="events-eyebrow dark">THOUGHTFUL DETAILS</span>
                <h2>Make Your Event Special</h2>
                <p>
                  Consider the details that help bring a gathering together. Our hotel banquet specialists guide your celebration from menu tasting to staging.
                </p>
              </header>
              <div className="events-service-grid">
                {[
                  {
                    icon: <FaRegCalendarAlt />,
                    title: 'Tailored arrangements',
                    description: 'Custom seating layouts, lighting schemes, and bespoke scheduling tailored to your event.'
                  },
                  {
                    icon: <FaUtensils />,
                    title: 'Food & dining',
                    description: 'Haute gastronomy menus, plated banquets, live cooking stations, and tea pairings.'
                  },
                  {
                    icon: <FaMapMarkerAlt />,
                    title: 'Elegant settings',
                    description: 'Seamless indoor ballrooms and open-air tropical garden terraces with ocean vistas.'
                  },
                  {
                    icon: <FaConciergeBell />,
                    title: 'Planning support',
                    description: 'Dedicated banquet managers and event concierges to coordinate every logistical detail.'
                  }
                ].map((item) => (
                  <article className="events-service-card" key={item.title}>
                    <span className="events-service-icon">{item.icon}</span>
                    <h3>{item.title}</h3>
                    <p>{item.description}</p>
                  </article>
                ))}
              </div>
            </section>
          </>
        ) : isBooking ? (
          <section className="events-subpage events-booking-page">
            <Link to={selectedCategory ? '/events/' + selectedCategory.slug : '/events'} className="events-back">
              <FaArrowLeft /> Back to {selectedCategory?.title || 'Events'}
            </Link>
            <header className="events-subhead">
              <span className="events-eyebrow dark">EVENT REQUEST</span>
              <h1>Plan Your Special Event</h1>
              <p>Share a few details and our hotel events team will craft a tailored proposal for your occasion.</p>
            </header>
            {hall && (
              <div className="events-selected">
                <img src={hall.image} alt="" />
                <div>
                  <span>YOUR SELECTED VENUE</span>
                  <h2>{hall.name}</h2>
                  <p>
                    {hall.hotel} · {hall.location}
                  </p>
                  {form.package && <p className="events-chosen-package">Package: {form.package}</p>}
                </div>
                <b>
                  {hall.min}–{hall.max} guests
                </b>
              </div>
            )}
            {submitted ? (
              <div className="events-confirm">
                <span className="events-confirm-icon">
                  <FaCheck />
                </span>
                <h2>Your event request has been received!</h2>
                <div style={{ maxWidth: '480px', margin: '0 auto 1.5rem', textAlign: 'left', background: '#F8FAFC', padding: '1.25rem', borderRadius: '8px', border: '1px solid #E2E8F0', fontSize: '0.9rem', lineHeight: '1.7' }}>
                  <div><strong>Reference Number:</strong> <span style={{ color: 'var(--c-brass, #B68C48)', fontWeight: 700 }}>{submittedBooking?.confirmationNumber || 'EVT-PENDING'}</span></div>
                  <div><strong>Guest:</strong> {submittedBooking?.customerName || form.name}</div>
                  <div><strong>Venue:</strong> {hall?.name || 'Hotel Event Space'}</div>
                  <div><strong>Requested Date:</strong> {form.date} ({form.start} – {form.end})</div>
                  <div><strong>Estimated Guests:</strong> {form.guests} Guests</div>
                  {form.package && <div><strong>Selected Package:</strong> {form.package}</div>}
                  <div><strong>Status:</strong> <span style={{ color: '#D97706', fontWeight: 600 }}>PENDING HOTEL CONFIRMATION</span></div>
                </div>
                <p>
                  Our banquet team will review availability and prepare a detailed quotation. You will receive an email confirmation shortly.
                </p>
                <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
                  <Link to="/events" className="events-button events-button-gold">
                    Return to Events
                  </Link>
                  <Link to="/my-bookings" className="events-button events-button-outline">
                    View My Bookings
                  </Link>
                </div>
              </div>
            ) : (
              <form className="events-form" onSubmit={submit} noValidate>
                {submitError && (
                  <div style={{ padding: '0.75rem 1rem', background: '#FEE2E2', border: '1px solid #F87171', borderRadius: '6px', color: '#B91C1C', marginBottom: '1rem', fontSize: '0.875rem' }}>
                    {submitError}
                  </div>
                )}
                <h2>Contact details</h2>
                <div className="events-form-grid">
                  <Field
                    label="Full name"
                    name="name"
                    value={form.name}
                    onChange={change}
                    error={errors.name}
                    placeholder="e.g. Priyantha Jayasuriya"
                  />
                  <Field
                    label="Email address"
                    name="email"
                    type="email"
                    value={form.email}
                    onChange={change}
                    error={errors.email}
                    placeholder="e.g. guest@example.com"
                  />
                  <Field
                    label="Contact number"
                    name="phone"
                    type="tel"
                    value={form.phone}
                    onChange={change}
                    error={errors.phone}
                    placeholder="e.g. +94 77 123 4567"
                  />
                </div>
                <h2>Event details</h2>
                <div className="events-form-grid">
                  <label>
                    Event category
                    <select name="category" value={form.category} onChange={change}>
                      <option value="">Choose category</option>
                      {categories.map((c) => (
                        <option value={c.slug} key={c.slug}>
                          {c.title}
                        </option>
                      ))}
                    </select>
                    {errors.category && <small>{errors.category}</small>}
                  </label>
                  <label>
                    Event date
                    <input
                      type="date"
                      name="date"
                      min={new Date().toISOString().slice(0, 10)}
                      value={form.date}
                      onChange={change}
                    />
                    {errors.date && <small>{errors.date}</small>}
                  </label>
                  <label>
                    Start time
                    <input type="time" name="start" value={form.start} onChange={change} />
                    {errors.start && <small>{errors.start}</small>}
                  </label>
                  <label>
                    End time
                    <input type="time" name="end" value={form.end} onChange={change} />
                    {errors.end && <small>{errors.end}</small>}
                  </label>
                  <label>
                    Estimated guests
                    <input
                      type="number"
                      min={hall?.min || 1}
                      max={hall?.max || 9999}
                      name="guests"
                      value={form.guests}
                      onChange={change}
                      placeholder={hall ? hall.min + '–' + hall.max : 'Guest count'}
                    />
                    {errors.guests && <small>{errors.guests}</small>}
                  </label>
                  <label>
                    Seating arrangement
                    <select name="seating" value={form.seating} onChange={change}>
                      <option value="">Choose arrangement</option>
                      {(hall?.seating || ['Banquet', 'Theatre', 'Classroom', 'Reception', 'Boardroom']).map((s) => (
                        <option key={s}>{s}</option>
                      ))}
                    </select>
                    {errors.seating && <small>{errors.seating}</small>}
                  </label>
                  <label className="events-field-wide">
                    Selected package
                    <select name="package" value={form.package} onChange={change}>
                      <option value="">Choose a package</option>
                      {packages.map((p) => (
                        <option key={p.name} value={p.name}>
                          {p.name} {p.price ? `(Rs. ${Number(p.price).toLocaleString()})` : ''}
                        </option>
                      ))}
                      {packages.length === 0 && <option value="Bespoke Arrangement">Bespoke Arrangement</option>}
                    </select>
                    {errors.package && <small>{errors.package}</small>}
                  </label>
                </div>
                <h2>Additional requirements</h2>
                <div className="events-form-grid">
                  <Field
                    label="Catering requirements"
                    name="catering"
                    value={form.catering}
                    onChange={change}
                    placeholder="e.g. Halal buffet, vegetarian courses"
                  />
                  <Field
                    label="Decoration requirements"
                    name="decorations"
                    value={form.decorations}
                    onChange={change}
                    placeholder="e.g. Floral stage, candlelit tables"
                  />
                  <Field
                    label="Equipment requirements"
                    name="equipment"
                    value={form.equipment}
                    onChange={change}
                    placeholder="e.g. Wireless microphones, HD projector"
                  />
                  <label className="events-field-wide">
                    Special requests
                    <textarea
                      name="notes"
                      value={form.notes}
                      onChange={change}
                      rows="3"
                      placeholder="Share any special preferences or schedule notes..."
                    />
                  </label>
                </div>
                <button className="events-button events-button-gold" type="submit" disabled={submitting}>
                  {submitting ? (
                    <>
                      <FaSpinner className="spinner-icon" /> Submitting Request...
                    </>
                  ) : (
                    <>
                      Submit Event Request <FaArrowRight />
                    </>
                  )}
                </button>
                <p className="events-form-note">
                  Your request will be submitted directly to our hotel events and banquets team for verification and formal confirmation.
                </p>
              </form>
            )}
          </section>
        ) : hallId ? (
          hall ? (
            <section className="events-subpage">
              <Link to={'/events/' + (selectedCategory?.slug || hall.categories[0])} className="events-back">
                <FaArrowLeft /> Back to {selectedCategory?.title || 'venues'}
              </Link>
              <div className="events-detail-top">
                <div>
                  <span className="events-eyebrow dark">{hall.type.toUpperCase()} VENUE</span>
                  <h1>{hall.name}</h1>
                  <p className="events-detail-location">
                    <strong>{hall.hotel}</strong> · <FaMapMarkerAlt /> {hall.location}
                  </p>
                </div>
                <button onClick={() => goBook(hall)} className="events-button events-button-gold">
                  Book This Hall <FaArrowRight />
                </button>
              </div>
              <div className="events-gallery">
                <img src={hall.gallery[galleryIndex] || hall.image} alt={hall.name} />
                <div className="events-gallery-thumbs">
                  {(hall.gallery || [hall.image]).map((img, i) => (
                    <button
                      key={img + i}
                      onClick={() => setGalleryIndex(i)}
                      className={galleryIndex === i ? 'active' : ''}
                    >
                      <img src={img} alt={'View ' + (i + 1)} />
                    </button>
                  ))}
                </div>
                {hall.gallery && hall.gallery.length > 1 && (
                  <div className="events-gallery-controls">
                    <button
                      aria-label="Previous image"
                      onClick={() =>
                        setGalleryIndex((galleryIndex + hall.gallery.length - 1) % hall.gallery.length)
                      }
                    >
                      <FaArrowLeft />
                    </button>
                    <button
                      aria-label="Next image"
                      onClick={() => setGalleryIndex((galleryIndex + 1) % hall.gallery.length)}
                    >
                      <FaArrowRight />
                    </button>
                  </div>
                )}
              </div>
              <div className="events-detail-grid">
                <article>
                  <h2>A space to make it yours</h2>
                  <p>{hall.description}</p>
                  <div className="events-facts">
                    <div>
                      <span>FLOOR AREA</span>
                      <b>{hall.area} m²</b>
                    </div>
                    <div>
                      <span>CAPACITY</span>
                      <b>
                        {hall.min}–{hall.max} guests
                      </b>
                    </div>
                    <div>
                      <span>VENUE TYPE</span>
                      <b>{hall.type}</b>
                    </div>
                  </div>
                  <h2>Facilities</h2>
                  <div className="events-chips">
                    {(hall.facilities || []).map((x) => (
                      <span key={x}>
                        <FaCheck />
                        {x}
                      </span>
                    ))}
                  </div>
                  <h2>Seating arrangements</h2>
                  <div className="events-chips">
                    {(hall.seating || []).map((x) => (
                      <span key={x}>{x}</span>
                    ))}
                  </div>
                </article>
                <aside className="events-packages">
                  <span className="events-eyebrow dark">THOUGHTFUL TOUCHES</span>
                  <h2>Event packages</h2>
                  {(hall.packages || []).map((p) => (
                    <div className="events-package" key={p.name}>
                      <span>{p.event}</span>
                      <h3>{p.name}</h3>
                      <p>{p.includes}</p>
                      {p.price > 0 && (
                        <p style={{ fontWeight: 600, color: 'var(--c-brass, #B68C48)', marginTop: '0.25rem' }}>
                          From Rs. {Number(p.price).toLocaleString()}
                        </p>
                      )}
                      <button
                        onClick={() =>
                          navigate(
                            '/events/' +
                              (categorySlug || hall.categories[0]) +
                              '/' +
                              (hall.slug || hall.id) +
                              '/book?package=' +
                              encodeURIComponent(p.name)
                          )
                        }
                      >
                        Select package <FaArrowRight />
                      </button>
                    </div>
                  ))}
                </aside>
              </div>
            </section>
          ) : (
            <NotFound />
          )
        ) : !selectedCategory ? (
          <NotFound />
        ) : (
          <section className={`events-subpage events-category-page events-category-${categorySlug}`}>
            <Link to="/events" className="events-back">
              <FaArrowLeft /> All events
            </Link>
            <header
              className="events-category-hero"
              style={{
                backgroundImage:
                  'linear-gradient(90deg,rgba(12,29,27,.78),rgba(12,29,27,.15)),url(' +
                  selectedCategory.image +
                  ')'
              }}
            >
              <span className="events-eyebrow">SERENDIB SANCTUARY · FLAGSHIP PROPERTY</span>
              <h1>{selectedCategory.title}</h1>
              <p>{selectedCategory.description}</p>
            </header>
            <div className="events-list-heading">
              <div>
                <span className="events-eyebrow dark">DISCOVER OUR SPACES</span>
                <h2>Venues for your occasion</h2>
                <p>Curated hotel inventory · Contact our events concierge for date availability.</p>
              </div>
              <span className="events-sample-badge">Active Property Venues</span>
            </div>
            <div className="events-filters">
              <label>
                Location
                <input
                  placeholder="Search location"
                  value={filters.location}
                  onChange={(e) => setFilters({ ...filters, location: e.target.value })}
                />
              </label>
              <label>
                Venue type
                <select
                  value={filters.venue}
                  onChange={(e) => setFilters({ ...filters, venue: e.target.value })}
                >
                  <option value="">All venues</option>
                  <option>Indoor</option>
                  <option>Outdoor</option>
                </select>
              </label>
              <label>
                Minimum capacity
                <input
                  type="number"
                  min="1"
                  placeholder="Guests"
                  value={filters.capacity}
                  onChange={(e) => setFilters({ ...filters, capacity: e.target.value })}
                />
              </label>
            </div>
            {matching.length ? (
              <div className="events-hall-list">
                {matching.map((h) => (
                  <article className="events-hall-card" key={h.id || h.slug || h._id}>
                    <img src={h.image} alt={h.name} />
                    <div className="events-hall-content">
                      <span className="events-hall-type">
                        {h.type} · {h.area} m²
                      </span>
                      <h3>{h.name}</h3>
                      <p className="events-hall-hotel">
                        {h.hotel} · {h.location}
                      </p>
                      <p>{h.description}</p>
                      <div className="events-hall-meta">
                        <span>
                          <FaUsers /> {h.min}–{h.max} guests
                        </span>
                        <span>{(h.seating || []).slice(0, 2).join(' · ')}</span>
                      </div>
                      <div className="events-chips">
                        {(h.facilities || []).slice(0, 4).map((x) => (
                          <span key={x}>{x}</span>
                        ))}
                      </div>
                      <div className="events-hall-actions">
                        <Link
                          className="events-button events-button-outline"
                          to={'/events/' + categorySlug + '/' + (h.slug || h.id)}
                        >
                          View Details <FaChevronRight />
                        </Link>
                        <button className="events-button events-button-gold" onClick={() => goBook(h)}>
                          Book Now <FaArrowRight />
                        </button>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="events-empty">
                <h3>No venues match those filters</h3>
                <p>Try changing your location, venue type or capacity.</p>
                <button onClick={() => setFilters({ location: '', venue: '', capacity: '' })}>
                  Clear filters
                </button>
              </div>
            )}
          </section>
        )}
        {isSampleData && (
          <div className="events-disclaimer">
            Demonstration mode: Venues and capacities shown above are based on initial layout specifications.
          </div>
        )}
      </div>
    </CustomerLayout>
  );
};

function Field({ label, error, ...props }) {
  return (
    <label>
      {label}
      <input {...props} />
      {error && <small>{error}</small>}
    </label>
  );
}

function NotFound() {
  return (
    <section className="events-subpage events-empty">
      <h1>Venue not found</h1>
      <Link to="/events">Return to Events</Link>
    </section>
  );
}

export default Events;
