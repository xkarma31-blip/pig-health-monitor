#!/usr/bin/env python3
"""
PigPulse Scene Composer v2
Uses Bark (vocals/sfx/music) + edge-tts (narration) + ffmpeg (mix)
"""
import subprocess
import os
import sys
import tempfile
import time

# Use the venv that has bark
VENV = os.path.expanduser("~/.shikigami/venv")
PYTHON = os.path.join(VENV, "bin", "python3")

SCENE = {
    "name": "PigPulse Farm Dawn",
    "narration": "Dawn breaks over the pig pen. The Sentinel thermal camera activates, scanning for signs of distress. A piglet coughs. The system flags it for review.",
    "sfx": [
        "rooster crowing in distance",
        "light morning breeze",
        "soft pig grunts"
    ],
    "music": "calm ambient morning music, soft piano, nature documentary style",
}

def run_py(code, label=""):
    """Run Python code in the bark venv."""
    t = time.time()
    print(f"  [{label}] Running...", flush=True)
    result = subprocess.run(
        [PYTHON, "-c", code],
        capture_output=True, text=True, timeout=300
    )
    elapsed = time.time() - t
    if result.returncode != 0:
        print(f"  [{label}] FAILED ({elapsed:.1f}s): {result.stderr[-300:]}")
        return False
    print(f"  [{label}] Done ({elapsed:.1f}s)", flush=True)
    return True

def gen_narration(output_path):
    """Narration via edge-tts (fast)."""
    code = f"""
import asyncio, edge_tts
async def main():
    comm = edge_tts.Communicate({repr(SCENE['narration'])}, "en-US-GuyNeural", rate="+10%")
    await comm.save({repr(output_path)})
asyncio.run(main())
print("narration saved")
"""
    return run_py(code, "narration")

def gen_sfx(text, output_path, label="sfx"):
    """SFX via Bark (keep short!)."""
    code = f"""
import wave, numpy as np
from bark import generate_audio, SAMPLE_RATE
audio = generate_audio({repr(text)}, history_prompt="v2/en_speaker_9")
with wave.open({repr(output_path)}, 'w') as wav:
    wav.setnchannels(1)
    wav.setsampwidth(2)
    wav.setframerate(SAMPLE_RATE)
    audio_int16 = (audio * 32767).astype(np.int16)
    wav.writeframes(audio_int16.tobytes())
print(f"{label}: {{len(audio)/SAMPLE_RATE:.1f}}s")
"""
    return run_py(code, label)

def gen_music(output_path):
    """Background music via Bark."""
    code = f"""
import wave, numpy as np
from bark import generate_audio, SAMPLE_RATE
audio = generate_audio({repr(SCENE['music'])}, history_prompt="v2/en_speaker_9")
with wave.open({repr(output_path)}, 'w') as wav:
    wav.setnchannels(1)
    wav.setsampwidth(2)
    wav.setframerate(SAMPLE_RATE)
    audio_int16 = (audio * 32767).astype(np.int16)
    wav.writeframes(audio_int16.tobytes())
print(f"music: {{len(audio)/SAMPLE_RATE:.1f}}s")
"""
    return run_py(code, "music")

def mix(narration, sfx, music, output):
    """Mix all tracks with ffmpeg."""
    cmd = [
        "ffmpeg", "-y",
        "-i", narration,
        "-i", sfx,
        "-i", music,
        "-filter_complex",
        "[1:a]volume=0.4[sfx];[2:a]volume=0.2[music];[0:a][sfx][music]amix=inputs=3:duration=first:dropout_transition=2[out]",
        "-map", "[out]",
        "-acodec", "libmp3lame", "-b:a", "192k",
        output
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    return result.returncode == 0

def main():
    print("=" * 60)
    print(f"Scene: {SCENE['name']}")
    print(f"Python: {PYTHON}")
    print("=" * 60)

    with tempfile.TemporaryDirectory() as tmpdir:
        narration = os.path.join(tmpdir, "narration.mp3")
        sfx = os.path.join(tmpdir, "sfx.wav")
        music = os.path.join(tmpdir, "music.wav")
        output = os.path.join(
            os.path.expanduser("~"), "pig-health-monitor", "docs", "scene_composition.mp3"
        )

        # 1. Narration (edge-tts, fast)
        print("\n[1/4] Narration (edge-tts)...")
        gen_narration(narration)

        # 2. SFX (Bark) — combine into one short generation
        print("\n[2/4] Sound Effects (Bark)...")
        sfx_text = ". ".join(SCENE["sfx"])
        gen_sfx(sfx_text, sfx, "sfx")

        # 3. Music (Bark)
        print("\n[3/4] Background Music (Bark)...")
        gen_music(music)

        # 4. Mix
        print("\n[4/4] Mixing (ffmpeg)...")
        success = mix(narration, sfx, music, output)
        if success:
            size = os.path.getsize(output) / 1024
            print(f"\n✓ Scene saved: {output}")
            print(f"  Size: {size:.0f} KB")
        else:
            print("\n✗ Mix failed")

    print("\n" + "=" * 60)

if __name__ == "__main__":
    main()
