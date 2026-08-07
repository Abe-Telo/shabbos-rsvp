#!/usr/bin/env python3
"""Import past-week Google Form responses (week of Sun Jul 26, 2026)."""
import json
import uuid
from datetime import datetime, timezone
from pathlib import Path

DB = Path("/root/ssl/shabbos-rsvp-api/data/shabbos.json")
WEEK = "2026-07-26"  # Sunday before Jul 29–31 responses


def digits(phone):
    return "".join(c for c in str(phone or "") if c.isdigit())


def uid():
    return str(uuid.uuid4())


def parse_coming(raw, first_time):
    t = (raw or "").strip().lower()
    if "hang out" in t or "chulent" in t or "social" in t:
        return "social"
    if "probably" in t:
        return "probably"
    if "not sure" in t or "unsure" in t:
        return "unsure"
    if t.startswith("no") or "can't make" in t:
        return "no"
    if "coming" in t or t.startswith("yes"):
        if first_time:
            return "yes_new"
        return "yes"
    return "yes"


def parse_sponsorship(raw):
    text = raw or ""
    out = []
    low = text.lower()
    if "sponsor money" in low or "contribute money" in low:
        out.append("money")
    if "potluck" in low:
        out.append("food")
    if "cleanup" in low or "setup" in low:
        out.append("setup")
    if "can't afford" in low or "cant afford" in low or "maybe next time" in low:
        out.append("not_this_week")
    return out


