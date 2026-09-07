/**
 * Type augmentation for `getReactNativePersistence` from `firebase/auth`.
 *
 * The `firebase/auth` subpath has no `exports` map, so TypeScript always
 * resolves its browser-flavored typings (`dist/auth/index.d.ts`), which omit
 * this export — even though Metro resolves the `react-native` build at runtime
 * on devices. Declaring it here keeps the import type-safe on native.
 */
import type { Persistence } from 'firebase/auth';

declare module 'firebase/auth' {
  export interface ReactNativeAsyncStorage {
    setItem(key: string, value: string): Promise<void>;
    getItem(key: string): Promise<string | null>;
    removeItem(key: string): Promise<void>;
  }

  export function getReactNativePersistence(
    storage: ReactNativeAsyncStorage
  ): Persistence;
}