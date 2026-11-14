/**
 * Static image imports (Metro's asset transformer).
 *
 * `import icon from '../../assets/icon.png'` needs a module declaration;
 * without it TypeScript cannot resolve the asset and the import fails to
 * compile. The `require()` form worked but trips no-require-imports, so the
 * typed static import is the supported way.
 */
declare module '*.png' {
  import type { ImageSourcePropType } from 'react-native';
  const content: ImageSourcePropType;
  export default content;
}

declare module '*.jpg' {
  import type { ImageSourcePropType } from 'react-native';
  const content: ImageSourcePropType;
  export default content;
}
