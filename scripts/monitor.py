#!/home/solrahk/.hermes/hermes-agent/venv/bin/python3
"""
PigPulse Collaborative Link Monitor — Daily Change Detection
Produces a polished TLDR report ready for direct delivery.

Canonical path: ~/pig-health-monitor/scripts/monitor.py
Output: ~/pig-health-monitor/docs/REPORT_LATEST.md
"""

import json
import os
import re
import subprocess
import sys
from datetime import datetime

HOME = os.path.expanduser("~")
REPORT_DIR = os.path.join(HOME, "pig-health-monitor", "docs")
REPORT_LATEST = os.path.join(REPORT_DIR, "REPORT_LATEST.md")
REPORT_PREVIOUS = os.path.join(REPORT_DIR, "REPORT_PREVIOUS.md")

# Source URLs
LINKS = {
    "gantt": "https://docs.google.com/spreadsheets/d/1D2RJ_avG1Dneyzgk04l2utfCH4hh84lrdqCAdSN5esM/edit",
    "checklist": "https://docs.google.com/document/d/1gIoC2biR0HfDfn-PDwc7xcxRnLEFokpEpp2YSPoy-ug/edit",
    "capstone": "https://docs.google.com/spreadsheets/d/1dhQRgKIwlTv7lFyXgfo84VtOYLvDgXWa4heh-6D_-EM/edit",
    "onedrive": "https://1drv.ms/w/c/9272348ac87b5645/IQCEtQsZDLghS7v1TAh9S8D2AWTQ6GaFFxaCBOuRiKOsEpw?e=mBIrJ7",
}

LOCAL_PATHS = {
    "concept": os.path.join(HOME, "pigpulse/docs/research/pig_health_monitor_concept_paper.md"),
    "briefing": os.path.join(HOME, "pigpulse/docs/research/capstone_holistic_briefing.md"),
    "matrix": os.path.join(HOME, "pigpulse/docs/reference/archive/capstone_decision_matrix.md"),
}

def fetch_gantt():
    url = "https://docs.google.com/spreadsheets/d/1D2RJ_avG1Dneyzgk04l2utfCH4hh84lrdqCAdSN5esM/export?format=csv"
    r = subprocess.run(["curl", "-sL", "--max-time", "30", url], capture_output=True, text=True)
    if r.returncode != 0 or len(r.stdout) < 50:
        return None, f"curl failed: {r.stderr[:100]}"
    return r.stdout, None

def fetch_checklist():
    url = "https://docs.google.com/document/d/1gIoC2biR0HfDfn-PDwc7xcxRnLEFokpEpp2YSPoy-ug/export?format=txt"
    r = subprocess.run(["curl", "-sL", "--max-time", "30", url], capture_output=True, text=True)
    if r.returncode != 0 or len(r.stdout) < 50:
        return None, f"curl failed: {r.stderr[:100]}"
    return r.stdout, None

def fetch_capstone():
    url = "https://docs.google.com/spreadsheets/d/1dhQRgKIwlTv7lFyXgfo84VtOYLvDgXWa4heh-6D_-EM/export?format=tsv"
    r = subprocess.run(["curl", "-sL", "--max-time", "30", url], capture_output=True, text=True)
    if r.returncode != 0 or len(r.stdout) < 50:
        return None, f"curl failed: {r.stderr[:100]}"
    return r.stdout, None

def ensure_chrome():
    """Start Chrome headless on port 9222 if not already running."""
    import urllib.request
    import time
    
    # Check if already running
    try:
        urllib.request.urlopen("http://127.0.0.1:9222/json/version", timeout=2)
        return True
    except Exception:
        pass
    
    # Kill any stale Chrome on 9222
    subprocess.run(["pkill", "-f", "remote-debugging-port=9222"], capture_output=True)
    time.sleep(1)
    
    # Start Chrome/Brave headless
    chrome_paths = [
        "/usr/bin/google-chrome-stable",
        "/usr/bin/google-chrome",
        "/opt/brave.com/brave/brave",
    ]
    chrome_cmd = None
    for path in chrome_paths:
        if os.path.exists(path):
            chrome_cmd = path
            break
    
    if not chrome_cmd:
        return False
    
    # Use headless mode for reliability
    subprocess.Popen(
        [chrome_cmd, "--headless=new", "--no-sandbox", "--disable-gpu",
         "--remote-debugging-port=9222", "--disable-dev-shm-usage",
         "--user-data-dir=/tmp/chrome-monitor"],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL
    )
    
    # Wait for Chrome to be ready (up to 30s)
    for _ in range(30):
        time.sleep(1)
        try:
            urllib.request.urlopen("http://127.0.0.1:9222/json/version", timeout=2)
            return True
        except Exception:
            pass
    
    # Final attempt without headless (for environments requiring display)
    subprocess.run(["pkill", "-f", "remote-debugging-port=9222"], capture_output=True)
    time.sleep(1)
    subprocess.Popen(
        [chrome_cmd, "--no-sandbox", "--disable-gpu",
         "--remote-debugging-port=9222", "--disable-dev-shm-usage",
         "--user-data-dir=/tmp/chrome-monitor"],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL
    )
    for _ in range(15):
        time.sleep(1)
        try:
            urllib.request.urlopen("http://127.0.0.1:9222/json/version", timeout=2)
            return True
        except Exception:
            pass
    
    return False

