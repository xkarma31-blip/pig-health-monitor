#!/usr/bin/env python3
"""
Scene Composer — Bark + edge-tts + ffmpeg
Composes an ambient scene with narration, SFX, and background music.
"""
import subprocess
import os
import tempfile

SCENE = {
    "name": "PigPulse Farm Dawn",
    "narration": "Dawn breaks over the pig pen. The Sentinel thermal camera activates, scanning for signs of distress. A piglet coughs. The system flags it for review.",
    "sfx": ["rooster crowing in distance", "light morning breeze", "soft pig grunts"],
    "music": "calm ambient morning music, soft piano, nature documentary style",
}

def generate_with_bark(text, output_path):
    """Generate audio using Bark."""
    import sys
    sys.path.insert(0, os.path.expanduser('~/.shikigami/venv/lib/python3.12/site-packages'))
    
    from bark import generate_audio, SAMPLE_RATE
    import wave
    import numpy as np
    
    print(f"[Bark] Generating: {text[:50]}...")
    audio_array = generate_audio(text, history_prompt="v2/en_speaker_9")
    with wave.open(output_path, 'w') as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(SAMPLE_RATE)
        audio_int16 = (audio_array * 32767).astype(np.int16)
        wav.writeframes(audio_int16.tobytes())
    return True

def generate_with_edge(text, output_path):
    """Generate narration using edge-tts."""
    import asyncio
    import edge_tts
    
    async def main():
        communicate = edge_tts.Communicate(text, "en-US-GuyNeural", rate="+10%")
        await communicate.save(output_path)
    
    asyncio.run(main())
    return True

def mix_audio(narration_path, sfx_path, music_path, output_path):
    """Mix narration + SFX + music using ffmpeg."""
    cmd = [
        "ffmpeg", "-y",
        "-i", narration_path,
        "-i", sfx_path,
        "-i", music_path,
        "-filter_complex",
        "[1:a]volume=0.3[sfx];[2:a]volume=0.15[music];[0:a][sfx][music]amix=inputs=3:duration=first:dropout_transition=2[out]",
        "-map", "[out]",
        "-acodec", "libmp3lame",
        "-b:a", "192k",
        output_path
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    return result.returncode == 0

def main():
    print("=" * 60)
    print(f"Scene: {SCENE['name']}")
    print("=" * 60)

    with tempfile.TemporaryDirectory() as tmpdir:
        narration = os.path.join(tmpdir, "narration.mp3")
        sfx = os.path.join(tmpdir, "sfx.wav")
        music = os.path.join(tmpdir, "music.wav")
        output = os.path.join(os.path.expanduser("~"), "pig-health-monitor", "docs", "scene_composition.mp3")

        # 1. Generate narration with edge-tts
        print("\nStep 1: Narration (edge-tts)...")
        try:
            generate_with_edge(SCENE["narration"], narration)
            print("  Narration generated")
        except Exception as e:
            print(f"  Failed: {e}")

        # 2. Generate SFX with Bark
        print("\nStep 2: Sound Effects (Bark)...")
        try:
            sfx_text = " ".join(SCENE["sfx"])
            generate_with_bark(sfx_text, sfx)
            print("  SFX generated")
        except Exception as e:
            print(f"  Failed: {e}")

        # 3. Generate music with Bark
        print("\nStep 3: Background Music (Bark)...")
        try:
            generate_with_bark(SCENE["music"], music)
            print("  Music generated")
        except Exception as e:
            print(f"  Failed: {e}")

        # 4. Mix everything together
        print("\nStep 4: Mixing (ffmpeg)...")
        success = mix_audio(narration, sfx, music, output)
        if success:
            size = os.path.getsize(output) / 1024
            print(f"  Scene saved to {output}")
            print(f"  Size: {size:.0f} KB")
        else:
            print("  Mix failed")

    print("\n" + "=" * 60)
    if os.path.exists(output):
        print(f"DONE: {output}")
    else:
        print("FAILED")
    print("=" * 60)

if __name__ == "__main__":
    main()
