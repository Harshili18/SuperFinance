/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** API origin for split FE/API hosting. Empty = same-origin /proxy. */
  readonly VITE_API_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