def parse_ts(raw):
    # 7/29/2026 21:55:15
    try:
        dt = datetime.strptime(raw.strip(), "%m/%d/%Y %H:%M:%S")
        return dt.replace(tzinfo=timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z")
    except Exception:
        return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"


# Columns from pasted sheet:
# timestamp, name, phone, first_time, invited_by, coming, guest_count,
# sponsorship_text, money_or_notes, bringing_dish
ROWS = [
    {
        "ts": "7/29/2026 21:55:15",
        "full_name": "Flo Comuzzi",
        "phone": "9173748347",
        "first_time": False,
        "invited_by": None,
        "coming_raw": "Yes, I am coming!",
        "guest_count": 1,
        "sponsorship_raw": "Yes, I will sponsor money",
        "sponsorship_notes": "40",
        "bringing_dish": None,
    },
    {
        "ts": "7/30/2026 12:17:57",
        "full_name": "Yaffa Slurzberg",
        "phone": "2152009876",
        "first_time": False,
        "invited_by": None,
        "coming_raw": "Yes, I am coming!",
        "guest_count": None,
        "sponsorship_raw": "Yes, I will sponsor money",
        "sponsorship_notes": "36$",
        "bringing_dish": None,
    },
    {
        "ts": "7/30/2026 14:10:30",
        "full_name": "Shmaryahu Morris",
        "phone": "6313180978",
        "first_time": False,
        "invited_by": None,
        "coming_raw": "Probably yes",
        "guest_count": 1,
        "sponsorship_raw": "Yes, I will do a potluck item",
        "sponsorship_notes": None,
        "bringing_dish": "Meats",
    },
    {
        "ts": "7/30/2026 19:00:59",
        "full_name": "Mendy Greenwald",
        "phone": "7324363864",
        "first_time": False,
        "invited_by": None,
        "coming_raw": "Yes, I am coming!",
        "guest_count": None,
        "sponsorship_raw": "No, I can't afford it right now - maybe next time!, I will help chip in with cleanup (Encouraged!)",
        "sponsorship_notes": None,
        "bringing_dish": None,
    },
    {
        "ts": "7/30/2026 22:01:41",
        "full_name": "Jacob Fisher",
        "phone": "3017609243",
        "first_time": True,
        "invited_by": "Ben Schorr",
        "coming_raw": "Probably yes",
        "guest_count": None,
        "sponsorship_raw": "Yes, I will do a potluck item, I will help chip in with cleanup (Encouraged!)",
        "sponsorship_notes": None,
        "bringing_dish": "Rice, greenbeans",
    },
    {
        "ts": "7/30/2026 22:43:44",
        "full_name": "Mendel Yaffee",
        "phone": "9177552867",
        "first_time": True,
        "invited_by": None,
        "coming_raw": "Yes, I am coming!",
        "guest_count": None,
        "sponsorship_raw": "Yes, I will sponsor money",
        "sponsorship_notes": "How about cash app or Venmo?",
        "bringing_dish": None,
    },
    {
        "ts": "7/30/2026 22:59:48",
        "full_name": "Bentzion Schorr",
        "phone": "9172799351",
        "first_time": False,
        "invited_by": None,
        "coming_raw": "Yes, I am coming!",
        "guest_count": 0,
        "sponsorship_raw": "Yes, I will sponsor money, Yes, I will do a potluck item",
        "sponsorship_notes": "20",
        "bringing_dish": "Challah and dips",
    },
    {
        "ts": "7/31/2026 8:20:03",
        "full_name": "Sima Belah Rivlin",
        "phone": "9174069190",
        "first_time": False,
        "invited_by": "Abe",
        "coming_raw": "Yes, I am coming!",
        "guest_count": 0,
        "sponsorship_raw": "I will help chip in with cleanup (Encouraged!)",
        "sponsorship_notes": None,
        "bringing_dish": None,
    },
    {
        "ts": "7/31/2026 12:51:16",
        "full_name": "Jared Gimbel",
        "phone": "2035083500",
        "first_time": False,
        "invited_by": "Abe himself",
        "coming_raw": "Yes, I am coming!",
        "guest_count": None,
        "sponsorship_raw": "Yes, I will do a potluck item",
        "sponsorship_notes": None,
        "bringing_dish": "Drinks (around four)",
    },
    {
        "ts": "7/31/2026 13:06:39",
        "full_name": "Katyusha Khaya Esther",
        "phone": "9178620069",
        "first_time": False,
        "invited_by": None,
        "coming_raw": "Coming just to hang out / try the chulent",
        "guest_count": 0,
        "sponsorship_raw": "Yes, I will do a potluck item, I will help chip in with cleanup (Encouraged!)",
        "sponsorship_notes": None,
        "bringing_dish": "Wine",
    },
    {
        "ts": "7/31/2026 13:28:05",
        "full_name": "Yitzchok Korolizky",
        "phone": "3474100251",
        "first_time": False,
        "invited_by": None,
        "coming_raw": "Yes, I am coming!",
        "guest_count": None,
        "sponsorship_raw": "Yes, I will sponsor money, Yes, I will do a potluck item",
        "sponsorship_notes": "20 cash",
        "bringing_dish": "Wine",
    },
    {
        "ts": "7/31/2026 13:41:21",
        "full_name": "Anny Rosario",
        "phone": "5168365502",
        "first_time": True,
        "invited_by": "Ytzchok",
        "coming_raw": "Yes, I am coming!",
        "guest_count": 0,
        "sponsorship_raw": "Yes, I will sponsor money",
        "sponsorship_notes": "15",
        "bringing_dish": None,
    },
    {
        "ts": "7/31/2026 19:45:53",
        "full_name": "Ami Nichtberger",
        "phone": "9179037146",
        "first_time": True,
        "invited_by": "Shmaryahu",
        "coming_raw": "Yes, I am coming!",
        "guest_count": 0,
        "sponsorship_raw": "Yes, I will do a potluck item",
        "sponsorship_notes": None,
        "bringing_dish": "Sushi",
    },
]


def main():
    if DB.exists():
        data = json.loads(DB.read_text())
    else:
        data = {
            "people": [],
            "rsvps": [],
            "sponsorships": [],
            "admin_sessions": [],
            "users": [],
            "user_sessions": [],
        }

    data.setdefault("people", [])
    data.setdefault("rsvps", [])
    data.setdefault("sponsorships", [])

    imported = 0
    for row in ROWS:
        phone_key = digits(row["phone"])
        # Flo was imported as "Flo" earlier — match by phone
        name = row["full_name"]
        coming = parse_coming(row["coming_raw"], row["first_time"])
        sponsorship = parse_sponsorship(row["sponsorship_raw"])
        created = parse_ts(row["ts"])
        prefs_parts = []
        if row.get("bringing_dish"):
            prefs_parts.append(f"Bringing: {row['bringing_dish']}")
        if sponsorship:
            prefs_parts.append(f"Sponsor: {', '.join(sponsorship)}")
        prefs = ", ".join(prefs_parts) or None

        person = next(
            (
                p
                for p in data["people"]
                if digits(p.get("phone")) == phone_key
                or digits(p.get("phone_digits")) == phone_key
                or p.get("name", "").lower() == name.lower()
                # Flo short name
                or (
                    phone_key == "9173748347"
                    and p.get("name", "").lower().startswith("flo")
                )
                or (
                    phone_key == "9178620069"
                    and "katyusha" in p.get("name", "").lower()
                )
            ),
            None,
        )

        attending = coming not in ("no",)
        if person:
            # Prefer fuller name from this sheet when upgrading Flo → Flo Comuzzi
            if len(name) > len(person.get("name") or ""):
                person["name"] = name
            person["phone"] = row["phone"]
            person["phone_digits"] = phone_key
            # Keep earliest first_seen if already set; else use import time
            if not person.get("first_seen") or person["first_seen"] > created:
                person["first_seen"] = created
            if not person.get("last_seen") or person["last_seen"] < created:
                person["last_seen"] = created
            if prefs:
                person["food_prefs"] = " | ".join(
                    filter(None, [person.get("food_prefs"), prefs])
                )
            has_week = any(
                r.get("person_id") == person["id"] and r.get("week_start") == WEEK
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
                "first_seen": created,
                "last_seen": created,
            }
            data["people"].append(person)

        old_ids = [
            r["id"]
            for r in data["rsvps"]
            if r.get("person_id") == person["id"] and r.get("week_start") == WEEK
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
                "week_start": WEEK,
                "full_name": person["name"],
                "phone": row["phone"],
                "coming": coming,
                "meal_style": None,
                "meal_style_other": None,
                "meal_start_time": None,
                "meal_start_other": None,
                "food_likes": [],
                "food_likes_other": None,
                "bringing_dish": row.get("bringing_dish"),
                "guest_names": None,
                "guest_count": row.get("guest_count"),
                "guest_overnight": None,
                "heard_about": None,
                "invited_by": row.get("invited_by"),
                "bringing_more_guests": None,
                "guest_will_fill_form": None,
                "know_by_when": None,
                "social_arrival_time": None,
                "social_notes": None,
                "feedback": None,
                "feedback_notes": None,
                "created_at": created,
                "imported_from": "google_form_past_week",
            }
        )

        if sponsorship or row.get("sponsorship_notes"):
            data["sponsorships"].append(
                {
                    "id": uid(),
                    "rsvp_id": rsvp_id,
                    "person_id": person["id"],
                    "week_start": WEEK,
                    "full_name": person["name"],
                    "phone": row["phone"],
                    "contributions": sponsorship,
                    "notes": row.get("sponsorship_notes"),
                    "potluck_contribution": row.get("bringing_dish"),
                    "created_at": created,
                }
            )
        imported += 1

    DB.write_text(json.dumps(data, indent=2))
    print(f"Imported {imported} past RSVPs for week {WEEK}")
    print(
        f"people={len(data['people'])} rsvps={len(data['rsvps'])} "
        f"sponsorships={len(data['sponsorships'])}"
    )
    names = sorted(p["name"] for p in data["people"])
    print("people:", ", ".join(names))


if __name__ == "__main__":
    main()