def fetch_onedrive():
    """Extract via Playwright CDP from Word Online DOM."""
    if not ensure_chrome():
        return None, "Chrome not available (could not start)"
    
    try:
        from playwright.sync_api import sync_playwright

        with sync_playwright() as p:
            browser = p.chromium.connect_over_cdp("http://127.0.0.1:9222")

            # Always create a fresh page to avoid stale DOM with destroyed pages
            page = browser.contexts[0].new_page()
            page.goto("https://1drv.ms/w/c/9272348ac87b5645/IQCEtQsZDLghS7v1TAh9S8D2AWTQ6GaFFxaCBOuRiKOsEpw?e=mBIrJ7", wait_until="domcontentloaded", timeout=45000)
            
            # Wait for Word Online iframe to fully render (can take 10-15s)
            page.wait_for_timeout(15000)
            # Additional wait for the iframe element itself
            try:
                page.wait_for_selector('iframe#WacFrame_Word_0', timeout=15000)
            except Exception:
                pass  # Will fail gracefully below if iframe never appears
            page.wait_for_timeout(3000)  # Final buffer for lazy loading

            # Extract via iframe — scroll through document to defeat lazy loading
            all_pages = {}
            seen_texts = set()  # Dedup by content hash
            iframe = page.frame_locator('#WacFrame_Word_0')
            
            # Use keyboard PageDown to scroll the document, then extract visible pages
            for scroll_num in range(30):  # Max 30 scrolls for ~20 pages
                pages = iframe.locator('div.Page')
                current_count = pages.count()
                
                # Extract visible pages
                for i in range(current_count):
                    try:
                        el = pages.nth(i)
                        el.scroll_into_view_if_needed()
                        page.wait_for_timeout(100)
                        text = el.inner_text()
                        if text.strip():
                            # Deduplicate by first 100 chars
                            key = text[:100].strip()
                            if key not in seen_texts:
                                seen_texts.add(key)
                                all_pages[len(seen_texts)] = text.strip()
                    except Exception:
                        pass
                
                # Scroll document down using keyboard
                page.keyboard.press('PageDown')
                page.wait_for_timeout(500)
            
            full_text = "\n\n".join(all_pages.get(i, "") for i in sorted(all_pages.keys()))
            
            # Close the page to free memory
            page.close()
            
            return full_text, None
    except Exception as e:
        return None, str(e)

def fetch_local(path):
    if not os.path.exists(path):
        return None, f"File not found: {path}"
    with open(path) as f:
        return f.read(), None

def diff_text(old, new):
    """Return list of changed lines."""
    if not old or not new:
        return []
    old_lines = set(l.strip() for l in old.split('\n') if l.strip() and len(l.strip()) > 5)
    new_lines = set(l.strip() for l in new.split('\n') if l.strip() and len(l.strip()) > 5)
    added = sorted(new_lines - old_lines)[:10]
    removed = sorted(old_lines - new_lines)[:10]
    return added, removed

def gen_tts(text):
    """Generate TTS audio file."""
    try:
        from edge_tts import Communicate
        import asyncio

        output = "/tmp/pigpulse_today.mp3"
        async def _tts():
            c = Communicate(text, "en-US-AriaNeural")
            await c.save(output)
        asyncio.run(_tts())
        return output
    except Exception as e:
        return None

