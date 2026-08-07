#!/usr/bin/env python3
"""Import Google Form responses into shabbos RSVP JSON DB."""
import json
import uuid
from datetime import datetime, timezone
from pathlib import Path

DB = Path("/root/ssl/shabbos-rsvp-api/data/shabbos.json")


def sunday_week(d=None):
    d = d or datetime.now().astimezone()
    d = d.replace(hour=0, minute=0, second=0, microsecond=0)
    # Monday=0 in weekday(); Sunday=6 → go back to Sunday
    back = (d.weekday() + 1) % 7
    sun = d.fromordinal(d.toordinal() - back)
    return sun.date().isoformat()


def digits(phone):
    return "".join(c for c in str(phone or "") if c.isdigit())


def uid():
    return str(uuid.uuid4())


now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"
week = sunday_week()

rows = [
    {
        "full_name": "Katyusha Khaya Esther",
        "phone": "9178620069",
        "coming": "probably",
        "meal_style": "hybrid",
        "bringing_dish": None,
        "food_likes": [],
        "invited_by": None,
        "heard_about": None,
        "guest_count": None,
        "guest_names": None,
        "feedback": "other",
        "feedback_notes": "Maybe you could do both. I liked being able to see who voted.",
        "sponsorship": ["money", "setup"],
        "sponsorship_notes": "Zelle: abe@bigtechservices.com",
        "first_time": False,
    },
    {
        "full_name": "Uriel Dunn",
        "phone": "704.495.0299",
        "coming": "yes_new",
        "meal_style": "host_cook",
        "bringing_dish": "TBD",
        "food_likes": [],
        "invited_by": "I'm in the group",
        "heard_about": "I'm in the group",
        "guest_count": 1,
        "guest_names": "Maybe 1 — asked where you are located",
        "bringing_more_guests": "Yes",
        "feedback": "meh",
        "feedback_notes": "WhatsApp Poll",
        "sponsorship": ["food", "not_this_week", "other"],
        "sponsorship_notes": "Let me know what style; potluck TBD; can't afford money this time",
        "first_time": True,
    },
    {
        "full_name": "Pinny Morozow",
        "phone": "347-668-8465",
        "coming": "yes",
        "meal_style": "hybrid",
        "bringing_dish": "Will confirm what's needed",
        "food_likes": [],
        "invited_by": None,
        "heard_about": None,
        "guest_count": None,
        "guest_names": None,
        "feedback": "meh",
        "feedback_notes": "WhatsApp Poll",
        "sponsorship": ["food", "setup"],
        "sponsorship_notes": None,
        "first_time": False,
    },
    {
        "full_name": "Flo",
        "phone": "917-374-8347",
        "coming": "yes",
        "meal_style": "hybrid",
        "bringing_dish": "some broccoli and a bit of schnitzel",
        "food_likes": [],
        "invited_by": None,
        "heard_about": None,
        "guest_count": None,
        "guest_names": None,
        "feedback": "yes",
        "feedback_notes": "GS Forms",
        "sponsorship": ["money"],
        "sponsorship_notes": "Zelle: abe@bigtechservices.com",
        "first_time": False,
    },
]

if DB.exists():
    data = json.loads(DB.read_text())
else:
    data = {"people": [], "rsvps": [], "sponsorships": [], "admin_sessions": []}

# Remove smoke-test guest
data["people"] = [p for p in data.get("people", []) if p.get("name") != "Test Guest"]
data["rsvps"] = [r for r in data.get("rsvps", []) if r.get("full_name") != "Test Guest"]
data["sponsorships"] = [
    s for s in data.get("sponsorships", []) if s.get("full_name") != "Test Guest"
]

imported = 0
for row in rows:
    phone_key = digits(row["phone"])
    name = row["full_name"]
    # Upsert person
    person = next(
        (
            p
            for p in data["people"]
            if digits(p.get("phone")) == phone_key
            or p.get("name", "").lower() == name.lower()
        ),
        None,
    )
    attending = row["coming"] not in ("no",)
    prefs_parts = []
    if row.get("bringing_dish"):
        prefs_parts.append(f"Bringing: {row['bringing_dish']}")
    if row.get("meal_style"):
        prefs_parts.append(f"Style: {row['meal_style']}")
    prefs = ", ".join(prefs_parts) or None

    if person:
        person["name"] = name
        person["phone"] = row["phone"]
        person["phone_digits"] = phone_key
        person["last_seen"] = now
        if prefs:
            person["food_prefs"] = " | ".join(
                filter(None, [person.get("food_prefs"), prefs])
            )
        # only bump attendance if no rsvp this week yet
        has_week = any(
            r.get("person_id") == person["id"] and r.get("week_start") == week
            for r in data["rsvps"]
        )
        if attending and not has_week:
            person["times_attended"] = int(person.get("times_attended") or 0) + 1
    else:
        person = {
            "id": uid(),
            "name": name,
            "phone": row["phone"],
            "phone_digits": phone_key,
            "times_attended": 1 if attending else 0,
            "food_prefs": prefs,
            "first_seen": now,
            "last_seen": now,
        }
        data["people"].append(person)

    # Replace existing RSVP this week for person
    old_ids = [
        r["id"]
        for r in data["rsvps"]
        if r.get("person_id") == person["id"] and r.get("week_start") == week
    ]
    data["rsvps"] = [r for r in data["rsvps"] if r["id"] not in old_ids]
    data["sponsorships"] = [
        s for s in data["sponsorships"] if s.get("rsvp_id") not in old_ids
    ]

    rsvp_id = uid()
    data["rsvps"].append(
        {
            "id": rsvp_id,
            "person_id": person["id"],
            "week_start": week,
            "full_name": name,
            "phone": row["phone"],
            "coming": row["coming"],
            "meal_style": row["meal_style"],
            "meal_style_other": None,
            "food_likes": row.get("food_likes") or [],
            "food_likes_other": None,
            "bringing_dish": row.get("bringing_dish"),
            "guest_names": row.get("guest_names"),
            "guest_count": row.get("guest_count"),
            "guest_overnight": None,
            "heard_about": row.get("heard_about"),
            "invited_by": row.get("invited_by"),
            "bringing_more_guests": row.get("bringing_more_guests"),
            "guest_will_fill_form": None,
            "know_by_when": None,
            "social_arrival_time": None,
            "social_notes": None,
            "feedback": row.get("feedback"),
            "feedback_notes": row.get("feedback_notes"),
            "created_at": now,
            "imported_from": "google_form",
        }
    )

    if row.get("sponsorship"):
        data["sponsorships"].append(
            {
                "id": uid(),
                "rsvp_id": rsvp_id,
                "person_id": person["id"],
                "week_start": week,
                "full_name": name,
                "phone": row["phone"],
                "contributions": row["sponsorship"],
                "notes": row.get("sponsorship_notes"),
                "potluck_contribution": row.get("bringing_dish"),
                "created_at": now,
            }
        )
    imported += 1

DB.parent.mkdir(parents=True, exist_ok=True)
DB.write_text(json.dumps(data, indent=2))
print(f"Imported {imported} people for week {week}")
print(f"people={len(data['people'])} rsvps={len(data['rsvps'])} sponsorships={len(data['sponsorships'])}")
