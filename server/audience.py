"""The audience vocabulary the app speaks: age brackets, shared by both sides.

There are two label sets for the same four age brackets, and until now they were
compared with `==`:

    configs.CFG.age_bins  "0-18"  "18-35"  "35-55"  "55+"    <- what the CV model emits
    the UI dropdown       "<18"   "18-35"  "35-55"  ">55"    <- what an advert targets

The boundaries were always identical; only the two outer labels were spelt
differently. So an advert aimed at children scored -10 when a child looked at it
and +30 when a teenager did — the targeting was inverted at both ends of the
range and silently correct in the middle.

`configs.py` belongs to the standalone pipeline and may not be reshaped to suit
the app, so the app translates at its own boundary instead. This module is that
boundary, and the only place either side needs to agree on.
"""

from __future__ import annotations

from configs import CFG

# What the UI offers and what `creatives.target_age_group` stores. Order is the
# order the dropdown shows.
AGE_GROUPS: tuple[str, ...] = ("<18", "18-35", "35-55", ">55")

# "no preference" — an advert that targets everyone, or a viewer whose age the
# model could not read. Never a bracket, so it must not appear in AGE_GROUPS.
ANY = "all"

# Exclusive upper bound of each bracket; the last one is open-ended.
_UPPER_TO_GROUP: dict[int, str] = {18: "<18", 35: "18-35", 55: "35-55"}


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
# old impressions keep aggregating into the right bucket.
_LEGACY_ALIASES = {"0-18": "<18", "55+": ">55", "0-17": "<18", "56+": ">55"}

_ALIASES: dict[str, str] = {**_LEGACY_ALIASES, **_pipeline_aliases()}


def normalize_age_group(value: str | None) -> str | None:
    """Any known spelling -> the canonical bracket. Unknown -> None."""
    if not value:
        return None
    text = str(value).strip()
    if text in AGE_GROUPS:
        return text
    return _ALIASES.get(text)


def normalize_target_age(value: str | None) -> str:
    """Same, for an advert's target. Anything unrecognised means "everyone",
    which is the safe default: a typo should widen an advert's audience, never
    silently exclude it from every match."""
    if not value or str(value).strip() == ANY:
        return ANY
    return normalize_age_group(value) or ANY


def age_to_group(age: float) -> str:
    """A continuous age -> the canonical bracket it falls in."""
    for upper, group in sorted(_UPPER_TO_GROUP.items()):
        if age < upper:
            return group
    return AGE_GROUPS[-1]