def main():
    os.makedirs(REPORT_DIR, exist_ok=True)

    # Load previous data
    prev_data = {}
    if os.path.exists(REPORT_PREVIOUS):
        with open(REPORT_PREVIOUS) as f:
            prev_text = f.read()
        # Parse sections
        for section in re.split(r'^## ', prev_text, flags=re.MULTILINE)[1:]:
            lines = section.split('\n', 1)
            if len(lines) == 2:
                prev_data[lines[0].strip()] = lines[1]

    # Fetch all sources
    results = {}

    print("[Fetch] 📊 Gantt Chart...")
    text, err = fetch_gantt()
    results["gantt"] = {"name": "📊 Gantt Chart", "text": text, "error": err, "link": LINKS["gantt"], "words": len(text.split()) if text else 0, "chars": len(text) if text else 0}

    print("[Fetch] 📝 Google Docs Checklist...")
    text, err = fetch_checklist()
    results["checklist"] = {"name": "📝 Google Docs Checklist", "text": text, "error": err, "link": LINKS["checklist"], "words": len(text.split()) if text else 0, "chars": len(text) if text else 0}

    print("[Fetch] ✅ Capstone Checklist...")
    text, err = fetch_capstone()
    results["capstone"] = {"name": "✅ Capstone Checklist", "text": text, "error": err, "link": LINKS["capstone"], "words": len(text.split()) if text else 0, "chars": len(text) if text else 0}

    print("[Fetch] 📕 OneDrive Manuscript...")
    text, err = fetch_onedrive()
    # Self-heal: if OneDrive fails, restart Chrome and retry
    if err or not text or len(text) < 500:
        print("\n[Self-Heal] OneDrive fetch failed. Restarting Chrome and retrying...")
        import time
        subprocess.run(["pkill", "-f", "remote-debugging-port=9222"], capture_output=True)
        time.sleep(3)
        text, err = fetch_onedrive()
        if err or not text or len(text) < 500:
            print(f"[Self-Heal] Retry failed: {err}")
    results["onedrive"] = {"name": "📕 OneDrive Manuscript", "text": text, "error": err, "link": LINKS["onedrive"], "words": len(text.split()) if text else 0, "chars": len(text) if text else 0}

    print("[Fetch] 📄 Concept Paper...")
    text, err = fetch_local(LOCAL_PATHS["concept"])
    results["concept"] = {"name": "📄 Concept Paper", "text": text, "error": err, "path": LOCAL_PATHS["concept"], "words": len(text.split()) if text else 0, "chars": len(text) if text else 0}

    print("[Fetch] 📄 Holistic Briefing...")
    text, err = fetch_local(LOCAL_PATHS["briefing"])
    results["briefing"] = {"name": "📄 Holistic Briefing", "text": text, "error": err, "path": LOCAL_PATHS["briefing"], "words": len(text.split()) if text else 0, "chars": len(text) if text else 0}

    print("[Fetch] 📄 Decision Matrix...")
    text, err = fetch_local(LOCAL_PATHS["matrix"])
    results["matrix"] = {"name": "📄 Decision Matrix", "text": text, "error": err, "path": LOCAL_PATHS["matrix"], "words": len(text.split()) if text else 0, "chars": len(text) if text else 0}

    # Build report
    now = datetime.now().strftime("%B %d, %Y — %I:%M %p")
    total_chars = sum(r["chars"] for r in results.values())
    total_words = sum(r["words"] for r in results.values())

    report = f"# 📊 PigPulse — Daily Update\n\n**{now}**\n\n---\n\n"
    report += f"**Total:** {total_words:,} words | {total_chars:,} chars\n\n"

    # Summary of changes
    changes_found = []
    for key, r in results.items():
        prev_text = prev_data.get(r["name"], "")
        if prev_text and r["text"]:
            added, removed = diff_text(prev_text, r["text"])
            if added or removed:
                changes_found.append(f"- **{r['name']}**: {len(added)} additions, {len(removed)} removals")

    if changes_found:
        report += "## 🔄 Changes Since Last Run\n\n"
        report += "\n".join(changes_found) + "\n\n"
    else:
        report += "## 🔄 Changes Since Last Run\n\n[No significant changes detected]\n\n"

    report += "---\n\n"

    # Each source
    order = ["gantt", "checklist", "capstone", "onedrive", "concept", "briefing", "matrix"]
    for key in order:
        r = results[key]
        report += f"## {r['name']}\n\n"

        if "link" in r:
            report += f"🔗 **Live:** [{r['link']}]({r['link']})\n\n"
        if "path" in r:
            report += f"📄 **Path:** `{r['path']}`\n\n"

        report += f"📊 **Stats:** {r['words']:,} words | {r['chars']:,} chars\n\n"

        if r["text"]:
            # For OneDrive manuscript (long), show more + extract structure
            if key == "onedrive" and len(r["text"]) > 5000:
                limit = 8000
                # Extract chapter/section headers for structure summary
                headers = re.findall(r'(?m)^(?:CHAPTER|Chapter|CHPTR|Chptr|ABSTRACT|Abstract|INTRODUCTION|Introduction|METHODOLOGY|Methodology|RESULTS|Results|DISCUSSION|Discussion|CONCLUSION|Conclusion|ACKNOWLEDGEMENT|Acknowledgement|TABLE OF CONTENTS|Table of Contents|REVIEW OF RELATED LITERATURE|Review of Related Literature|CONCEPTUAL FRAMEWORK|Conceptual Framework|SYSTEM ARCHITECTURE|System Architecture)\s*(.*)$', r["text"])
                if headers:
                    report += "### 📋 Document Structure:\n"
                    for h in headers[:12]:
                        report += f"- **{h.strip()}**\n"
                    report += "\n"
                # Extract first ~800 chars of each chapter for progress tracking
                chapter_starts = [(m.start(), m.group()) for m in re.finditer(r'(?m)^(?:CHAPTER)\s+\d', r["text"])]
                if chapter_starts:
                    report += "### 📝 Chapter Progress (latest content from each):\n\n"
                    for i, (pos, header) in enumerate(chapter_starts):
                        end_pos = chapter_starts[i+1][0] if i+1 < len(chapter_starts) else len(r["text"])
                        chunk = r["text"][pos:end_pos]
                        # Clean up: remove excessive whitespace/newlines
                        chunk = re.sub(r'\n{3,}', '\n\n', chunk)
                        chunk = re.sub(r'[ \t]+', ' ', chunk)
                        # Show last 1500 chars (latest progress) instead of first
                        show_len = 1500
                        if len(chunk) > show_len:
                            display = "...(earlier content)...\n\n" + chunk[-show_len:]
                        else:
                            display = chunk
                        report += f"**{header.strip()}**\n"
                        report += f">{display.strip()}\n\n"
                body = r["text"][:limit]
                if len(r["text"]) > limit:
                    body += f"\n\n... *(showing first {limit:,} of {len(r['text']):,} chars — continues through later chapters)*"
                report += f"### Content:\n\n{body}\n\n"
            else:
                limit = 3000 if key != "onedrive" else 8000
                body = r["text"][:limit]
                if len(r["text"]) > limit:
                    body += f"\n\n... *(showing first {limit:,} of {len(r['text']):,} chars)*"
                report += f"### Content:\n\n{body}\n\n"
        elif r.get("error"):
            report += f"⚠️ Error: {r['error']}\n\n"
        else:
            report += "⚠️ Failed to fetch\n\n"

        # Diff
        prev_text = prev_data.get(r["name"], "")
        if prev_text and r["text"]:
            added, removed = diff_text(prev_text, r["text"])
            if added or removed:
                report += "### 🔄 Changes:\n"
                for a in added[:5]:
                    report += f"  + {a[:120]}\n"
                for rm in removed[:5]:
                    report += f"  - {rm[:120]}\n"
                report += "\n"

        report += "---\n\n"

    # TLDR section
    report += "## 🎯 TLDR\n\n"
    report += "1. **Gantt Chart**: "
    if results["gantt"]["text"]:
        report += f"{results['gantt']['words']} words — project timeline active\n"
    else:
        report += "FAILED TO FETCH\n"

    report += "2. **Checklist**: "
    if results["checklist"]["text"]:
        # Extract key concerns
        concerns = [l for l in results["checklist"]["text"].split('\n') if '?' in l and len(l) > 20]
        report += f"{results['checklist']['words']} words, {len(concerns)} concerns noted\n"
    else:
        report += "FAILED TO FETCH\n"

    report += "3. **Capstone Status**: "
    if results["capstone"]["text"]:
        falses = results["capstone"]["text"].count("FALSE")
        trues = results["capstone"]["text"].count("TRUE")
        report += f"{falses} incomplete, {trues} complete\n"
    else:
        report += "FAILED TO FETCH\n"

    report += "4. **OneDrive Manuscript**: "
    if results["onedrive"]["text"]:
        report += f"{results['onedrive']['words']} words — "
        if "(i suwat" in results["onedrive"]["text"] or "ras pi ba" in results["onedrive"]["text"]:
            report += "⚠️ ABSTRACT STILL HAS PLACEHOLDERS\n"
        else:
            report += "No placeholders detected\n"
    else:
        report += "FAILED TO FETCH\n"

    report += "5. **Local Files**: "
    local_ok = sum(1 for k in ["concept", "briefing", "matrix"] if results[k]["text"])
    report += f"{local_ok}/3 fetched successfully\n"

    # Save report
    # First, move current to previous
    if os.path.exists(REPORT_LATEST):
        shutil.copy2(REPORT_LATEST, REPORT_PREVIOUS)

    with open(REPORT_LATEST, 'w') as f:
        f.write(report)

    print(f"\n✓ Report saved to {REPORT_LATEST}")
    print(f"✓ Previous report saved to {REPORT_PREVIOUS}")

if __name__ == "__main__":
    import shutil
    main()
