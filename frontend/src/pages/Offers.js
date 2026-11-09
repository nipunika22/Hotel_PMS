import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { FaArrowRight, FaArrowLeft, FaCheck, FaMapMarkerAlt, FaRegCalendarAlt, FaUsers } from 'react-icons/fa';
import CustomerLayout from '../components/CustomerLayout';
import { restaurantAPI } from '../services/api';
import { DEFAULT_RESTAURANTS } from '../config/restaurantData';
import { DINING_PROMOTIONAL_EXPERIENCES } from '../config/diningExperiences';
import { eventHalls } from '../config/eventData';
import roomDeluxeImage from '../assets/room-deluxe.jpg';
import roomSuiteImage from '../assets/room-suite.jpg';
import './RestaurantExperience.css';
import './Offers.css';

const LOCAL_IMG='https://images.unsplash.com/photo-1540541338287-41700207dee6?auto=format&fit=crop&w=1600&q=85';
const INTERNATIONAL_IMG='https://images.unsplash.com/photo-1530789253388-582c481c54b0?auto=format&fit=crop&w=1600&q=85';
const localRoomOffers=[
 {id:'local-weekend-retreat',title:'Weekend Sanctuary Stay',category:'rooms',description:'A sample weekend escape for Sri Lankan guests looking to recharge close to home.',image:'https://images.unsplash.com/photo-1611892440504-42a792e24d32?auto=format&fit=crop&w=1200&q=85',property:'Serendib Sanctuary · Flagship Property',benefits:['Weekend stay inspiration','Explore hotel facilities'],sample:true,actionUrl:'/#rooms'},
 {id:'local-family-island-stay',title:'Family Island Stay',category:'rooms',description:'A sample family holiday idea with room to slow down, share meals and explore the island.',image:'https://images.unsplash.com/photo-1571896349842-33c89424de2d?auto=format&fit=crop&w=1200&q=85',property:'Serendib Sanctuary · Flagship Property',benefits:['Family holiday inspiration','Dining and experiences to discover'],sample:true,actionUrl:'/#rooms'},
 {id:'local-school-holiday',title:'School Holiday Getaway',category:'rooms',description:'A suggested school-break stay concept for families planning a local escape.',image:'https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=1200&q=85',property:'Serendib Sanctuary · Flagship Property',benefits:['Flexible holiday inspiration','Explore available rooms'],sample:true,actionUrl:'/#rooms'}
];
const internationalRoomOffers=[
 {id:'intl-sri-lanka-discovery',title:'Sri Lanka Discovery Stay',category:'rooms',description:'A sample multi-night island stay concept for travellers discovering Sri Lanka for the first time.',image:'https://images.unsplash.com/photo-1540541338287-41700207dee6?auto=format&fit=crop&w=1200&q=85',property:'Serendib Sanctuary · Sri Lanka',benefits:['A base for island exploration','Room options to check on the hotel site'],sample:true,actionUrl:'/#rooms'},
 {id:'intl-tropical-island-escape',title:'Tropical Island Escape',category:'rooms',description:'A suggested tropical retreat for international visitors seeking a slower pace between island discoveries.',image:'https://images.unsplash.com/photo-1578683010236-d716f9a3f461?auto=format&fit=crop&w=1200&q=85',property:'Serendib Sanctuary · Sri Lanka',benefits:['Tropical stay inspiration','Explore available rooms'],sample:true,actionUrl:'/#rooms'},
 {id:'intl-multi-night-luxury',title:'Multi-Night Luxury Stay',category:'rooms',description:'A sample extended stay idea with time to settle in and experience more of Sri Lanka.',image:'https://images.unsplash.com/photo-1590490360182-c33d57733427?auto=format&fit=crop&w=1200&q=85',property:'Serendib Sanctuary · Sri Lanka',benefits:['Longer island stay inspiration','Room options to check on the hotel site'],sample:true,actionUrl:'/#rooms'}
];
const eventOffer=(hallId,id,title,description,packageName)=>{const h=eventHalls.find(x=>x.id===hallId);const p=h?.packages.find(x=>x.name===packageName)||h?.packages[0];return {id,title,category:'events',description,image:h?.image,gallery:h?.gallery||[],venueName:h?.name,property:h?.hotel,location:h?.location,benefits:p?[p.includes,...h.facilities.slice(0,2)]:[],capacity:h?h.min+'–'+h.max+' guests':'',sample:true,hallId,eventCategory:h?.categories[0]||'weddings',packageName:p?.name||packageName}};
const localEventOffers=[eventOffer('grand-ballroom','local-wedding-celebration','Wedding Reception Celebration','A sample reception package idea for families celebrating together in Sri Lanka.','Celebration Collection'),eventOffer('private-function-room','local-family-celebration','Family Celebration Gathering','A sample venue package concept for birthdays, anniversaries and family occasions.','Private Celebration')];
const internationalEventOffers=[eventOffer('grand-ballroom','intl-destination-wedding','Destination Wedding Experience','A sample destination celebration concept for couples bringing family and friends to Sri Lanka.','Celebration Collection'),eventOffer('garden-terrace','intl-honeymoon-celebration','Honeymoon Celebration','A sample private celebration idea to complement a couple’s Sri Lankan journey.','Wedding Ceremony'),eventOffer('private-function-room','intl-private-celebration','Private Island Celebration','A suggested intimate event concept for international visitors celebrating in Sri Lanka.','Private Celebration')];
const localExperienceOffers=[
 {id:'local-ceylon-tea',title:'Ceylon Tea & Highland Inspiration',category:'experiences',description:'A sample experience idea inspired by Sri Lanka’s tea country and local heritage.',image:'https://images.unsplash.com/photo-1576092768241-dec231879fc3?auto=format&fit=crop&w=1200&q=85',benefits:['Tea country inspiration','Local culture to explore'],sample:true},
 {id:'local-coastal-evening',title:'Coastal Evening Experience',category:'experiences',description:'A suggested slow evening shaped around Sri Lanka’s coastal atmosphere.',image:'https://images.unsplash.com/photo-1519708227418-c8fd9a32b7a2?auto=format&fit=crop&w=1200&q=85',benefits:['Coastal setting inspiration','Dining and relaxation'],sample:true},
 {id:'local-family-experience',title:'Family Island Day',category:'experiences',description:'A sample day-out concept for families looking to spend time together during a local hotel stay.',image:'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=1200&q=85',benefits:['Family-friendly inspiration','Island setting'],sample:true}
];
const internationalExperienceOffers=[
 {id:'intl-ceylon-culture',title:'Ceylon Culture & Tea Trails',category:'experiences',description:'A sample travel inspiration connecting visitors with Sri Lanka’s tea heritage and highland scenery.',image:'https://images.unsplash.com/photo-1544735716-392fe2489ffa?auto=format&fit=crop&w=1200&q=85',benefits:['Tea country inspiration','Cultural discovery'],sample:true},
 {id:'intl-wildlife-discovery',title:'Island Nature Discovery',category:'experiences',description:'A suggested nature-led experience concept for travellers exploring Sri Lanka’s landscapes.',image:'https://images.unsplash.com/photo-1581852017103-68ac6550407b?auto=format&fit=crop&w=1200&q=85',benefits:['Nature and wildlife inspiration','Island discovery'],sample:true},
 {id:'intl-ayurveda-relaxation',title:'Island Wellness & Relaxation',category:'experiences',description:'A sample relaxation concept inspired by Sri Lankan wellness traditions and tropical surroundings.',image:'https://images.unsplash.com/photo-1540555700478-4be289fbecef?auto=format&fit=crop&w=1200&q=85',benefits:['Wellness inspiration','Time to unwind'],sample:true},
 {id:'intl-sri-lankan-cuisine',title:'Sri Lankan Cuisine Discovery',category:'experiences',description:'A suggested culinary journey introducing visitors to the flavours and traditions of Sri Lankan cooking.',image:'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=1200&q=85',benefits:['Local cuisine inspiration','Cultural discovery'],sample:true}
];
const normalizeDining=(offer,index,restaurants)=>{const rid=typeof offer.restaurant==='object'?offer.restaurant?._id:offer.restaurant;const rest=restaurants.find(r=>r._id===rid||r.slug===rid)||(typeof offer.restaurant==='object'?offer.restaurant:null);const img=offer.image||rest?.image||DINING_PROMOTIONAL_EXPERIENCES.find(x=>x.title===offer.title)?.image||['https://images.unsplash.com/photo-1510812431401-41d2bd2722f3?auto=format&fit=crop&w=1200&q=85','https://images.unsplash.com/photo-1576092768241-dec231879fc3?auto=format&fit=crop&w=1200&q=85','https://images.unsplash.com/photo-1414235077428-338989a2e8c0?auto=format&fit=crop&w=1200&q=85'][index%3];return {...offer,id:String(offer._id||offer.id||('dining-'+index)),title:offer.title||offer.name||'Dining experience',category:'dining',description:offer.description||offer.shortDescription||'',image:img,gallery:offer.gallery||offer.images||[],restaurantName:rest?.name,property:offer.venue||rest?.name||'Hotel dining venue',location:offer.location||rest?.location,benefits:offer.highlights||offer.inclusions||[],price:offer.price,discount:offer.discount,validFrom:offer.validFrom,validTo:offer.validTo,sample:!!offer.frontendOnly,restaurantSlug:rest?.slug,restaurantId:rid,experienceType:offer.experienceType||'Dining experience',guestType:offer.eligibleGuestType||offer.guestType||offer.audience||'',source:offer.frontendOnly?'Dining experience':'Dining offer'};};
const buildEventOffers=()=>eventHalls.flatMap(h=>h.packages.map((p,i)=>({id:'event-'+h.id+'-'+i,title:p.name,category:'events',description:p.includes,fullDescription:h.description,image:h.image,property:h.hotel,location:h.location,benefits:[p.includes,...h.facilities.slice(0,3)],capacity:h.min+'–'+h.max+' guests',sample:true,hallId:h.id,eventCategory:h.categories[0],packageName:p.name,validity:'Dates and availability to be confirmed'})));
const labelFor={rooms:'Rooms & Stays',dining:'Dining',events:'Events & Halls',experiences:'Experiences'};
const offerCategories=['rooms','dining','events','experiences'];
const getOfferImageFallback=(item)=>item.category==='rooms'?roomSuiteImage:[...(Array.isArray(item.gallery)?item.gallery:[]),...(Array.isArray(item.images)?item.images:[])].find(image=>typeof image==='string'&&image&&image!==item.image)||null;
const readPrice=(value)=>{if(value===null||value===undefined||typeof value==='boolean'||(typeof value==='string'&&!value.trim()))return null;const amount=Number(value);return Number.isFinite(amount)&&amount>=0?amount:null;};
const readDiscountPercent=(item)=>{const explicit=readPrice(item.discountPercentage);if(explicit!==null&&explicit<=100)return explicit;if(typeof item.discount==='number')return item.discount>=0&&item.discount<=100?item.discount:null;if(typeof item.discount==='string'){const match=item.discount.match(/^\s*(\d+(?:\.\d+)?)\s*%/);if(match){const value=Number(match[1]);return value<=100?value:null;}}return null;};
function OfferPriceDetails({item}){const price=readPrice(item.price??item.offerPrice??item.finalPrice);const original=readPrice(item.originalPrice??item.regularPrice??item.listPrice);const discount=readDiscountPercent(item);const finalPrice=price!==null?price:original!==null&&discount!==null?original*(1-discount/100):null;const currency=item.currency||'LKR';const savings=original!==null&&finalPrice!==null&&original>finalPrice?original-finalPrice:null;return <div className="offers-detail-pricing">{original!==null&&finalPrice!==null&&original>finalPrice&&<p className="offers-original-price">Original price <s>{currency} {original.toLocaleString()}</s></p>}{discount!==null&&<span className="offers-discount">{discount}% OFF</span>}{finalPrice!==null?<p className="offers-price"><span>{original!==null&&original>finalPrice?'Offer price':'Price'}</span><strong>{currency} {finalPrice.toLocaleString()}</strong></p>:<p className="offers-price">Price available on request</p>}{savings!==null&&<p className="offers-savings">You save {currency} {savings.toLocaleString()}</p>}{discount===null&&typeof item.discount==='string'&&item.discount.trim()&&<p className="offers-discount-note">{item.discount}</p>}</div>;}
function Offers(){const {audience,offerId}=useParams();const navigate=useNavigate();const [searchParams]=useSearchParams();const categoryFilter=searchParams.get('category');const [dining,setDining]=useState([]);const [loading,setLoading]=useState(true);const [filter,setFilter]=useState('all');const [galleryIndex,setGalleryIndex]=useState(0);
 useEffect(()=>setFilter(offerCategories.includes(categoryFilter)?categoryFilter:'all'),[audience,categoryFilter]);
 useEffect(()=>setGalleryIndex(0),[offerId]);
 useEffect(()=>{let active=true;(async()=>{let restaurants=DEFAULT_RESTAURANTS;let apiOffers=[];try{const r=await restaurantAPI.getRestaurants();if(Array.isArray(r.data?.data)&&r.data.data.length){restaurants=r.data.data;const response=await Promise.all(restaurants.map(async x=>{if(!x._id)return [];try{const o=await restaurantAPI.getRestaurantOffers(x._id);return Array.isArray(o.data?.data)?o.data.data.map(y=>({...y,restaurant:y.restaurant||{_id:x._id,name:x.name,slug:x.slug,location:x.location}})):[]}catch{return []}}));apiOffers=response.flat().map(x=>({...x,frontendOnly:false}));}}catch{}const getCat=(offer)=>{if(offer.category)return offer.category;const t=[offer.title,offer.name,offer.slug,offer.tag].filter(Boolean).join(' ').toLowerCase();if(/sunset/.test(t))return 'sunset';if(/romantic|candlelit/.test(t))return 'romantic';if(/afternoon tea|tea service/.test(t))return 'tea';if(/chef.*signature|signature.*chef|chef-led/.test(t))return 'chef';if(/private.*(ocean|beach|pavilion)|beach.*dining|beachfront/.test(t))return 'beach';if(/family.*(brunch|dining)|family-friendly/.test(t))return 'family';if(/weekend.*buffet|international buffet/.test(t))return 'buffet';return null};const liveCats=new Set(apiOffers.map(getCat).filter(Boolean));const titles=new Set(apiOffers.map(x=>(x.title||'').trim().toLowerCase()));const experiences=restaurants.flatMap(r=>(Array.isArray(r.experiences)?r.experiences:[]).map((x,i)=>({...x,id:x._id||r.slug+'-experience-'+i,title:x.title||x.name,restaurant:{_id:r._id,name:r.name,slug:r.slug},venue:r.name,location:r.location,experienceType:x.tag||'Restaurant experience',category:getCat(x),frontendOnly:true})));const usedCats=new Set(liveCats);const supplementary=experiences.filter(x=>{const t=(x.title||'').trim().toLowerCase(),c=getCat(x);if(titles.has(t)||(c&&usedCats.has(c)))return false;if(c)usedCats.add(c);titles.add(t);return true});const promos=DINING_PROMOTIONAL_EXPERIENCES.filter(x=>{const t=x.title.toLowerCase(),c=getCat(x);if(titles.has(t)||(c&&usedCats.has(c)))return false;if(c)usedCats.add(c);titles.add(t);return true});const normalized=[...apiOffers,...supplementary,...promos].map(normalizeDining);if(active){setDining(normalized);setLoading(false)}})();return()=>{active=false}},[]);
 const diningCollections=useMemo(()=>{const local=[],international=[];dining.forEach((offer,index)=>{const eligibility=String(offer.guestType||'').toLowerCase();if(/local|sri.?lankan|resident/.test(eligibility)){local.push(offer);return}if(/international|foreign|overseas/.test(eligibility)){international.push(offer);return}const words=(offer.title+' '+offer.description+' '+offer.experienceType).toLowerCase();const localScore=(words.match(/family|weekend|buffet|ceylon|heritage|local|brunch|sri lankan/g)||[]).length;const internationalScore=(words.match(/romantic|sunset|chef|tea|coastal|private|ocean|island|signature|tasting/g)||[]).length;if(localScore>internationalScore)local.push(offer);else if(internationalScore>localScore)international.push(offer);else (index%2===0?local:international).push(offer)});return {local,international}},[dining]);
 const localCatalog=useMemo(()=>[...localRoomOffers,...diningCollections.local,...localEventOffers,...localExperienceOffers],[diningCollections]);
 const internationalCatalog=useMemo(()=>[...internationalRoomOffers,...diningCollections.international,...internationalEventOffers,...internationalExperienceOffers],[diningCollections]);
 const catalog=offerId?[...localCatalog,...internationalCatalog]:audience==='local'?localCatalog:audience==='international'?internationalCatalog:[];
 const selected=catalog.find(x=>x.id===offerId)||[...localCatalog,...internationalCatalog].find(x=>x.id===offerId);
 const visible=useMemo(()=>catalog.filter(x=>filter==='all'||x.category===filter),[catalog,filter]);
 const title=audience==='local'?'Exclusive Offers for Sri Lankan Guests':audience==='international'?'Discover Sri Lanka with Exclusive Offers':'Discover Exclusive Hotel Offers';
 const intro='Explore exceptional stays, dining experiences, and celebrations with offers designed for every occasion.';
  const detailAudience=audience||searchParams.get('audience')||(localCatalog.some(item=>item.id===offerId)?'local':'international');
  const exploreUrl=(item)=>`/offers/${detailAudience}?category=${item.category}#all-offers`;
  const bookUrl=(item)=>item.category==='events'?'/events/'+item.eventCategory+'/'+item.hallId+'/book?package='+encodeURIComponent(item.packageName):item.category==='dining'?(item.restaurantSlug?'/restaurants/'+item.restaurantSlug+'?book=1&offerId='+encodeURIComponent(item.sample?'':item._id||''):'/dining?book=1&restaurantId='+encodeURIComponent(item.restaurantId||'')+'&offerId='+encodeURIComponent(item.sample?'':item._id||'')):item.category==='rooms'?`/?${item.roomId?'roomId='+encodeURIComponent(item.roomId):'chooseRoom=1'}&stayOffer=${encodeURIComponent(item.id)}#rooms`:'/dining';
  const bookingLabel=(item)=>item.category==='events'?'ENQUIRE ABOUT THIS EVENT':item.category==='rooms'?'BOOK YOUR STAY':item.category==='dining'?'RESERVE EXPERIENCE':'Explore Experiences';
  const selectedImages=selected?[...new Set([selected.image,...(Array.isArray(selected.gallery)?selected.gallery:[]),...(Array.isArray(selected.images)?selected.images:[])].filter(image=>typeof image==='string'&&image))]:[];
 const goBack=()=>navigate(-1);
 return <CustomerLayout variant={!audience&&!offerId ? 'transparent' : 'solid'}><div className={`offers-page ${!audience&&!offerId ? 'offers-landing' : ''}`}>
  {selected ? (
    <section className="offers-detail">
      <button className="offers-back" onClick={goBack}><FaArrowLeft /> Back to offers</button>
      <div className="offers-detail-layout">
        <div className="offers-detail-media">
          <img
            className="offers-detail-image"
            src={selectedImages[galleryIndex] || (selected.category === 'rooms' ? roomDeluxeImage : undefined)}
            alt={selected.title}
            onError={(event) => {
              if (galleryIndex + 1 < selectedImages.length) {
                setGalleryIndex(galleryIndex + 1);
              } else if (selected.category === 'rooms' && event.currentTarget.dataset.fallback !== 'true') {
                event.currentTarget.dataset.fallback = 'true';
                event.currentTarget.src = roomDeluxeImage;
              } else {
                event.currentTarget.style.visibility = 'hidden';
              }
            }}
          />
          {selectedImages.length > 1 && (
            <div className="offers-detail-gallery" aria-label="Offer image gallery">
              {selectedImages.map((image, index) => (
                <button
                  key={image}
                  type="button"
                  className={galleryIndex === index ? 'active' : ''}
                  onClick={() => setGalleryIndex(index)}
                  aria-label={'View offer image ' + (index + 1)}
                  aria-pressed={galleryIndex === index}
                >
                  <img src={image} alt="" onError={(event) => { event.currentTarget.style.visibility = 'hidden'; }} />
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="offers-detail-copy">
          <span className="offers-eyebrow dark">{labelFor[selected.category] || 'Hotel Offer'}{selected.sample ? ' - SAMPLE CONTENT' : ''}</span>
          <h1>{selected.title}</h1>
          {(selected.fullDescription || selected.description) && (
            <p className="offers-detail-desc">{selected.fullDescription || selected.description}</p>
          )}
          <div className="offers-detail-meta">
            {selected.property && <span><FaMapMarkerAlt />{selected.property}</span>}
            {(selected.venueName || selected.restaurantName || selected.relatedRoom || selected.roomName || selected.roomType || selected.room?.name || selected.room?.roomType) && (
              <span><FaMapMarkerAlt />{selected.venueName || selected.restaurantName || selected.relatedRoom || selected.roomName || selected.roomType || selected.room?.name || selected.room?.roomType}</span>
            )}
            {selected.location && <span><FaMapMarkerAlt />{selected.location}</span>}
            {selected.capacity && <span><FaUsers />{selected.capacity}</span>}
            {(selected.validFrom || selected.validTo || selected.validUntil || selected.validity) && (
              <span><FaRegCalendarAlt />{selected.validity || [selected.validFrom, selected.validTo || selected.validUntil].filter(Boolean).join(' - ')}</span>
            )}
            {selected.applicableDays?.length > 0 && <span><FaRegCalendarAlt />Available: {selected.applicableDays.join(', ')}</span>}
          </div>
          <OfferPriceDetails item={selected} />
          {selected.benefits?.length > 0 && (
            <>
              <h3>Included highlights</h3>
              <ul>{selected.benefits.map((item, index) => (
                <li key={index}><FaCheck />{typeof item === 'string' ? item : item.name || item.title || JSON.stringify(item)}</li>
              ))}</ul>
            </>
          )}
          {(selected.terms || selected.termsAndConditions) && (
            <p className="offers-detail-terms"><strong>Terms:</strong> {Array.isArray(selected.terms || selected.termsAndConditions) ? (selected.terms || selected.termsAndConditions).join(' / ') : selected.terms || selected.termsAndConditions}</p>
          )}
          {selected.sample && <p className="offers-sample-note">Sample information only. Confirm inclusions, dates, guest eligibility and availability with the hotel.</p>}
          {selected.category === 'dining' && <p className="offers-sample-note">Guest eligibility and offer conditions are not specified in the available dining offer data. These offers are grouped by experience theme for discovery, not by eligibility; please confirm with the venue.</p>}
          <div className="offers-detail-actions">
            <Link className="offers-button outline" to={exploreUrl(selected)}>
              Explore more {labelFor[selected.category] || 'offers'} <FaArrowRight />
            </Link>
            <Link className="offers-button gold" to={bookUrl(selected)}>
              {bookingLabel(selected)} <FaArrowRight />
            </Link>
          </div>
        </div>
      </div>
    </section>
  ) : offerId && loading ? <section className="offers-state">Loading offer details...</section> :
 <><section className="offers-hero rest-hero-cinema" style={{backgroundImage:'linear-gradient(90deg,rgba(13,34,31,.78),rgba(13,34,31,.12)),url(https://images.unsplash.com/photo-1540541338287-41700207dee6?auto=format&fit=crop&w=2200&q=90)'}}><div className="offers-hero-overlay rest-hero-overlay"/><div className="offers-hero-content rest-hero-content"><span className="rest-badge-pill">STAYS · DINING · CELEBRATIONS</span><h1 className="rest-hero-title">{title}</h1><p className="rest-hero-subtitle">{intro}</p><div className="offers-hero-actions rest-hero-actions"><a href={audience ? "#all-offers" : "#offers-categories"} className="rest-btn-primary">Explore Offers <FaArrowRight/></a><Link className="rest-btn-secondary" to={audience==='local'?'/offers/international':audience==='international'?'/offers/local':'/offers/local'}>{audience==='local'?'International Offers':audience==='international'?'Sri Lankan Offers':'Browse Guest Collections'} <FaArrowRight/></Link></div></div></section>
 {(!audience||audience==='')&&<section id="offers-categories" className="offers-audience"><div className="offers-audience-grid"><Link to="/offers/local" className="offers-audience-card"><img src={LOCAL_IMG} alt="Sri Lankan hotel getaway"/><span className="offers-image-shade"/><div><span className="offers-eyebrow">LOCAL COLLECTION</span><h3>Sri Lankan Offers</h3><p>Discover hotel stays, dining experiences, event packages and seasonal inspirations for a getaway close to home.</p><span className="offers-text-link">Explore Sri Lankan Offers <FaArrowRight/></span></div></Link><Link to="/offers/international" className="offers-audience-card"><img src={INTERNATIONAL_IMG} alt="International traveller exploring Sri Lanka"/><span className="offers-image-shade"/><div><span className="offers-eyebrow">ISLAND COLLECTION</span><h3>International Offers</h3><p>Explore memorable stays, dining experiences and celebrations while discovering Sri Lankan hospitality.</p><span className="offers-text-link">Explore International Offers <FaArrowRight/></span></div></Link></div></section>}
 {(!audience||audience==='')&&<section className="offers-discover"><header className="offers-section-heading"><span className="offers-eyebrow dark">MORE TO EXPERIENCE</span><h2>Discover More Ways to Stay</h2><p>Explore special stays, dining experiences, and memorable celebrations with offers designed to make every visit more rewarding.</p></header><div className="offers-discover-grid"><Link to="/offers/local" className="offers-discover-card"><img src={localRoomOffers[0].image} alt="" loading="lazy"/><div><span className="offers-discover-label">SAMPLE INSPIRATION</span><h3>Exclusive Stays</h3><p>Room packages, weekend escapes, and extended-stay ideas. Sample content; rates and availability are not confirmed.</p><span className="offers-discover-link">Explore stay ideas <FaArrowRight/></span></div></Link><Link to="/dining" className="offers-discover-card"><img src={DINING_PROMOTIONAL_EXPERIENCES[0]?.image||'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?auto=format&fit=crop&w=1200&q=85'} alt="" loading="lazy"/><div><span className="offers-discover-label">DINING</span><h3>Dining Experiences</h3><p>Browse restaurant experiences and dining information for your visit.</p><span className="offers-discover-link">Explore Dining <FaArrowRight/></span></div></Link><Link to="/events" className="offers-discover-card"><img src={eventHalls[0]?.image||LOCAL_IMG} alt="" loading="lazy"/><div><span className="offers-discover-label">SAMPLE INSPIRATION</span><h3>Events &amp; Celebrations</h3><p>Explore event spaces, wedding packages, and celebration ideas. Details and availability are not confirmed.</p><span className="offers-discover-link">Explore Events <FaArrowRight/></span></div></Link></div></section>}
 {audience&&<section className="offers-audience-intro"><Link to="/offers" className="offers-back"><FaArrowLeft/> All offers</Link><span className="offers-eyebrow dark">{audience==='local'?'SRI LANKAN GUEST COLLECTION':'INTERNATIONAL GUEST COLLECTION'}</span><h2>{title}</h2></section>}
 {audience&&<section className="offers-all" id="all-offers"><header className="offers-section-heading"><span className="offers-eyebrow dark">THE COLLECTION</span><h2>{audience?'Offers to inspire your stay':'Explore All Hotel Offers'}</h2><p>Explore room inspirations, available dining offers, event packages and experiences in one place.</p></header><div className="offers-filter-row"><div className="offers-tabs" role="tablist" aria-label="Filter offers by category">{[['all','All Offers'],['rooms','Rooms & Stays'],['dining','Dining'],['events','Events & Halls'],['experiences','Experiences']].map(([id,label])=><button key={id} className={filter===id?'active':''} onClick={()=>setFilter(id)} role="tab" aria-selected={filter===id}>{label}</button>)}</div></div>{loading?<div className="offers-state">Loading current dining offers…</div>:visible.length?<div className="offers-grid">{visible.map(item=><OfferCard key={item.id} item={item} onView={()=>navigate('/offers/detail/'+encodeURIComponent(item.id)+'?audience='+audience)} booking={bookUrl(item)}/>)}</div>:<div className="offers-state"><h3>No offers in this category yet</h3><p>Dining offers load from the existing restaurant data. Other offers will appear when verified information is available.</p></div>}</section>}</>}
 </div></CustomerLayout>;
}
function OfferCard({item,onView,booking}){return <article className="offers-card"><div className="offers-card-image"><img src={item.image} alt={item.title} loading="lazy" onError={(event)=>{const fallback=getOfferImageFallback(item);if(fallback&&event.currentTarget.src!==fallback){event.currentTarget.src=fallback}else{event.currentTarget.style.visibility="hidden"}}}/>{item.sample&&<span className="offers-sample-tag">Sample concept</span>}<span className="offers-type-tag">{labelFor[item.category]||labelFor.experiences}</span></div><div className="offers-card-body"><h3>{item.title}</h3><p className="offers-card-property">{item.property||item.location||'Serendib Sanctuary'}</p>{item.description&&<p className="offers-card-description">{item.description}</p>}{item.benefits?.length>0&&<div className="offers-benefit-line"><FaCheck/> {typeof item.benefits[0]==='string'?item.benefits[0]:item.benefits[0].name||item.benefits[0].title}</div>}{(item.price||item.discount)&&<p className="offers-price">{item.discount||((item.currency||'LKR')+' '+Number(item.price).toLocaleString())}</p>}{(item.category==='dining'||item.sample)&&<p className="offers-eligibility">{item.category==='dining'?'Guest eligibility to be confirmed': 'Illustrative concept · Details to be confirmed'}</p>}<div className="offers-card-actions"><button className="offers-button outline" onClick={onView}>View Offer <FaArrowRight/></button>{booking&&<Link className="offers-text-action" to={booking}>{item.category==='events'?'ENQUIRE ABOUT THIS EVENT':item.category==='rooms'?'BOOK YOUR STAY':item.category==='dining'?'RESERVE EXPERIENCE':'Explore Experiences'} <FaArrowRight/></Link>}</div></div></article>}
export default Offers;
