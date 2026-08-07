/** Weekly Shabbos RSVP — branching by “Are you coming?” */

export const COMING_OPTIONS = [
  { value: 'yes', label: 'Yes, I am coming!', next: 'prefs' },
  {
    value: 'yes_guest',
    label: 'Yes, I am coming and bringing a guest',
    next: 'guests',
  },
  {
    value: 'yes_new',
    label: 'Yes, and I am a newcomer',
    next: 'newcomer',
  },
  { value: 'probably', label: 'Probably yes', next: 'probably' },
  {
    value: 'social',
    label: 'Coming later to hang out and socialize',
    next: 'social',
  },
  {
    value: 'unsure',
    label: "I'm not sure yet / need to confirm later",
    next: 'unsure',
  },
  {
    value: 'no',
    label: "No, I can't make it this time",
    next: 'declined',
  },
  {
    value: 'help',
    label: 'I am only here to help with setup/cleanup or to sponsor',
    next: 'sponsor_only',
  },
]

/** Shown on the public This Week board. */
export const PUBLIC_COMING_VALUES = [
  'yes',
  'yes_guest',
  'yes_new',
  'probably',
  'social',
  'unsure',
]

export function comingOptionLabel(value) {
  return COMING_OPTIONS.find((o) => o.value === value)?.label || value || ''
}

export const MEAL_STYLE_OPTIONS = [
  {
    value: 'host_cook',
    label: 'Host cooks — I just come as I am to feast',
  },
  {
    value: 'potluck',
    label: 'Potluck — everyone brings a dish',
  },
  {
    value: 'hybrid',
    label: 'Hybrid — host cooks some food and guests bring dishes too',
  },
  { value: 'other', label: 'Other' },
]

export const FOOD_LIKE_OPTIONS = [
  'Challah and dips (use Other to specify dips or challah type)',
  "Abe's Babaganush",
  'Salmon BBQ',
  'Salmon Pickled (Abe Special)',
  'Salmon fillet',
  'Salmon patties',
  'Sushi Platter',
  'Gefilte Fish',
  'Soup',
  'Chicken soup',
  'Chicken',
  'Meat (Special Occasion)',
  'Slow roasted beef',
  'Rice',
  'Kugel',
  'Potato kugel',
  'Potatoes',
  'Garlic potato',
  'Wine',
  'Hard Liquor',
  'Salad (please specify in Other)',
  'Mixed salad',
  'Corn',
  'Broccoli',
  'Peas',
  'Matzo',
  'Other',
]

export const SPONSORSHIP_OPTIONS = [
  {
    value: 'money',
    label: 'Yes, I will contribute money (Zelle / Venmo / PayPal)',
  },
  { value: 'food', label: 'Yes, I will bring a special dish' },
  {
    value: 'not_this_week',
    label: "Not this week — maybe next",
  },
  {
    value: 'setup',
    label: 'I will help with setup / cleanup at the event',
  },
  { value: 'other', label: 'Other' },
]

export const FEEDBACK_OPTIONS = [
  { value: 'yes', label: 'Of course' },
  { value: 'meh', label: 'Not really / meh' },
  { value: 'other', label: 'Other' },
]

export const GUEST_FILL_OPTIONS = [
  { value: 'yes', label: 'Yes — they will fill out this form themselves' },
  { value: 'no', label: 'No — I am RSVPing for them' },
  { value: 'unsure', label: 'Not sure yet' },
]

/** Host payment details shown on the sponsor page. Edit these anytime. */
export const HOST_PAYMENT = {
  zelle: import.meta.env.VITE_ZELLE || 'abe@bigtechservices.com',
  venmo: import.meta.env.VITE_VENMO || '',
  paypal: import.meta.env.VITE_PAYPAL || '',
  whatsapp:
    import.meta.env.VITE_WHATSAPP_LINK ||
    'Ask the host for the WhatsApp group invite',
  note: 'Thank you for sponsoring — please send Zelle to abe@bigtechservices.com',
}

export const ATTENDING_VALUES = new Set([
  'yes',
  'yes_guest',
  'yes_new',
  'probably',
  'social',
  'unsure',
  'help',
])

export function emptyForm() {
  return {
    fullName: '',
    phone: '',
    coming: '',
    mealStyle: '',
    mealStyleOther: '',
    foodLikes: [],
    foodLikesOther: '',
    bringingDish: '',
    heardAbout: '',
    invitedBy: '',
    bringingMoreGuests: '',
    guestNames: '',
    guestCount: '',
    guestOvernight: '',
    guestWillFillForm: '',
    knowByWhen: '',
    socialArrivalTime: '',
    socialNotes: '',
    sponsorship: [],
    sponsorshipNotes: '',
    potluckContribution: '',
    feedback: '',
    feedbackNotes: '',
  }
}

export function mealStyleLabel(value) {
  return MEAL_STYLE_OPTIONS.find((o) => o.value === value)?.label || value || ''
}
