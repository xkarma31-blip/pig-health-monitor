#!/usr/bin/env python3
import os
import shutil
import re

# Paths definition
SOUL_APP_DIR = "/home/solrahk/.gemini/antigravity/scratch/soul-expo-app"
CAPSTONE_DIR = "/home/solrahk/.gemini/antigravity/scratch/shikigami_memory/capstone_pig_health_monitor"
TARGET_MOBILE_DIR = os.path.join(CAPSTONE_DIR, "mobile_app")
TARGET_SRC_DIR = os.path.join(TARGET_MOBILE_DIR, "src")
BACKUP_DIR = "/tmp/mobile_app_src_backup"

print("🔄 Starting Sovereign Aqua Protocol Revamp Sync Ritual...")

# 1. Back up the current src directory
if os.path.exists(BACKUP_DIR):
    shutil.rmtree(BACKUP_DIR)
shutil.copytree(TARGET_SRC_DIR, BACKUP_DIR)
print(f"✅ Backed up current src to {BACKUP_DIR}")

# 2. Safely clean directories in target that will be completely overwritten
clean_dirs = ["app", "constants", "data", "hooks"]
for d in clean_dirs:
    target_path = os.path.join(TARGET_SRC_DIR, d)
    if os.path.exists(target_path):
        shutil.rmtree(target_path)
    print(f"🗑️ Cleaned old {d} directory in capstone")

# 3. Copy direct directories from revamped soul-expo-app
for d in clean_dirs:
    src_path = os.path.join(SOUL_APP_DIR, d)
    target_path = os.path.join(TARGET_SRC_DIR, d)
    if os.path.exists(src_path):
        shutil.copytree(src_path, target_path)
    print(f"📥 Copied revamped {d} from soul-expo-app")

# 4. Copy components (overwriting, but preserving Layout and Navigation)
src_components = os.path.join(SOUL_APP_DIR, "components")
target_components = os.path.join(TARGET_SRC_DIR, "components")
for item in os.listdir(src_components):
    s_item = os.path.join(src_components, item)
    t_item = os.path.join(target_components, item)
    if os.path.isfile(s_item):
        shutil.copy2(s_item, t_item)
print("📥 Merged revamped components (preserved custom Layout and Navigation folders)")

# 5. Overwrite global configs (preserving package.json with merged dependencies)
shutil.copy2(os.path.join(SOUL_APP_DIR, "app.json"), os.path.join(TARGET_MOBILE_DIR, "app.json"))
shutil.copy2(os.path.join(SOUL_APP_DIR, "tsconfig.json"), os.path.join(TARGET_MOBILE_DIR, "tsconfig.json"))
print("⚙️ Overwrote package.json, app.json, and tsconfig.json with revamped configs")

# 6. Write the bridged real Firebase auth utility (src/utils/auth.ts)
auth_ts_path = os.path.join(TARGET_SRC_DIR, "utils", "auth.ts")
auth_ts_content = """import { useState, useEffect } from 'react';
import { auth } from './firebase';
import { onAuthStateChanged, User, signOut as fbSignOut } from 'firebase/auth';

let currentUser: User | null = null;
const listeners: Set<() => void> = new Set();

// Listen to real Firebase Auth
onAuthStateChanged(auth, (user) => {
  currentUser = user;
  listeners.forEach(l => l());
});

export const setAuthUser = async (user: any) => {
  if (user === null) {
    await fbSignOut(auth);
  }
};

export const getAuthUser = () => currentUser;

export function useAuth() {
  const [user, setUser] = useState<User | null>(currentUser);
  
  useEffect(() => {
    const listener = () => setUser(currentUser);
    listeners.add(listener);
    setUser(currentUser); // Sync initial state
    return () => { listeners.delete(listener); };
  }, []);
  
  return user;
}
"""
os.makedirs(os.path.dirname(auth_ts_path), exist_ok=True)
with open(auth_ts_path, "w") as f:
    f.write(auth_ts_content)
print("🛡️ Created bridged real Firebase Auth utility (src/utils/auth.ts)")

