# Sprite Generation Guide

To avoid browser-based processing lag for long videos, you can generate your preview thumbnails locally using FFmpeg and upload them manually.

### 1. Install FFmpeg
If you don't have it, download it from [ffmpeg.org](https://ffmpeg.org/download.html).

### 2. Run the Command
Open your terminal/command prompt and run the following command (replace `your_video.mp4` with your filename):

```bash
ffmpeg -i your_video.mp4 -vf "fps=1/10,scale=160:90,tile=10x100" -q:v 5 sprite.jpg
```

### 3. Upload to the Dashboard
Once the `sprite.jpg` is created:
1. Go to your Video Upload section.
2. Click **Upload sprite.jpg**.
3. Select the file you just generated.

### Option 2: Batch Process via Python
If you have many videos, use the provided [generate_sprites.py](file:///d:/lms/nextcareerlabs/generate_sprites.py) script:

1. Create a folder named `input/` and put your videos inside.
2. Run the script:
   ```bash
   python generate_sprites.py
   ```
3. The sprites will be generated in the `output/` folder.

---

### Important Metadata
When uploading, the portal assumes:
- **Columns**: 10
- **Thumbnail Size**: 160x90
- **Interval**: Calculated automatically (Total Duration / 100)

### Why this works:
- **fps=1/10**: Takes one snapshot every 10 seconds.
- **scale=160:90**: Resizes each thumbnail to a standard small size.
- **tile=10x100**: Arranges them in a grid (10 columns).
- **-q:v 5**: Keeps the file size small while maintaining quality.
