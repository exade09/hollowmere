set -e
H="D:/hollowmere"
B="/d/blender.exe"
FF=$(py -c "import imageio_ffmpeg;print(imageio_ffmpeg.get_ffmpeg_exe())")
S="$H/site/public/clips"

render_set () {          # $1 scene  $2 script  $3 raw dir  $4 site dir
  echo "=== RENDER $1 (21:9) ==="; date
  rm -rf "$H/renders/$3"; mkdir -p "$H/renders/$3"
  "$B" -b "$H/scene/hollowmere_$1.blend" --python "$H/scene/$2" \
       -- "$H/renders/$3" "" wide > "$H/renders/_check/$3.log" 2>&1
  grep -E "CLIP DONE" "$H/renders/_check/$3.log" || true
  echo "shadow overflow: $(grep -c 'Shadow buffer full' "$H/renders/_check/$3.log")"

  echo "=== ENCODE $1 (21:9) ==="; date
  rm -rf "$S/$4"; mkdir -p "$S/$4/1080p" "$S/$4/720p" "$S/$4/poster"
  for d in "$H"/renders/$3/*/; do
    n=$(basename "$d")
    "$FF" -y -loglevel error -framerate 24 -i "$d/f_%04d.png" \
      -c:v libx264 -preset slow -crf 20 -pix_fmt yuv420p -movflags +faststart -an \
      "$S/$4/1080p/$n.mp4"
    # 1664x702 is 64x26 by 27x26: exactly 64:27, and both sides even, which
    # h.264 requires. Scaling to 720 tall would need a width of 1706.67, and
    # ffmpeg rounds it and hides the remainder in a non-square SAR — which puts
    # the SVG hotzone layer (it trusts the 2560x1080 viewBox) ~14 px off the
    # picture. Keep any future tier on 64k x 27k with k even.
    "$FF" -y -loglevel error -framerate 24 -i "$d/f_%04d.png" -vf scale=1664:702:flags=lanczos \
      -c:v libx264 -preset slow -crf 21 -pix_fmt yuv420p -movflags +faststart -an \
      "$S/$4/720p/$n.mp4"
    py -c "
from PIL import Image
import sys
Image.open(sys.argv[1]).convert('RGB').save(sys.argv[2],'JPEG',quality=86,optimize=True,progressive=True)
" "$d/f_0001.png" "$S/$4/poster/$n.jpg"
    echo "$n  $(stat -c%s "$S/$4/1080p/$n.mp4") B"
  done
}

render_set undercroft render_clips_uc.py clips_uc_wide undercroft-21x9
render_set sanctum    render_clips.py    clips_wide    sanctum-21x9

echo "=== HOTZONES 21:9 ==="
"$B" -b "$H/scene/hollowmere_sanctum.blend"    --python "$H/scene/export_hotzones.py" -- sanctum wide 2>&1 | grep HOTZONES
"$B" -b "$H/scene/hollowmere_undercroft.blend" --python "$H/scene/export_hotzones.py" -- undercroft wide 2>&1 | grep HOTZONES
echo "=== WIDE ALL DONE ==="; date