# 7. Apply ResponsiveLayout to all new tab screens to bring back the desktop sidebar
tab_screens = ["index.tsx", "events.tsx", "analytics.tsx", "nodes.tsx"]
for screen in tab_screens:
    screen_path = os.path.join(TARGET_SRC_DIR, "app", "(tabs)", screen)
    if os.path.exists(screen_path):
        with open(screen_path, "r") as f:
            content = f.read()
        
        # Add ResponsiveLayout import if missing
        if "ResponsiveLayout" not in content:
            # Insert import after Theme or other imports
            content = re.sub(
                r"(import\s+.*from\s+'\.\./\.\./constants/Theme';)",
                r"\1\nimport { ResponsiveLayout } from '../../components/Layout/ResponsiveLayout';",
                content
            )
            
            # Wrap the JSX in ResponsiveLayout
            # Find the return ( ... ); structure and wrap inside
            match = re.search(r"return\s*\(\s*(<ScrollView.*?>|<View.*?>)", content, re.DOTALL)
            if match:
                opening_tag = match.group(1)
                content = content.replace(
                    f"return ({opening_tag}",
                    f"return (\n    <ResponsiveLayout>\n      {opening_tag}"
                )
                
                # Replace the closing parenthesis for ScrollView/View
                # Find trailing tag and close
                if "<ScrollView" in opening_tag:
                    content = re.sub(r"(</ScrollView>\s*\);)", r"</ScrollView>\n    </ResponsiveLayout>\n  );", content)
                elif "<View" in opening_tag:
                    content = re.sub(r"(</View>\s*\);)", r"</View>\n    </ResponsiveLayout>\n  );", content)

        with open(screen_path, "w") as f:
            f.write(content)
        print(f"📱 Patched {screen} to include desktop ResponsiveLayout")

# 8. Update Sidebar.tsx links to match the revamped tab paths
sidebar_path = os.path.join(TARGET_SRC_DIR, "components", "Navigation", "Sidebar.tsx")
if os.path.exists(sidebar_path):
    with open(sidebar_path, "r") as f:
        content = f.read()
    
    # Replace NAV_ITEMS list
    old_nav_items = """const NAV_ITEMS = [
  { label: 'Monitor', path: '/dashboard', emoji: '📡' },
  { label: 'Alerts', path: '/alerts', emoji: '🔔' },
  { label: 'Roster', path: '/roster', emoji: '🐷' },
  { label: 'Sensors', path: '/sensors', emoji: '🌡️' },
  { label: 'Advisor', path: '/advisor', emoji: '🤖' },
];"""
    
    new_nav_items = """const NAV_ITEMS = [
  { label: 'Home', path: '/', emoji: '🏠' },
  { label: 'Events', path: '/events', emoji: '🔔' },
  { label: 'Analytics', path: '/analytics', emoji: '📈' },
  { label: 'Nodes', path: '/nodes', emoji: '📡' },
];"""
    
    content = content.replace(old_nav_items, new_nav_items)
    
    # Replace active highlighting logic to match '/' for index
    content = content.replace(
        "(item.path === '/dashboard' && (pathname === '/(tabs)' || pathname === '/(tabs)/dashboard'));",
        "(item.path === '/' && (pathname === '/(tabs)' || pathname === '/(tabs)/index' || pathname === '/'));"
    )
    
    with open(sidebar_path, "w") as f:
        f.write(content)
    print("🐗 Patched Sidebar.tsx with revamped nav routes and highlights")

# 9. Overwrite the top-level app/_layout.tsx with push notification registration + initialization spinner
root_layout_path = os.path.join(TARGET_SRC_DIR, "app", "_layout.tsx")
root_layout_content = """import { Slot } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useState, useEffect } from 'react';
import { View, ActivityIndicator, TouchableOpacity, Text, StyleSheet, useWindowDimensions } from 'react-native';
import { Theme } from '../constants/Theme';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../utils/firebase';
import { registerForPushNotificationsAsync } from '../utils/notifications';
import AdvisorModal from '../components/AdvisorModal';

export default function RootLayout() {
  const [initializing, setInitializing] = useState(true);
  const [advisorVisible, setAdvisorVisible] = useState(false);
  const { width } = useWindowDimensions();

  // Desktop threshold
  const isDesktop = width > 768;
  const maxWidth = 800;

  useEffect(() => {
    // Register Push Notifications on Mount
    registerForPushNotificationsAsync().catch(console.error);

    // Initial Firebase Auth Check
    const subscriber = onAuthStateChanged(auth, () => {
      if (initializing) setInitializing(false);
    });
    return subscriber; // unsubscribe on unmount
  }, []);

  if (initializing) {
    return (
      <View style={{ flex: 1, backgroundColor: Theme.colors.background, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color={Theme.colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.outerBackground}>
      <StatusBar style="light" />
      
      {/* Centered container for Desktop */}
      <View style={[
        styles.appContainer,
        isDesktop && { 
          width: maxWidth, 
          alignSelf: 'center', 
          marginVertical: Theme.spacing.lg, 
          borderRadius: Theme.borderRadius.xl, 
          overflow: 'hidden', 
          elevation: 20, 
          shadowColor: '#000', 
          shadowOffset: { width: 0, height: 10 }, 
          shadowOpacity: 0.5, 
          shadowRadius: 30 
        }
      ]}>
        <Slot />
        
        {/* Floating Advisor FAB - Pinned to the inside of the container */}
        <TouchableOpacity 
          style={styles.fab} 
          activeOpacity={0.7}
          onPress={() => setAdvisorVisible(true)}
        >
          <Text style={styles.fabIcon}>💬</Text>
        </TouchableOpacity>
      </View>

      <AdvisorModal 
        visible={advisorVisible} 
        onClose={() => setAdvisorVisible(false)} 
      />
    </View>
  );
}

const styles = StyleSheet.create({
  outerBackground: {
    flex: 1,
    backgroundColor: '#05050A', 
    justifyContent: 'center',
  },
  appContainer: {
    flex: 1,
    backgroundColor: Theme.colors.background,
    width: '100%',
  },
  fab: {
    position: 'absolute',
    bottom: 95, 
    right: 24,
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: Theme.colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: Theme.colors.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 20,
    elevation: 12,
    borderWidth: 2,
    borderColor: Theme.colors.primary,
  },
  fabIcon: {
    fontSize: 32,
  }
});
"""
with open(root_layout_path, "w") as f:
    f.write(root_layout_content)
