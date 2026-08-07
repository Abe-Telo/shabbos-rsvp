/** Weekly Shabbos RSVP — questions corrected from the Google Form. */

export const COMING_OPTIONS = [
  {
    value: 'yes',
    label: 'Yes, I am coming!',
    next: 'sponsorship',
  },
  {
    value: 'yes_guest',
    label: 'Yes, I am coming and bringing a guest',
    next: 'guests',
  },
  {
    value: 'yes_new',
    label: 'Yes, and I am a newcomer',
    next: 'invite',
  },
  {
    value: 'probably',
    label: 'Probably yes',
    next: 'invite',
  },
  {
    value: 'social',
    label: 'Coming later to hang out and socialize',
    next: 'guests',
  },
  {
    value: 'unsure',
    label: "I'm not sure yet / need to confirm later",
    next: 'invite',
  },
  {
    value: 'no',
    label: "No, I can't make it this time",
    next: 'submit',
  },
  {
    value: 'help',
    label: 'I am only here to help with setup/cleanup or to sponsor',
    next: 'sponsorship',
  },
]

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
  {
    value: 'other',
    label: 'Other',
  },
]

/** What guests like to eat (data collecting for the host). */
export const FOOD_LIKE_OPTIONS = [
  'Chicken soup',
  'Slow roasted beef',
  'Salmon fillet',
  'Salmon patties',
  'Garlic potato',
  'Potato kugel',
  'Salad',
  'Challah',
  'Matzo',
  'Rice',
  'Corn',
  'Broccoli',
  'Peas',
  'Mixed salad',
  'Other',
]

export const SPONSORSHIP_OPTIONS = [
  {
    value: 'money',
    label: 'Yes, I will contribute some money (PayPal / Venmo)',
  },
  {
    value: 'food',
    label: 'Yes, I will bring a special dish',
  },
  {
    value: 'not_this_week',
    label: "No, I don't want to support this week — maybe next",
  },
  {
    value: 'setup',
    label: 'I will help with setup / cleanup at the event',
  },
  {
    value: 'other',
    label: 'Other',
  },
]

export const FEEDBACK_OPTIONS = [
  { value: 'yes', label: 'Of course' },
  { value: 'meh', label: 'Not really / meh' },
  { value: 'other', label: 'Other' },
]

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
    guestNames: '',
    guestCount: '',
    guestOvernight: '',
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
