// Vite resolves `?url` imports to the emitted asset's URL.
declare module "elkjs/lib/elk-worker.min.js?url" {
  const url: string;
  export default url;
}
