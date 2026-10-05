"""The audience vocabulary the app speaks: age brackets, shared by both sides.

There are two label sets for the same age brackets, and until now they were
compared with `==`:

    configs.CFG.age_bins  "0-6" "6-13" "13-18" "18-35" "35-55" "55+"  <- what the CV model emits
    the UI dropdown       "<6"  "6-13" "13-18" "18-35" "35-55" ">55"  <- what an advert targets

The boundaries were always identical; only the two outer labels were spelt
differently. So an advert aimed at children scored -10 when a child looked at it
and +30 when a teenager did — the targeting was inverted at both ends of the
range and silently correct in the middle.

The under-18 range used to be one bracket, `<18`. It is now three. Rows and
adverts written before that split cannot be re-bucketed — the database stores
the bracket, never the measured age — so `<18` stays a recognised value that
normalizes to itself and reports as its own row, rather than being guessed into
one of the three. `target_covers` is what keeps those old adverts matching: a
creative still targeting `<18` covers all three child brackets.

`configs.py` belongs to the standalone pipeline and may not be reshaped to suit
the app, so the app translates at its own boundary instead. This module is that
boundary, and the only place either side needs to agree on.
"""

from __future__ import annotations

from configs import CFG

# What the UI offers and what `creatives.target_age_group` stores. Order is the
# order the dropdown shows.
AGE_GROUPS: tuple[str, ...] = ("<6", "6-13", "13-18", "18-35", "35-55", ">55")

# "no preference" — an advert that targets everyone, or a viewer whose age the
# model could not read. Never a bracket, so it must not appear in AGE_GROUPS.
ANY = "all"

# Exclusive upper bound of each bracket; the last one is open-ended.
_UPPER_TO_GROUP: dict[int, str] = {6: "<6", 13: "6-13", 18: "13-18", 35: "18-35", 55: "35-55"}

# Brackets the dropdown no longer offers but that still exist in stored rows,
# mapped to the current brackets they span. A value here is preserved by
# `normalize_age_group` rather than translated: `<18` covers three brackets and
# picking one of them for an old row would be inventing a measurement that was
# never taken. `target_covers` is where the span is actually used.
LEGACY_SPANS: dict[str, tuple[str, ...]] = {"<18": ("<6", "6-13", "13-18")}


def _pipeline_aliases() -> dict[str, str]:
    """Map the pipeline's own bin labels onto ours, matched by the numeric bound.

    Matching on the boundary rather than the spelling means renaming a bin in
    `configs.py` keeps working here. A bin whose boundary we do not recognise is
    deliberately left unmapped: `normalize` then reports "unknown", which shows
    up as missing age data rather than as confidently wrong data.
    """
    aliases: dict[str, str] = {}
    bins = tuple(CFG.age_bins)
    for index, (upper, label) in enumerate(bins):
        is_last = index == len(bins) - 1
        group = AGE_GROUPS[-1] if is_last else _UPPER_TO_GROUP.get(int(upper))
        if group:
            aliases[label] = group
    return aliases


# Spellings seen in rows written before this module existed. Kept explicitly so
# old impressions keep aggregating into the right bucket. "0-18"/"0-17" resolve
# to the legacy `<18` bracket, not to one of the three that replaced it.
_LEGACY_ALIASES = {"0-18": "<18", "55+": ">55", "0-17": "<18", "56+": ">55"}

_ALIASES: dict[str, str] = {**_LEGACY_ALIASES, **_pipeline_aliases()}


def normalize_age_group(value: str | None) -> str | None:
    """Any known spelling -> the canonical bracket. Unknown -> None."""
    if not value:
        return None
    text = str(value).strip()
    if text in AGE_GROUPS or text in LEGACY_SPANS:
        return text
    return _ALIASES.get(text)


def parse_tags(value: str | None) -> list[str]:
    """A stored target as a list. Targets may hold several values, comma
    separated ("13-18,18-35"); a single value is a list of one."""
    return [t.strip() for t in str(value or "").split(",") if t.strip()]


def _spanned(value: str | None) -> set[str]:
    """The current brackets a value stands for; empty if it stands for none."""
    out: set[str] = set()
    for text in parse_tags(value):
        if text in LEGACY_SPANS:
            out |= set(LEGACY_SPANS[text])
        elif text in AGE_GROUPS:
            out.add(text)
    return out


def target_covers(target: str | None, viewer_group: str | None) -> bool:
    """Does an advert's stored age target include this viewer's bracket?

    Plain `==` was enough while every bracket was a leaf. Splitting `<18` into
    three made it wrong for every advert saved before the split: an advert
    targeting `<18` would no longer equal `<6`, so the scorer would penalise it
    in front of exactly the audience it was bought for. Overlap is checked in
    both directions because a stored impression can carry the coarse label too.
    """
    return bool(_spanned(target) & _spanned(viewer_group))


