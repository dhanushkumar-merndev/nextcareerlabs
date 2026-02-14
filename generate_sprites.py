import os
import math
import subprocess
import sys
import json

def get_video_duration(input_file):
    """Get the duration of the video in seconds using ffprobe."""
    try:
        cmd = [
            'ffprobe', 
            '-v', 'error', 
            '-show_entries', 'format=duration', 
            '-of', 'default=noprint_wrappers=1:nokey=1', 
            input_file
        ]
        result = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        return float(result.stdout.strip())
    except Exception as e:
        print(f"Error getting duration: {e}")
        return None

def generate_sprite(input_file, output_file, cols=10, width=160, height=90):
    """
    Generates a sprite sheet with smart frame calculation.
    Target: 1 frame every 30 seconds (for long videos).
    Min Frames: 100 (for smoothness on short videos).
    Max Frames: 300 (to keep file size reasonable).
    """
    duration = get_video_duration(input_file)
    if not duration:
        return

    # Smart Frame Calculation
    # 1. Start with at least 100 frames
    # 2. For long videos, try to get 1 frame every 30 seconds
    # 3. Cap at 300 frames to prevent huge files (approx 2MB-3MB)
    num_frames = int(min(max(100, duration / 30), 300))

    # Calculate interval
    interval = duration / num_frames
    
    # Calculate rows needed
    rows = math.ceil(num_frames / cols)
    
    print(f"Processing '{input_file}'...")
    print(f"Duration: {duration:.2f}s")
    print(f"Frames to extract: {num_frames}")
    print(f"Interval: {interval:.4f}s")
    print(f"Grid: {cols}x{rows}")
    
    # FFmpeg command
    vf = f"fps=1/{interval},scale={width}:{height},tile={cols}x{rows}"

    cmd = [
        'ffmpeg',
        '-i', input_file,
        '-vf', vf,
        '-frames:v', '1', 
        '-q:v', '2',
        '-y',
        output_file
    ]

    try:
        subprocess.run(cmd, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        print(f"✅ Generated: {output_file}")
        
        # Output metadata for the user to key into the DB if needed manually
        print("\n--- Metadata for Database ---")
        print(f"spriteInterval: {interval:.5f}")
        print(f"spriteCols: {cols}")
        print(f"spriteRows: {rows}")
        print(f"spriteWidth: {width}")
        print(f"spriteHeight: {height}")
        print("-----------------------------\n")

    except subprocess.CalledProcessError as e:
        print(f"❌ Error generating sprite for {input_file}")
        print(e.stderr.decode() if e.stderr else str(e))

if __name__ == "__main__":
    # Ensure input/output directories exist
    os.makedirs("input", exist_ok=True)
    os.makedirs("output", exist_ok=True)

    print("Looking for videos in 'input/' folder...")
    
    found = False
    for filename in os.listdir("input"):
        if filename.lower().endswith(('.mp4', '.mov', '.avi', '.mkv', '.webm')):
            found = True
            input_path = os.path.join("input", filename)
            # Create a subfolder for each video's outputs or just name it specifically
            output_filename = f"{os.path.splitext(filename)[0]}_sprite.jpg"
            output_path = os.path.join("output", output_filename)
            
            generate_sprite(input_path, output_path)
            
    if not found:
        print("No videos found! Please put your videos in the 'input' folder.")
