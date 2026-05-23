#!/usr/bin/env python3
import os

TAB_DIR = "/home/solrahk/.gemini/antigravity/scratch/shikigami_memory/capstone_pig_health_monitor/mobile_app/src/app/(tabs)"

print("🛠️ Starting ResponsiveLayout Fix Script...")

# 1. Fix index.tsx
index_path = os.path.join(TAB_DIR, "index.tsx")
if os.path.exists(index_path):
    with open(index_path, "r") as f:
        content = f.read()
    
    # Check if opening tag is missing
    if "return (\n    <ScrollView" in content:
        content = content.replace(
            "return (\n    <ScrollView style={styles.container}",
            "return (\n    <ResponsiveLayout>\n      <ScrollView style={styles.container}"
        )
        print("✅ Fixed index.tsx opening wrapper")
    
    with open(index_path, "w") as f:
        f.write(content)

# 2. Fix events.tsx, analytics.tsx, nodes.tsx
for screen in ["events.tsx", "analytics.tsx", "nodes.tsx"]:
    screen_path = os.path.join(TAB_DIR, screen)
    if os.path.exists(screen_path):
        with open(screen_path, "r") as f:
            content = f.read()
        
        # Lock screen opening tag
        lock_old = "if (!user) {\n    return (\n      <View style={styles.lockContainer}>"
        lock_new = "if (!user) {\n    return (\n      <ResponsiveLayout>\n        <View style={styles.lockContainer}>"
        if lock_old in content:
            content = content.replace(lock_old, lock_new)
            print(f"✅ Fixed {screen} lock screen opening wrapper")
        
        # Main screen opening tag
        main_old = "return (\n    <ScrollView style={styles.container}"
        main_new = "return (\n    <ResponsiveLayout>\n      <ScrollView style={styles.container}"
        if main_old in content:
            content = content.replace(main_old, main_new)
            print(f"✅ Fixed {screen} main screen opening wrapper")
            
        # Main screen closing tag
        closing_old = "    </ScrollView>\n  );\n}"
        closing_new = "    </ScrollView>\n    </ResponsiveLayout>\n  );\n}"
        if closing_old in content:
            content = content.replace(closing_old, closing_new)
            print(f"✅ Fixed {screen} main screen closing wrapper")
            
        with open(screen_path, "w") as f:
            f.write(content)

print("✨ ResponsiveLayout Fix Complete!")
