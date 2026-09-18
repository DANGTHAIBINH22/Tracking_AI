#!/usr/bin/env bash
# Fetch the scenario clip sets into data/, so /admin has more than mall footage
# to point the pipeline at.
#
#   bash fetch_test_clips.sh            # every set
#   bash fetch_test_clips.sh retail     # just one
#
# Sets:
#   retail      the actual deployment scenario — shoppers walking past, browsing
#               a shelf, queuing at a till, crowds at a concourse. data/ shipped
#               only two such clips, so nothing exercised the case the product is
#               built for.
#   age_adults  35-55 and 55+. eval/age_kids covers 0 to ~25 and the Intel
#               samples are unlabelled, which left the top two age brackets with
#               no footage at all — they were split and shipped untested.
#
# The child/teen set has its own script because it carries an eval manifest:
#   bash eval/age_kids/fetch.sh
#
# Mixkit free stock (Mixkit License: free commercial and non-commercial use, no
# attribution, redistributing the raw clip is not). 720p because preprocess
# resizes the long side to CFG.process_long_side (640).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"

RETAIL=(
  "25516:shoppers_walking_through_mall"
  "31086:busy_shopping_mall_timelapse"
  "14529:shopping_centre_escalators"
  "4180:commuters_grand_central"
  "4401:crowd_crossing_street"
  "25438:browsing_supermarket_items"
  "49349:woman_at_fridge_aisle"
  "49350:man_at_fridge_aisle"
  "15718:cashier_paying_fashion_store"
  "46530:couple_window_shopping"
  "23889:woman_choosing_dress"
  "33639:man_trying_suit"
  "45054:soft_toy_department_store"
)

AGE_ADULTS=(
  "13079:senior_man_face_closeup"
  "33539:senior_man_portrait"
  "49896:senior_man_playing_chess"
  "33307:senior_woman_by_window"
  "48159:senior_woman_tea"
  "4781:grandmother_birthday_cake"
  "4764:senior_couple_in_park"
  "25486:senior_couple_food_shopping"
  "22293:senior_woman_browsing_products"
  "33632:adult_woman_portrait"
  "33430:two_generations_youth_and_age"
  "32185:grandparents_reading_to_grandchild"
)

fetch_set() {
  local name="$1"; shift
  local out="$ROOT/data/$name"
  mkdir -p "$out"
  echo "== $name -> data/$name"
  for entry in "$@"; do
    local id="${entry%%:*}" clip="${entry##*:}" dest
    dest="$out/${clip}-${id}.mp4"
    if [[ -s "$dest" ]]; then echo "   skip ${clip}-${id}.mp4"; continue; fi
    for res in 720 1080 360; do
      local url="https://assets.mixkit.co/videos/$id/$id-$res.mp4"
      if [[ "$(curl -sI -o /dev/null -w '%{http_code}' -A 'Mozilla/5.0' "$url")" == "200" ]]; then
        # Write to .part and rename, so a dropped connection cannot leave a
        # truncated file that the skip check above would accept next run.
        curl -fsSL -A 'Mozilla/5.0' "$url" -o "$dest.part"
        mv "$dest.part" "$dest"
        echo "   ok   ${clip}-${id}.mp4 (${res}p)"
        break
      fi
    done
    [[ -s "$dest" ]] || echo "   MISS ${clip}-${id} — xem https://mixkit.co/free-stock-video/?q=$id"
  done
}

want=("$@")
[[ ${#want[@]} -eq 0 ]] && want=(retail age_adults)

for name in "${want[@]}"; do
  case "$name" in
    retail)     fetch_set retail "${RETAIL[@]}" ;;
    age_adults) fetch_set age_adults "${AGE_ADULTS[@]}" ;;
    *) echo "Không biết bộ '$name'. Chọn: retail, age_adults" >&2; exit 1 ;;
  esac
done

echo
echo "Tổng số clip trong data/:"
find "$ROOT/data" -name '*.mp4' | wc -l | tr -d ' '
