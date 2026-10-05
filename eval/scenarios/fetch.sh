#!/usr/bin/env bash
# Fetch the eight real-world test scenarios into data/kb*/ (one folder each, so
# the /admin picker shows them as numbered headings).
#
# Mixkit free stock, like eval/age_kids: free to use, raw clips may not be
# redistributed — hence this script in git and the .mp4s git-ignored.
#
# Every clip was chosen by running it through Pipeline first, not by its title.
# What the pipeline measured (people = tracks present in >=15% of frames,
# gender+median age per track; 2026-10-03, default CFG):
#
#   kb1  two_men_selfie            2 faces/frame   M30 M32
#   kb2  teen_boy_filming_bedroom  1               M11      teen_boy_vlog_garage M13
#   kb3  two_women_cafe_date       1-2             F29 F24  two_women_pottery F20 F26
#   kb4  woman_dog_selfie          2-3             F34 F24 F31, dog in 297 frames
#   kb5  teen_girl_webinar         1               F17      teen_girl_writes_letter F16
#   kb6  team_brainstorm_3f_1m     4               F48 M32 F29 F33
#   kb7  students_walking          up to 4, att 0% people_walking_street up to 8, att 0%
#   kb8  two_mechanics_talking     2, 44s          M40 M40  two_young_men_bike_shop M25 M33, 37s
#
# kb4 animals (yolo11m, share of frames the animal is linked to a person):
#   dog selfie 97%, man feeding dog 41%, cats 78-100%, girl feeding birds 44%,
#   horses 99-100%. No animal reported in kb6/kb7 (people only).
#
#   bash eval/scenarios/fetch.sh
set -euo pipefail

DATA="$(cd "$(dirname "$0")/../.." && pwd)/data"

# folder:mixkit_id:local_name
CLIPS=(
  "kb1_two_men_18_35:1319:two_men_selfie"
  "kb2_teen_boy:23331:teen_boy_filming_bedroom"
  "kb2_teen_boy:24009:teen_boy_vlog_garage"
  "kb3_two_women_18_35:41236:two_women_cafe_date"
  "kb3_two_women_18_35:40023:two_women_pottery"
  "kb4_with_pet:6355:dog_woman_selfie"
  "kb4_with_pet:1490:dog_man_feeding_dog"
  "kb4_with_pet:1536:cat_woman_couch_cat"
  "kb4_with_pet:32188:cat_old_woman_hugging_cat"
  "kb4_with_pet:46153:cat_woman_grey_cat_christmas"
  "kb4_with_pet:46542:cat_man_laptop_cat"
  "kb4_with_pet:1542:cat_woman_petting_cat"
  "kb4_with_pet:7319:bird_girl_feeding_birds_snow"
  "kb4_with_pet:49003:horse_family_white_horse"
  "kb4_with_pet:1134:horse_man_caressing_horse"
  "kb5_teen_girl:49284:teen_girl_webinar"
  "kb5_teen_girl:15769:teen_girl_writes_letter"
  "kb6_mixed_3f_1m:5489:team_brainstorm_3f_1m"
  "kb7_crowd:4519:students_walking_university"
  "kb7_crowd:4437:people_walking_street"
  "kb8_two_men_linger:22986:two_mechanics_talking"
  "kb8_two_men_linger:24011:two_young_men_bike_shop"
)

for entry in "${CLIPS[@]}"; do
  IFS=: read -r folder id name <<<"$entry"
  mkdir -p "$DATA/$folder"
  dest="$DATA/$folder/${name}-${id}.mp4"
  if [[ -s "$dest" ]]; then echo "skip $folder/${name}-${id}.mp4"; continue; fi
  for res in 720 1080 360; do
    url="https://assets.mixkit.co/videos/$id/$id-$res.mp4"
    if curl -fsSL -A 'Mozilla/5.0' "$url" -o "$dest"; then
      echo "ok   $folder/${name}-${id}.mp4 (${res}p)"
      break
    fi
  done
  [[ -s "$dest" ]] || { rm -f "$dest"; echo "MISS $folder/$name-$id"; }
done
