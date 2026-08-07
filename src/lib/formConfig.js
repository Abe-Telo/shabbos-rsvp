export const COMING_OPTIONS = [
  { value: 'yes', label: 'Yes, I am coming!', next: 'basics_more' },
  { value: 'yes_guest', label: 'Yes… and bringing a guest', next: 'basics_more' },
  { value: 'yes_new', label: 'Yes, and I am a new contact', next: 'basics_more' },
  { value: 'probably', label: 'Probably yes', next: 'basics_more' },
  { value: 'social', label: 'Coming later for social time', next: 'basics_more' },
  { value: 'no', label: "No, I can't make it this time", next: 'submit' },
  { value: 'help', label: 'I am only here to help or sponsor', next: 'basics_more' },
  { value: 'unsure', label: 'I am not sure yet', next: 'basics_more' },
]

export const POTLUCK_OPTIONS = [
  { value: 'self', label: 'We buy and cook everything ourselves!' },
  { value: 'potluck', label: 'Potluck (We bring something to share)' },
  { value: 'hybrid', label: 'Hybrid' },
  { value: 'other', label: 'Other' },
]

export const BRINGING_OPTIONS = [
  'Challah and dips',
  'Main dish (meat)',
  'Side dish',
  'Salad / Vegetables',
  'Soft Drinks',
  'Alcohol',
  'Dessert',
  'Cutlery',
  'Dishes',
  'Cups',
  'Napkins',
  'Fruit',
  'Snacks',
  'Hot Food',
  'Other (Please specify)',
]

export const SPONSORSHIP_OPTIONS = [
  { value: 'money', label: 'Yes, I will sponsor money (for the host to buy food/supplies)' },
  { value: 'food', label: 'Yes, I will bring a food item' },
  { value: 'cant', label: "No, I can't afford anything this week" },
  { value: 'other_ways', label: 'I will contribute in other ways' },
  { value: 'other', label: 'Other' },
]

export const FEEDBACK_OPTIONS = [
  { value: 'form', label: 'This form / website' },
  { value: 'whatsapp', label: 'WhatsApp Poll' },
  { value: 'other', label: 'Other' },
]

export const ATTENDING_VALUES = new Set([
  'yes',
  'yes_guest',
  'yes_new',
  'probably',
  'social',
  'help',
])

export function emptyForm() {
  return {
    fullName: '',
    phone: '',
    coming: '',
    potluck: '',
    bringing: [],
    bringingOther: '',
    dietaryNotes: '',
    guestNames: '',
    guestCount: '',
    guestOvernight: '',
    newcomerNotes: '',
    sponsorship: [],
    sponsorshipNotes: '',
    potluckContribution: '',
    feedback: '',
    feedbackNotes: '',
  }
}
