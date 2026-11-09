// frontend/src/config/authImages.js
/**
 * Configurable Authentication Photography & Editorial Content
 * 
 * Allows replacing hotel imagery and inspirational quotes easily
 * when customized high-resolution photography is provided.
 */

import resortPhoto from '../assets/hotel-resort-cinematic.jpg';
import lobbyPhoto from '../assets/hotel-lobby-cinematic.jpg';

export const authContent = {
  login: {
    image: resortPhoto,
    alt: 'Serendib Sanctuary Oceanfront Resort, Sri Lanka',
    eyebrow: 'Island Sanctuary • Sri Lanka',
    title: 'A Haven of Timeless Serenity',
    quote: 'Where the gentle rhythm of the Indian Ocean meets emerald coconut palms and gracious island hospitality.',
    location: 'Southern Coast • Sri Lanka'
  },
  register: {
    image: lobbyPhoto,
    alt: 'Serendib Sanctuary Heritage Pavilions, Sri Lanka',
    eyebrow: 'Direct Guest Privileges',
    title: 'Begin Your Serendib Journey',
    quote: 'Discover bespoke stays, guaranteed direct rates, and personalized concierge care designed around your pace.',
    location: 'Highland Pavilions • Sri Lanka'
  }
};

export default authContent;
