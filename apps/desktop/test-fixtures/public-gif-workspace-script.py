from core.frame_composer import create_blank_frame, draw_circle
from core.gif_builder import GIFBuilder
from core.easing import interpolate
from core.validators import validate_gif

builder = GIFBuilder(width=128, height=128, fps=8)
for index in range(12):
    frame = create_blank_frame(128, 128, (15, 23, 42))
    x = int(interpolate(12, 111, index / 11, "ease_in_out_quad"))
    draw_circle(frame, (x, 64), 10, (80, 190, 255))
    builder.add_frame(frame)
builder.save("public-skill-animation.gif", num_colors=32, optimize_for_emoji=True)
valid, details = validate_gif(
    "public-skill-animation.gif", is_emoji=True, verbose=True
)
if not valid or details["frame_count"] < 2:
    raise RuntimeError(f"GIF validation failed: {details}")
print(f"VALIDATED:{details['frame_count']}")