print("🏗️ Overwrote Root Layout (app/_layout.tsx) with push notifications and global overlays")

# 10. Update the Login screen (app/login.tsx) to connect real Firebase authentication
login_path = os.path.join(TARGET_SRC_DIR, "app", "login.tsx")
if os.path.exists(login_path):
    with open(login_path, "r") as f:
        login_content = f.read()
        
    # Replace handleLogin logic with Firebase sign in
    real_login_logic = """  const handleLogin = async () => {
    if (!email || !password) {
      Alert.alert('Error', 'Please enter both email and password.');
      return;
    }

    setLoading(true);
    try {
      const { signInWithEmailAndPassword } = await import('firebase/auth');
      const { auth } = await import('../utils/firebase');
      await signInWithEmailAndPassword(auth, email.trim(), password);
      Alert.alert('Success', 'Connected to Sovereign Aqua Protocol.');
      router.back();
    } catch (err: any) {
      Alert.alert('Authentication Failed', err.message || 'Invalid credentials or API keys missing.');
    } finally {
      setLoading(false);
    }
  };"""
  
    # Find handleLogin function block and replace it
    login_content = re.sub(
        r"const handleLogin = async \(\) => \{.*?^\s*\};",
        real_login_logic,
        login_content,
        flags=re.DOTALL | re.MULTILINE
    )
    
    with open(login_path, "w") as f:
        f.write(login_content)
    print("🔑 Connected real Firebase Auth login method to app/login.tsx")

# 11. Overwrite (tabs)/_layout.tsx to support desktop responsive side hiding
tabs_layout_path = os.path.join(TARGET_SRC_DIR, "app", "(tabs)", "_layout.tsx")
if os.path.exists(tabs_layout_path):
    with open(tabs_layout_path, "r") as f:
        tabs_layout = f.read()
    
    # Inject desktop state to hide bottom tabs on wide viewports
    tabs_layout = tabs_layout.replace(
        "import { useAuth, setAuthUser } from '../../utils/auth';",
        "import { useAuth, setAuthUser } from '../../utils/auth';\nimport { useWindowDimensions } from 'react-native';"
    )
    
    tabs_layout = tabs_layout.replace(
        "export default function TabLayout() {",
        "export default function TabLayout() {\n  const { width } = useWindowDimensions();\n  const isDesktop = width >= 768;"
    )
    
    # Hide tab bar and headers on desktop
    tabs_layout = tabs_layout.replace(
        "tabBarStyle: {\n          backgroundColor: Theme.colors.tabBar,\n          borderTopColor: Theme.colors.cardBorder,\n          height: 64,\n          paddingBottom: 8,\n          paddingTop: 8,\n        },",
        "tabBarStyle: {\n          backgroundColor: Theme.colors.tabBar,\n          borderTopColor: Theme.colors.cardBorder,\n          height: 64,\n          paddingBottom: 8,\n          paddingTop: 8,\n          display: isDesktop ? 'none' : 'flex',\n        },\n        headerShown: !isDesktop,"
    )
    
    with open(tabs_layout_path, "w") as f:
        f.write(tabs_layout)
    print("🎨 Integrated desktop responsiveness adjustments in app/(tabs)/_layout.tsx")

print("✨ Sovereign Aqua Protocol Sync Ritual Complete!")
