#!/usr/bin/env bash
# Fetch the child/teen age-estimation test clips into data/age_kids/.
#
# Why this set exists: data/ shipped only adult footage (the Intel OpenVINO
# samples), so nothing in the repo exercised the bottom of the age range. Every
# clip below is Mixkit free stock (Mixkit License: free commercial and
# non-commercial use, no attribution, redistribution of the raw clip not
# allowed) — hence a fetch script in git and the .mp4s left git-ignored.
#
# 720p is deliberate: preprocess resizes the long side to CFG.process_long_side
# (640), so a 1080p download would only be thrown away.
#
#   bash eval/age_kids/fetch.sh
set -euo pipefail

OUT="$(cd "$(dirname "$0")/../.." && pwd)/data/age_kids"
mkdir -p "$OUT"

# mixkit_id:local_name   (prefix = coarse subject: baby / child / teen / mixed / farfield)
CLIPS=(
  # --- infants, 0-2 ---
  "8579:baby_laughing_rollover"
  "11671:baby_smiling_sofa"
  "16187:baby_clapping_hands"
  # --- young children, ~2-8 ---
  "21702:child_boy_smiling_orange_room"
  "13725:child_sad_boy_swings"
  "46713:child_sad_boy_to_camera"
  "42196:child_girl_legos"
  "4792:child_girl_maths_livingroom"
  "5927:child_unhappy_corner"
  "23319:child_boy_behind_window"
  # --- older children, ~8-13 ---
  "9004:child_boy_english_book"
  "4543:child_girl_crying"
  "4536:child_girl_coughing"
  "4762:children_playing_chess"
  "35954:children_classroom_raising_hands"
  "4531:child_girl_library_homework"
  # --- teens / young adults, ~14-25 ---
  "28318:teen_girl_armchair_classroom"
  "28319:teen_student_helped_by_classmate"
  "28320:teen_boy_girl_walking_school"
  "28321:teen_frustrated_student"
  "4761:teen_boy_studying_home"
  "50127:teen_student_reading_book"
  "8814:teen_students_with_teacher"
  "28198:teen_walking_in_town"
  "51241:teen_girls_selfie"
  "51258:teen_women_photos"
  # --- adult + child in one frame (the hard case: one bucket must not swallow the other) ---
  "4542:mixed_father_son_reading"
  "4874:mixed_mother_daughter_reading"
  "8717:farfield_woman_daughter_sidewalk"
  "36046:children_teacher_learning"
  "4510:mixed_library_reading_group"
  "47628:mixed_girl_swing_playground"
  # --- far-field: faces at 30-40px, below/near CFG.min_face_px_for_age ---
  "47479:farfield_child_sandbox_play"
  "13727:farfield_boy_deflated_ball"
  "33729:farfield_family_walking_park"
)

for entry in "${CLIPS[@]}"; do
  id="${entry%%:*}"; name="${entry##*:}"
  dest="$OUT/${name}-${id}.mp4"
  if [[ -s "$dest" ]]; then echo "skip ${name}-${id}.mp4"; continue; fi
  for res in 720 1080 360; do
    url="https://assets.mixkit.co/videos/$id/$id-$res.mp4"
    if [[ "$(curl -sI -o /dev/null -w '%{http_code}' -A 'Mozilla/5.0' "$url")" == "200" ]]; then
      curl -fsSL -A 'Mozilla/5.0' "$url" -o "$dest"
      echo "ok   ${name}-${id}.mp4 (${res}p)"
      break
    fi
  done
  [[ -s "$dest" ]] || echo "MISS ${name}-${id} — check https://mixkit.co/free-stock-video/?q=$id"
done

echo
echo "$(ls -1 "$OUT" | wc -l | tr -d ' ') clips in $OUT"
