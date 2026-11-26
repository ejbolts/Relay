// The web's shared modules import their images from frontend/src/assets (exerciseIcons.ts).
// Metro bundles each as an image asset, whose module is an image source rather than Vite's URL.
declare module '*.webp' {
  const source: number;
  export default source;
}