def normalize_target_age(value: str | None) -> str:
    """Same, for an advert's target — one bracket or several, comma separated.
    Anything unrecognised means "everyone", which is the safe default: a typo
    should widen an advert's audience, never silently exclude it from every
    match. "all" among several, or every bracket ticked, is "all" too."""
    tags = parse_tags(value)
    if not tags or ANY in tags:
        return ANY
    groups = {g for g in (normalize_age_group(t) for t in tags) if g}
    if not groups or set(AGE_GROUPS) <= groups:
        return ANY
    order = list(AGE_GROUPS) + list(LEGACY_SPANS)
    return ",".join(sorted(groups, key=order.index))


def age_to_group(age: float) -> str:
    """A continuous age -> the canonical bracket it falls in."""
    for upper, group in sorted(_UPPER_TO_GROUP.items()):
        if age < upper:
            return group
    return AGE_GROUPS[-1]


# ---------------------------------------------------------------------------
# Who is in front of the screen, as a whole
# ---------------------------------------------------------------------------
#
# The scorer used to read one "priority viewer" — the attentive person who had
# stood longest — and match adverts against that person alone. Four women and
# one man who lingered got the man's advert, and a cut-in to make sure. An
# advert also had to declare which crowd size it was for, which is a fact about
# the room, not about the advert.
#
# Now every person present counts, weighted by how much of a viewer they are,
# and an advert's fit is simply the share of that audience it is aimed at. The
# crowd size needs no tag: one person makes the share all-or-nothing, a mixed
# crowd pulls every targeted advert towards the middle, where untargeted ones
# sit.

# An advert that targets nobody scores exactly this; one aimed at the audience
# in front of the screen scores above it by how much of that audience it fits.
# Shared by the engine (which scores) and the player (which decides).
NEUTRAL_SCORE = 50.0

# One person in the room, as the scorer sees them: (weight, age bracket, gender).
Viewer = tuple[float, "str | None", "str | None"]


def viewer_weight(attentive: bool, dwell_seconds: float) -> float:
    """How much one person counts. Looking at the screen counts more than
    walking past it, and staying counts more than glancing — capped, so one
    person who has stood there for a minute cannot outvote a group."""
    return (1.0 if attentive else 0.4) * (1.0 + min(max(dwell_seconds, 0.0), 10.0) / 10.0)


def coverage(people: list[Viewer], tag_age: str | None, tag_gender: str | None) -> float | None:
    """Share (0..1) of the weighted audience an advert's age and gender target
    covers. None when it targets nothing, or when nobody present has been read
    on any dimension it targets — "could not tell" must not count as a miss.

    Both dimensions are judged on the same person: an advert for women aged
    18-35 covers the women aged 18-35, not "the women" times "the 18-35s". A
    dimension the model has not read for someone counts as a coin toss (0.5),
    so a woman of unknown age still rules out an advert for men, but does not
    count as a sure hit for one aimed at women of a particular age.
    """
    wants_age = bool(tag_age) and tag_age != ANY
    wants_gender = bool(tag_gender) and tag_gender != ANY
    if not (wants_age or wants_gender):
        return None
    hit = total = 0.0
    for weight, age_group, gender in people:
        known = (wants_age and bool(age_group)) or (wants_gender and bool(gender))
        if not known:
            continue
        fit = 1.0
        if wants_age:
            fit *= 0.5 if not age_group else float(target_covers(tag_age, age_group))
        if wants_gender:
            fit *= 0.5 if not gender else float(gender == tag_gender)
        total += weight
        hit += weight * fit
    return hit / total if total > 0 else None


def majority(people: list[Viewer]) -> dict:
    """Weighted shares of the audience, for the explanation shown to operators."""
    genders: dict[str, float] = {}
    ages: dict[str, float] = {}
    for weight, age_group, gender in people:
        if gender:
            genders[gender] = genders.get(gender, 0.0) + weight
        if age_group:
            ages[age_group] = ages.get(age_group, 0.0) + weight

    def top(shares: dict[str, float]) -> tuple[str | None, float]:
        total = sum(shares.values())
        if not total:
            return None, 0.0
        key = max(shares, key=lambda k: shares[k])
        return key, shares[key] / total

    gender, gender_share = top(genders)
    age_group, age_share = top(ages)
    return {
        "gender": gender,
        "gender_share": gender_share,
        "age_group": age_group,
        "age_share": age_share,
    }
